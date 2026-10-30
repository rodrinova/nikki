import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Face } from '@/brand/Face';
import { Loading } from '@/ui/lazy';
import { MODULES, moduleName } from '@/lib/modules';
import { ago, fillWeeks, hoursLabel, shortDate } from '@/lib/admin';
import { todayStr } from '@/lib/dates';
import { Shot, statusClass, type Ticket, type TicketStatus } from './Tickets';
import { Top } from './Home';

// Painel de administração da app (só o Rodrigo). Vem tudo das funções nikki.admin_*: contas, casas, módulos,
// datas e tickets. Nunca dinheiro, agendas, compras, carros, objetivos ou medidas.

type Status = 'pending' | 'active' | 'paused' | 'declined';
interface Person {
  id: string; name: string; email: string | null; status: Status; created_at: string; approved_at: string | null; approved_via: string | null;
  last_seen_at: string | null; request: { house: string; note: string | null } | null; requested_at: string | null; admin: boolean;
  houses: { id: string; name: string; role: 'admin' | 'member'; joined_at: string }[]; tickets: number;
}
interface HouseInfo { id: string; name: string; created_at: string; members: { name: string; role: string; joined_at: string }[]; modules: { module: string; since: string }[] }
interface Kpis {
  accounts: Record<Status, number>; first_account: string | null; houses: number; houses_two: number; seen_7d: number; seen_30d: number;
  approval_hours: number | null; signups: { week: string; n: number }[]; modules: { module: string; houses: number; since: string }[];
  tickets: Record<TicketStatus, number>;
}
interface AdminTicket extends Ticket { by: string; email: string | null }

const ST: Record<Status, string> = { pending: 'À espera', active: 'Ativa', paused: 'Em pausa', declined: 'Recusada' };
const TK: Record<TicketStatus, string> = { novo: 'Novo', 'a ver': 'A ver', feito: 'Feito', nao: 'Não' };
const TABS = ['pedidos', 'pessoas', 'casas', 'tickets', 'numeros'] as const;
type Tab = (typeof TABS)[number];

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function useAdminData() {
  const [d, setD] = useState<{ people: Person[]; houses: HouseInfo[]; kpis: Kpis; tickets: AdminTicket[] } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const [people, houses, kpis, tickets] = await Promise.all([call<Person[]>('admin_people'), call<HouseInfo[]>('admin_houses'), call<Kpis>('admin_kpis'), call<AdminTicket[]>('admin_tickets')]);
      setD({ people, houses, kpis, tickets }); setErr('');
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    load();
    const again = () => { if (document.visibilityState === 'visible') load(); };
    addEventListener('focus', again); document.addEventListener('visibilitychange', again);
    return () => { removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [load]);
  return { d, setD, err, load };
}

