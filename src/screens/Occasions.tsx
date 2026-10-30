import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/lazy';
import { eur, parseAmount, toU } from '@/lib/money';
import { todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { KINDS, countdown, kindName, sortOccasions, summary, type Guest, type Occasion, type OccItem, type OccasionKind } from '@/lib/occasions';
import { Top } from './Home';

// Eventos: casamento, batizado, bodas, festas… Cada um é um centro de custos com data: orçamento, despesas ligadas
// (contam no mês, fora das médias), convidados, compras e tarefas, fornecedores e presentes. Arquiva-se no fim.

const dt = (d: string) => shortDate(`${d}T12:00:00`);
const euro = (u: number) => `${eur(u, 0)} €`;
const RSVP: Record<Guest['rsvp'], string> = { pending: 'sem resposta', yes: 'vem', no: 'não vem', maybe: 'talvez' };
const NEXT: Record<Guest['rsvp'], Guest['rsvp']> = { pending: 'yes', yes: 'maybe', maybe: 'no', no: 'pending' };

/** O gasto de cada evento, com as despesas «só minhas» dos dois (só os totais vêm da base). */
function useTotals() {
  const { house } = useSession();
  const { expenses } = useHouse();
  const [t, setT] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!house) return;
    supabase.rpc('occasion_totals', { h: house.id }).then(({ data }) => {
      if (data) setT(new Map((data as { occasion_id: string; total: number | string }[]).map((r) => [r.occasion_id, toU(r.total)])));
    });
  }, [house, expenses.rows]);
  return t;
}

function useStats() {
  const { expenses, occGuests, occItems, occVendors, occGifts } = useHouse();
  const totals = useTotals();
  const today = todayStr();
  return (o: Occasion) => summary(o, expenses.rows, occGuests.rows, occItems.rows, occVendors.rows, occGifts.rows, today, totals.get(o.id));
}

export function Occasions() {
  const { occasions } = useHouse();
  const { open } = useOverlays();
  const stats = useStats();
  const [showOld, setShowOld] = useState(false);
  const { active, archived } = sortOccasions(occasions.rows.filter((o) => !o.purchase));
  return (
    <>
      <Top title="Eventos" right={<button className="tb press" onClick={() => open(<OccasionSheet />)}>Novo evento</button>} />
      <p className="s">Do batizado às bodas. Os gastos contam no mês, mas à parte: um casamento não estraga o vosso normal.</p>
      {active.length ? <div className="stack">{active.map((o) => { const s = stats(o); return (
        <Link key={o.id} to={`/eventos/${o.id}`} className="tile occ press">
          <span className="st2"><span>{o.name}</span><span className="s">{[kindName(o.kind), o.on_date && dt(o.on_date), countdown(s.days)].filter(Boolean).join(' · ')}</span></span>
          <span className="occ-money"><span className="l">{euro(s.spent)}</span><span className="s">{s.budget !== null ? `de ${euro(s.budget)}` : 'gastos'}</span></span>
          {s.budget ? <span className="occ-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (s.spent / s.budget) * 100).toFixed(1)}%` }} className={s.spent > s.budget ? 'over' : ''} /></span> : null}
          <span className="s">{[s.invited ? `${s.people} de ${s.invited} pessoas confirmadas` : '', s.todo ? `${s.todo} por fazer${s.late ? ` (${s.late} ${s.late === 1 ? 'atrasada' : 'atrasadas'})` : ''}` : '', s.committed ? `${euro(s.committed)} por pagar` : ''].filter(Boolean).join(' · ') || 'Toca para juntar convidados, compras e fornecedores.'}</span>
        </Link>
      ); })}</div> : <p className="s" style={{ fontSize: 'var(--t-m)' }}>Ainda sem eventos. Um casamento, um batizado, a passagem de ano: carrega em «Novo evento» e a festa organiza-se.</p>}
      {archived.length > 0 && <section className="stack">
        <button className="back press" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>{showOld ? 'Esconder' : 'Ver'} os arquivados ({archived.length})</button>
        {showOld && <div className="tile card rows">{archived.map((o) => { const s = stats(o); return (
          <Link key={o.id} to={`/eventos/${o.id}`} className="press"><span className="st2"><span>{o.name}</span><span className="s">{[kindName(o.kind), o.on_date && dt(o.on_date)].filter(Boolean).join(' · ')}</span></span><span className="s">{euro(s.spent)}</span></Link>
        ); })}</div>}
      </section>}
    </>
  );
}

/** Criar ou mudar um evento: nome, tipo, dia, sítio e orçamento. */
function OccasionSheet({ o }: { o?: Occasion }) {
  const { house } = useSession();
  const { occasions } = useHouse();
  const { close, toast } = useOverlays();
  const nav = useNavigate();
  const [name, setName] = useState(o?.name ?? '');
  const [kind, setKind] = useState<OccasionKind>(o?.kind ?? 'festa');
  const [date, setDate] = useState(o?.on_date ?? '');
  const [place, setPlace] = useState(o?.place ?? '');
  const [budget, setBudget] = useState(o?.budget ? String(o.budget).replace('.', ',') : '');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Dá um nome ao evento (ex.: Batizado da Matilde).');
    const b = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && !b) return setErr('O orçamento não está certo (ex.: 1500).');
    const row = { name: name.trim(), kind, on_date: date || null, place: place.trim() || null, budget: b };
    const { data, error } = o ? await supabase.from('occasions').update(row).eq('id', o.id).select('id').single() : await supabase.from('occasions').insert({ ...row, household_id: house!.id }).select('id').single();
    if (error) return setErr(error.message);
    occasions.reload(); close();
    if (!o) { nav(`/eventos/${(data as { id: string }).id}`); toast(`${row.name}: junta convidados, compras e fornecedores.`, { ok: true }); }
  }
  return (
    <form className="form" onSubmit={save} autoComplete="off">
      <p className="l">{o ? 'Mudar o evento' : 'Novo evento'}</p>
      <label>Nome<input className="field" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="Batizado da Matilde" autoFocus={!o} /></label>
      <div className="chips wrap" role="group" aria-label="Tipo">{KINDS.map((k) => <button key={k.k} type="button" className="press" aria-pressed={kind === k.k} onClick={() => setKind(k.k)}>{k.name}</button>)}</div>
      <div className="two">
        <label>Dia<input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Orçamento (€)<input className="field" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="opcional" /></label>
      </div>
      <label>Sítio<input className="field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="opcional" /></label>
      {err && <p className="s warn">{err}</p>}
      <button className="btn wide press">{o ? 'Guardar' : 'Criar evento'} <Icon n="arrow" s={20} /></button>
    </form>
  );
}