/** Para o início e o perfil do administrador: pedidos à espera e tickets novos. */
export function Admin() {
  const { d, setD, err, load } = useAdminData();
  const [tab, setTab] = useState<Tab | null>(null);
  const pending = d?.people.filter((p) => p.status === 'pending') ?? [];
  // Abre nos pedidos se houver algum à espera; depois fica no separador escolhido (não salta ao aprovar o último).
  const loaded = !!d, asked = pending.some((p) => p.request);
  useEffect(() => { if (loaded) setTab((t) => t ?? (asked ? 'pedidos' : 'numeros')); }, [loaded, asked]);
  const cur: Tab = tab ?? 'pedidos';
  const label: Record<Tab, string> = {
    pedidos: `Pedidos${pending.length ? ` · ${pending.length}` : ''}`, pessoas: 'Pessoas', casas: 'Casas',
    tickets: `Tickets${d?.kpis.tickets.novo ? ` · ${d.kpis.tickets.novo}` : ''}`, numeros: 'Números',
  };
  return (
    <>
      <Top title="Administração" />
      <p className="s">Contas, casas, módulos e tickets. Aqui nunca aparece o que está dentro das casas: dinheiro, agendas, listas.</p>
      <div className="chips" role="tablist" aria-label="Secções">{TABS.map((t) => <button key={t} role="tab" className="press" aria-pressed={cur === t} aria-selected={cur === t} onClick={() => setTab(t)}>{label[t]}</button>)}</div>
      {err && <p className="err">{err === 'só para a administração da app' ? 'Este painel é só para a administração da app.' : err}</p>}
      {!d && !err && <Loading />}
      {d && cur === 'pedidos' && <Requests people={pending} onDone={load} drop={(id) => setD({ ...d, people: d.people.filter((p) => p.id !== id) })} />}
      {d && cur === 'pessoas' && <People people={d.people} onDone={load} />}
      {d && cur === 'casas' && <Houses houses={d.houses} />}
      {d && cur === 'tickets' && <Tickets tickets={d.tickets} onDone={load} set={(t) => setD({ ...d, tickets: d.tickets.map((x) => (x.id === t.id ? t : x)) })} />}
      {d && cur === 'numeros' && <Numbers k={d.kpis} />}
    </>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="empty"><Face h={28} mode="still" /><p className="s">{children}</p></div>;
}

function Requests({ people, onDone, drop }: { people: Person[]; onDone: () => void; drop: (id: string) => void }) {
  const { toast, open, close } = useOverlays();
  const asked = people.filter((p) => p.request).sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
  const filling = people.filter((p) => !p.request);
  async function decide(p: Person, approve: boolean) {
    close(); drop(p.id);
    try {
      await call('admin_decide', { p: p.id, approve });
      toast(approve ? `Pedido de ${p.name} aprovado. A casa «${p.request?.house}» está pronta.` : `Pedido de ${p.name} recusado.`, { ok: approve });
    } catch (e) { toast((e as Error).message); }
    onDone();
  }
  const refuse = (p: Person) => open(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Recusar o pedido de {p.name}?</p>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Não entra na NIKKI, nem com o convite de outra casa. Se tiveres dúvidas, fala primeiro com a pessoa.</p>
      <button className="btn wide press" onClick={() => decide(p, false)}>Recusar <Icon n="arrow" s={20} /></button>
      <button className="btn quiet wide press" onClick={close}>Cancelar</button>
    </div>,
  );
  if (!people.length) return <Empty>Nenhum pedido à espera.</Empty>;
  return (
    <div className="stack">
      {asked.map((p) => (
        <article className="tile adm" key={p.id}>
          <div className="adm-top"><span><span className="nm">{p.name}</span><span className="s">{p.email}</span></span><span className="s">{ago(p.requested_at)}</span></div>
          <div className="rows"><div><span className="k">Casa</span><span className="v">{p.request?.house}</span></div></div>
          {p.request?.note && <p className="quote">«{p.request.note}»</p>}
          <div className="actions">
            <button className="btn accent press" onClick={() => decide(p, true)}>Aprovar <Icon n="check" s={18} /></button>
            <button className="btn quiet press" onClick={() => refuse(p)}>Recusar</button>
          </div>
        </article>
      ))}
      {filling.length > 0 && <>
        <p className="s">Ainda a preencher o pedido</p>
        <div className="tile card rows">{filling.map((p) => <div key={p.id}><span>{p.name}<span className="s" style={{ display: 'block' }}>{p.email}</span></span><span className="v s">conta {ago(p.created_at)}</span></div>)}</div>
      </>}
    </div>
  );
}

function People({ people, onDone }: { people: Person[]; onDone: () => void }) {
  const { me } = useSession();
  const { toast, open, close } = useOverlays();
  async function pause(p: Person, paused: boolean) {
    close();
    try { await call('admin_pause', { p: p.id, paused }); toast(paused ? `Conta de ${p.name} em pausa.` : `Conta de ${p.name} reativada.`, { ok: !paused }); }
    catch (e) { toast((e as Error).message); }
    onDone();
  }
  const ask = (p: Person) => open(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{p.status === 'paused' ? `Reativar a conta de ${p.name}?` : `Pôr a conta de ${p.name} em pausa?`}</p>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{p.status === 'paused' ? 'Volta a ver a casa como antes.' : 'Deixa de ver a casa até a reativares. Nada se apaga.'}</p>
      <button className="btn wide press" onClick={() => pause(p, p.status !== 'paused')}>{p.status === 'paused' ? 'Reativar' : 'Pôr em pausa'} <Icon n="arrow" s={20} /></button>
      <button className="btn quiet wide press" onClick={close}>Cancelar</button>
    </div>,
  );
  return (
    <div className="stack">
      <p className="s">{people.length} contas</p>
      {people.map((p) => (
        <article className="tile adm" key={p.id}>
          <div className="adm-top"><span><span className="nm">{p.name}{p.id === me?.id ? ' (tu)' : ''}{p.admin ? ' · administração' : ''}</span><span className="s">{p.email}</span></span><span className={`st st-${p.status}`}>{ST[p.status]}</span></div>
          <p className="s">Conta desde {shortDate(p.created_at)}{p.approved_via === 'invite' ? ' · entrou com convite' : p.approved_via === 'admin' && p.approved_at ? ` · aprovada a ${shortDate(p.approved_at)}` : ''} · {p.last_seen_at ? `última visita ${ago(p.last_seen_at)}` : 'nunca abriu a app'}{p.tickets ? ` · ${p.tickets} ${p.tickets === 1 ? 'ticket' : 'tickets'}` : ''}</p>
          {p.houses.length > 0 && <p className="s">{p.houses.map((h) => `${h.name} (${h.role === 'admin' ? 'administra' : 'membro'}, desde ${shortDate(h.joined_at)})`).join(' · ')}</p>}
          {(p.status === 'active' || p.status === 'paused') && p.id !== me?.id && <div className="actions"><button className="tb press" onClick={() => ask(p)}>{p.status === 'paused' ? 'Reativar' : 'Pôr em pausa'}</button></div>}
        </article>
      ))}
    </div>
  );
}

function Houses({ houses }: { houses: HouseInfo[] }) {
  if (!houses.length) return <Empty>Ainda não há casas.</Empty>;
  return (
    <div className="stack">
      <p className="s">{houses.length} {houses.length === 1 ? 'casa' : 'casas'}</p>
      {houses.map((h) => (
        <article className="tile adm" key={h.id}>
          <div className="adm-top"><span className="nm">{h.name}</span><span className="s">desde {shortDate(h.created_at)}</span></div>
          <p className="s">{h.members.map((m) => `${m.name}${m.role === 'admin' ? ' (administra)' : ''}, desde ${shortDate(m.joined_at)}`).join(' · ') || 'sem pessoas'}</p>
          <div className="mchips">{h.modules.length
            ? h.modules.map((m) => <span key={m.module} className="mchip">{moduleName(m.module)}<span className="s">desde {shortDate(m.since)}</span></span>)
            : <span className="s">Sem módulos ligados (só Dinheiro, Agenda e Pessoas).</span>}</div>
        </article>
      ))}
    </div>
  );
}

function Tickets({ tickets, onDone, set }: { tickets: AdminTicket[]; onDone: () => void; set: (t: AdminTicket) => void }) {
  const [f, setF] = useState<TicketStatus | 'todos'>('novo');
  const n = (s: TicketStatus) => tickets.filter((t) => t.status === s).length;
  const list = f === 'todos' ? tickets : tickets.filter((t) => t.status === f);
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Estado">
        {(['novo', 'a ver', 'feito', 'nao'] as TicketStatus[]).map((s) => <button key={s} className="press" aria-pressed={f === s} onClick={() => setF(s)}>{TK[s]} · {n(s)}</button>)}
        <button className="press" aria-pressed={f === 'todos'} onClick={() => setF('todos')}>Todos · {tickets.length}</button>
      </div>
      {!list.length && <Empty>Nada por aqui.</Empty>}
      {list.map((t) => <TicketCard key={t.id} t={t} onDone={onDone} set={set} />)}
    </div>
  );
}

function TicketCard({ t, onDone, set }: { t: AdminTicket; onDone: () => void; set: (t: AdminTicket) => void }) {
  const { toast } = useOverlays();
  const [reply, setReply] = useState(t.reply ?? '');
  async function save(status: TicketStatus, r: string) {
    const was = t;
    set({ ...t, status, reply: r.trim() || null });
    try { await call('admin_ticket', { t: t.id, new_status: status, new_reply: r }); if (r !== (was.reply ?? '')) toast('Resposta enviada.', { ok: true }); }
    catch (e) { set(was); toast((e as Error).message); }
    onDone();
  }
  return (
    <article className="tile tk">
      <div className="tk-top"><span className="s">{t.kind === 'ideia' ? 'Ideia' : 'Problema'} · {t.by}{t.screen ? ` · ${t.screen}` : ''} · {ago(t.created_at)}</span><span className={statusClass(t.status)}>{TK[t.status]}</span></div>
      <p className="tk-body">{t.body}</p>
      {t.shot && <Shot path={t.shot} />}
      <div className="seg" role="group" aria-label="Estado">{(['novo', 'a ver', 'feito', 'nao'] as TicketStatus[]).map((s) => <button key={s} type="button" className="press" aria-pressed={t.status === s} onClick={() => save(s, t.reply ?? '')}>{TK[s]}</button>)}</div>
      <div className="add-row">
        <label className="sr" htmlFor={`r-${t.id}`}>Resposta</label>
        <textarea id={`r-${t.id}`} className="note" rows={2} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder (a pessoa vê a resposta)" />
        <button type="button" className="sq press" aria-label="Enviar resposta" disabled={reply.trim() === (t.reply ?? '')} onClick={() => save(t.status, reply)}><Icon n="check" /></button>
      </div>
    </article>
  );
}