type Part = 'convidados' | 'lista' | 'fornecedores' | 'presentes' | 'gastos';
const PARTS: [Part, string][] = [['convidados', 'Convidados'], ['lista', 'Lista'], ['fornecedores', 'Fornecedores'], ['presentes', 'Presentes'], ['gastos', 'Gastos']];

export function OccasionScreen() {
  const { id } = useParams();
  const { occasions } = useHouse();
  const { open, toast } = useOverlays();
  const stats = useStats();
  const [sp, setSp] = useSearchParams();
  const o = occasions.rows.find((x) => x.id === id);
  if (!o) return <><Top title="Evento" />{occasions.loading ? <Loading /> : <p className="s">Este evento já não existe.</p>}</>;
  const s = stats(o);
  const part = (PARTS.find(([k]) => k === sp.get('ver'))?.[0] ?? 'convidados') as Part;
  async function archive(v: boolean) {
    const { error } = await supabase.from('occasions').update({ archived: v }).eq('id', o!.id);
    if (error) return toast(error.message);
    occasions.reload(); toast(v ? 'Arquivado. Fica tudo guardado, e as despesas ainda se lhe podem juntar.' : 'De volta aos eventos.');
  }
  return (
    <>
      <Top title={o.name} right={<button className="tb press" onClick={() => open(<OccasionSheet o={o} />)}>Mudar</button>} />
      <p className="s">{[kindName(o.kind), o.on_date && dt(o.on_date), o.place, o.archived ? 'arquivado' : countdown(s.days)].filter(Boolean).join(' · ')}</p>
      <div className="swap"><p className="xl">{eur(s.spent, 0)}<small>€</small></p>
        <p className="s" style={{ marginTop: 8 }}>{[s.budget !== null ? (s.left! >= 0 ? `faltam ${euro(s.left!)} do orçamento` : `${euro(-s.left!)} acima do orçamento`) : 'gastos até agora', s.committed ? `${euro(s.committed)} por pagar a fornecedores` : '', s.gifts ? `${euro(s.gifts)} recebidos em presentes` : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="seg" role="tablist" aria-label="Partes do evento">{PARTS.map(([k, n]) => <button key={k} type="button" role="tab" className="press" aria-selected={part === k} aria-pressed={part === k} onClick={() => setSp(k === 'convidados' ? {} : { ver: k }, { replace: true })}>{n}</button>)}</div>
      {part === 'convidados' && <Guests o={o} />}
      {part === 'lista' && <Items o={o} />}
      {part === 'fornecedores' && <Vendors o={o} />}
      {part === 'presentes' && <Gifts o={o} />}
      {part === 'gastos' && <Spent o={o} total={s.spent} />}
      <button className="back press" onClick={() => archive(!o.archived)}>{o.archived ? 'Reativar o evento' : 'Arquivar o evento (no fim)'}</button>
    </>
  );
}

/** Apagar uma linha de uma das listas do evento. */
function useDrop() {
  const { toast } = useOverlays();
  return async (table: string, rowId: string, reload: () => void) => {
    const { error } = await supabase.from(table).delete().eq('id', rowId);
    if (error) toast(error.message); else reload();
  };
}
const Drop = ({ onClick, what }: { onClick: () => void; what: string }) => <button type="button" className="tb press" aria-label={`Tirar ${what}`} onClick={onClick}><Icon n="close" s={16} /></button>;

function Guests({ o }: { o: Occasion }) {
  const { house } = useSession();
  const { occGuests } = useHouse();
  const { toast } = useOverlays();
  const drop = useDrop();
  const [name, setName] = useState(''), [people, setPeople] = useState('1'), [grp, setGrp] = useState('');
  const list = occGuests.rows.filter((g) => g.occasion_id === o.id);
  const yes = list.filter((g) => g.rsvp === 'yes').reduce((t, g) => t + g.people, 0), all = list.filter((g) => g.rsvp !== 'no').reduce((t, g) => t + g.people, 0);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const n = Math.min(20, Math.max(1, Number(people) || 1));
    const { error } = await supabase.from('occasion_guests').insert({ household_id: house!.id, occasion_id: o.id, name: name.trim(), people: n, grp: grp.trim() || null });
    if (error) return toast(error.message);
    setName(''); setPeople('1'); occGuests.reload();
  }
  async function cycle(g: Guest) {
    occGuests.setRows((r) => r.map((x) => (x.id === g.id ? { ...x, rsvp: NEXT[g.rsvp] } : x)));
    const { error } = await supabase.from('occasion_guests').update({ rsvp: NEXT[g.rsvp] }).eq('id', g.id);
    if (error) { occGuests.reload(); toast(error.message); }
  }
  const groups = [...new Set(list.map((g) => g.grp ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return (
    <section className="stack" aria-label="Convidados">
      <p className="s">{list.length ? `${yes} de ${all} pessoas confirmadas · ${list.filter((g) => g.rsvp === 'pending').length} sem resposta. Toca na resposta para a mudar.` : 'Junta quem vem: o nome do convite, quantas pessoas e o grupo (família, amigos, mesa…).'}</p>
      <form className="add-row" onSubmit={add} autoComplete="off">
        <input className="field" aria-label="Convidado" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field narrow" aria-label="Pessoas" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ''))} />
        <input className="field" aria-label="Grupo" placeholder="Grupo" value={grp} onChange={(e) => setGrp(e.target.value)} />
        <button className="tb press" aria-label="Juntar convidado"><Icon n="plus" s={18} /></button>
      </form>
      {groups.map((gr) => (
        <div key={gr || '-'} className="stack">
          {groups.length > 1 && <span className="s">{gr || 'Sem grupo'}</span>}
          <div className="tile card rows occ-rows">{list.filter((g) => (g.grp ?? '') === gr).map((g) => (
            <div key={g.id}>
              <span className="st2"><span>{g.name}</span><span className="s">{g.people} {g.people === 1 ? 'pessoa' : 'pessoas'}</span></span>
              <button type="button" className={`tb press rsvp-${g.rsvp}`} onClick={() => cycle(g)} aria-label={`${g.name}: ${RSVP[g.rsvp]}. Mudar resposta`}>{RSVP[g.rsvp]}</button>
              <Drop what={g.name} onClick={() => drop('occasion_guests', g.id, occGuests.reload)} />
            </div>
          ))}</div>
        </div>
      ))}
    </section>
  );
}

function Items({ o }: { o: Occasion }) {
  const { house, me } = useSession();
  const { occItems } = useHouse();
  const { toast } = useOverlays();
  const drop = useDrop();
  const [kind, setKind] = useState<OccItem['kind']>('todo');
  const [title, setTitle] = useState(''), [due, setDue] = useState('');
  const today = todayStr();
  const list = occItems.rows.filter((i) => i.occasion_id === o.id).sort((a, b) => Number(a.done) - Number(b.done) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('occasion_items').insert({ household_id: house!.id, occasion_id: o.id, kind, title: title.trim(), due_on: due || null });
    if (error) return toast(error.message);
    setTitle(''); setDue(''); occItems.reload();
  }
  async function tick(i: OccItem) {
    occItems.setRows((r) => r.map((x) => (x.id === i.id ? { ...x, done: !i.done } : x)));
    const { error } = await supabase.from('occasion_items').update({ done: !i.done, done_by: !i.done ? me!.id : null }).eq('id', i.id);
    if (error) { occItems.reload(); toast(error.message); }
  }
  const block = (k: OccItem['kind'], label: string) => {
    const xs = list.filter((i) => i.kind === k);
    return xs.length ? <div className="stack" key={k}><span className="s">{label} · {xs.filter((i) => !i.done).length} por {k === 'buy' ? 'comprar' : 'fazer'}</span>
      <div className="tile card"><ul className="items">{xs.map((i) => (
        <li key={i.id} className={`item${i.done ? ' done' : ''}`}>
          <button className="check" aria-pressed={i.done} aria-label={i.title} onClick={() => tick(i)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ground)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
          <span className="nm">{i.title}{i.due_on && <span className={`due${!i.done && i.due_on < today ? ' warn' : ''}`}>até {dt(i.due_on)}</span>}</span>
          <Drop what={i.title} onClick={() => drop('occasion_items', i.id, occItems.reload)} />
        </li>
      ))}</ul></div></div> : null;
  };
  return (
    <section className="stack" aria-label="Compras e tarefas">
      <div className="seg" role="group" aria-label="O que juntar"><button type="button" className="press" aria-pressed={kind === 'todo'} onClick={() => setKind('todo')}>Tarefa</button><button type="button" className="press" aria-pressed={kind === 'buy'} onClick={() => setKind('buy')}>Compra</button></div>
      <form className="add-row" onSubmit={add} autoComplete="off">
        <input className="field" aria-label={kind === 'buy' ? 'O que comprar' : 'O que fazer'} placeholder={kind === 'buy' ? 'Velas, lembranças…' : 'Reservar o restaurante…'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field narrow-date" type="date" aria-label="Até quando" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="tb press" aria-label="Juntar"><Icon n="plus" s={18} /></button>
      </form>
      {block('todo', 'Tarefas')}{block('buy', 'Compras')}
      {!list.length && <p className="s">O que fazer até ao dia (com prazo, se houver) e o que comprar. Para ninguém se lembrar dos guardanapos na véspera.</p>}
    </section>
  );
}

function Vendors({ o }: { o: Occasion }) {
  const { house } = useSession();
  const { occVendors } = useHouse();
  const { toast } = useOverlays();
  const drop = useDrop();
  const [name, setName] = useState(''), [service, setService] = useState(''), [total, setTotal] = useState(''), [paid, setPaid] = useState('');
  const list = occVendors.rows.filter((v) => v.occasion_id === o.id);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const t = total.trim() ? parseAmount(total) : null, p = paid.trim() ? parseAmount(paid) : '0';
    if ((total.trim() && !t) || !p) return toast('Os valores não estão certos (ex.: 900 e 300).');
    const { error } = await supabase.from('occasion_vendors').insert({ household_id: house!.id, occasion_id: o.id, name: name.trim(), service: service.trim() || null, total: t, paid: p });
    if (error) return toast(error.message);
    setName(''); setService(''); setTotal(''); setPaid(''); occVendors.reload();
  }
  async function pay(id: string, to: string | number | null) {
    const { error } = await supabase.from('occasion_vendors').update({ paid: to ?? 0 }).eq('id', id);
    if (error) toast(error.message); else occVendors.reload();
  }
  return (
    <section className="stack" aria-label="Fornecedores">
      <p className="s">Quem contrataram, quanto ficou combinado e quanto já pagaram. Os pagamentos registam-se também como despesa, ligada ao evento.</p>
      <form className="form" onSubmit={add} autoComplete="off">
        <div className="two"><input className="field" aria-label="Fornecedor" placeholder="Fornecedor" value={name} onChange={(e) => setName(e.target.value)} /><input className="field" aria-label="Serviço" placeholder="Serviço (bolo, fotos…)" value={service} onChange={(e) => setService(e.target.value)} /></div>
        <div className="two"><input className="field" aria-label="Combinado (€)" inputMode="decimal" placeholder="Combinado (€)" value={total} onChange={(e) => setTotal(e.target.value)} /><input className="field" aria-label="Já pago (€)" inputMode="decimal" placeholder="Já pago (€)" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
        <button className="btn quiet wide press">Juntar fornecedor</button>
      </form>
      {list.length > 0 && <div className="tile card rows occ-rows">{list.map((v) => {
        const owe = v.total !== null ? Math.max(0, toU(v.total) - toU(v.paid)) : 0;
        return (
          <div key={v.id}>
            <span className="st2"><span>{v.name}{v.service ? ` · ${v.service}` : ''}</span><span className="s">{v.total !== null ? `${euro(toU(v.total))} combinados · ${euro(toU(v.paid))} pagos${owe ? ` · faltam ${euro(owe)}` : ' · pago'}` : `${euro(toU(v.paid))} pagos`}</span></span>
            {owe > 0 && <button type="button" className="tb press" onClick={() => pay(v.id, v.total)}>Pago</button>}
            <Drop what={v.name} onClick={() => drop('occasion_vendors', v.id, occVendors.reload)} />
          </div>
        );
      })}</div>}
    </section>
  );
}

function Gifts({ o }: { o: Occasion }) {
  const { house } = useSession();
  const { occGifts } = useHouse();
  const { toast } = useOverlays();
  const drop = useDrop();
  const [from, setFrom] = useState(''), [what, setWhat] = useState('');
  const list = occGifts.rows.filter((g) => g.occasion_id === o.id);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!from.trim() || !what.trim()) return;
    const money = /^\s*\d+([.,]\d{1,2})?\s*€?\s*$/.test(what) ? parseAmount(what.replace('€', '')) : null;
    const { error } = await supabase.from('occasion_gifts').insert({ household_id: house!.id, occasion_id: o.id, from_name: from.trim(), amount: money, item: money ? null : what.trim() });
    if (error) return toast(error.message);
    setFrom(''); setWhat(''); occGifts.reload();
  }
  async function thank(id: string, v: boolean) {
    occGifts.setRows((r) => r.map((x) => (x.id === id ? { ...x, thanked: v } : x)));
    const { error } = await supabase.from('occasion_gifts').update({ thanked: v }).eq('id', id);
    if (error) { occGifts.reload(); toast(error.message); }
  }
  const money = list.reduce((t, g) => t + (g.amount ? toU(g.amount) : 0), 0);
  return (
    <section className="stack" aria-label="Presentes">
      <p className="s">{list.length ? `${euro(money)} em dinheiro · ${list.filter((g) => !g.thanked).length} por agradecer` : 'De quem e o quê: um valor (ex.: 100) ou o presente. Marca quando agradecerem: a avó repara.'}</p>
      <form className="add-row" onSubmit={add} autoComplete="off">
        <input className="field" aria-label="De quem" placeholder="De quem" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="field" aria-label="Valor ou presente" placeholder="100 ou o presente" value={what} onChange={(e) => setWhat(e.target.value)} />
        <button className="tb press" aria-label="Juntar presente"><Icon n="plus" s={18} /></button>
      </form>
      {list.length > 0 && <div className="tile card rows occ-rows">{list.map((g) => (
        <div key={g.id}>
          <span className="st2"><span>{g.from_name}</span><span className="s">{g.amount ? `${eur(toU(g.amount))} €` : g.item}</span></span>
          <button type="button" className="tb press" aria-pressed={g.thanked} onClick={() => thank(g.id, !g.thanked)}>{g.thanked ? 'Agradecido' : 'Agradecer'}</button>
          <Drop what={g.from_name} onClick={() => drop('occasion_gifts', g.id, occGifts.reload)} />
        </div>
      ))}</div>}
    </section>
  );
}

function Spent({ o, total }: { o: Occasion; total: number }) {
  const { expenses } = useHouse();
  const { members, partner } = useSession();
  const list = expenses.rows.filter((e) => e.occasion_id === o.id).sort((a, b) => b.spent_on.localeCompare(a.spent_on));
  const who = (id: string) => members.find((m) => m.id === id)?.name ?? '';
  // As «só minhas» do outro ligadas ao evento contam no total, mas não se mostram uma a uma.
  const hidden = total - list.reduce((t, e) => t + toU(e.amount), 0);
  return (
    <section className="stack" aria-label="Gastos do evento">
      <p className="s">Ao registar uma despesa, escreve o nome do evento ou escolhe-o. Conta no mês, mas fica fora do vosso normal.</p>
      {list.length > 0 && <div className="tile card rows occ-rows">{list.map((e) => (
        <div key={e.id}><span className="st2"><span>{e.note || e.category}</span><span className="s">{dt(e.spent_on)} · {e.category} · pagou {who(e.paid_by)}</span></span><span>{eur(toU(e.amount))} €</span></div>
      ))}</div>}
      {hidden > 0 && <p className="s">Mais {eur(hidden)} € em despesas só {partner ? `de ${partner.name}` : 'pessoais'}, ligadas ao evento.</p>}
    </section>
  );
}