/** Números: um número por pergunta (sem gráfico), as contas novas das últimas 8 semanas e os módulos por casa. */
function Numbers({ k }: { k: Kpis }) {
  const weeks = fillWeeks(k.signups, todayStr());
  const [sel, setSel] = useState(weeks.length - 1);
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const w = weeks[sel];
  const tiles: [string, string, string][] = [
    [String(k.accounts.active), 'contas ativas', k.first_account ? `a primeira a ${shortDate(k.first_account)}` : '—'],
    [String(k.accounts.pending), 'à espera', k.accounts.paused ? `${k.accounts.paused} em pausa` : `${k.accounts.declined} recusadas`],
    [String(k.houses), k.houses === 1 ? 'casa' : 'casas', `${k.houses_two} com duas pessoas`],
    [String(k.seen_7d), 'abriram a app em 7 dias', `${k.seen_30d} em 30 dias`],
    [hoursLabel(k.approval_hours), 'até aprovar', 'em média'],
    [String(k.tickets.novo), k.tickets.novo === 1 ? 'ticket novo' : 'tickets novos', `${k.tickets['a ver']} a ver · ${k.tickets.feito} feitos`],
  ];
  const used = new Map(k.modules.map((m) => [m.module, m]));
  return (
    <div className="stack">
      <div className="kpis">{tiles.map(([v, l, d]) => <div className="tile kpi" key={l}><span className="l">{v}</span><span className="s">{l}<br />{d}</span></div>)}</div>
      <section className="tile pane" aria-label="Contas novas por semana" style={{ minHeight: 0 }}>
        <div className="pane-top"><span className="s">Contas novas por semana</span><span className="s">{shortDate(w.week)}: {w.n} {w.n === 1 ? 'conta' : 'contas'}</span></div>
        <div className="wk" role="group" aria-label="Últimas 8 semanas">{weeks.map((x, j) => (
          <button key={x.week} type="button" className={`press${j === sel ? ' on' : ''}`} aria-pressed={j === sel} aria-label={`Semana de ${shortDate(x.week)}: ${x.n}`} onClick={() => setSel(j)} onMouseEnter={() => setSel(j)}>
            <i style={{ height: x.n ? `${Math.max(8, (x.n / max) * 100)}%` : 2 }} className={x.n ? '' : 'zero'} />
          </button>
        ))}</div>
        <div className="wk-axis s"><span>{shortDate(weeks[0].week)}</span><span>esta semana</span></div>
      </section>
      <p className="s">Módulos · em quantas casas</p>
      <div className="tile card rows">{MODULES.map((m) => {
        const u = used.get(m.k), n = u?.houses ?? 0;
        return (
          <div key={m.k} className="mrow">
            <span className="mrow-n">{m.name}<span className="s">{u ? `desde ${shortDate(u.since)}` : 'em nenhuma'}</span></span>
            <span className="gbar" aria-hidden="true"><i style={{ width: `${k.houses ? (n / k.houses) * 100 : 0}%` }} /></span>
            <span className="v">{n} de {k.houses}</span>
          </div>
        );
      })}</div>
    </div>
  );
}
