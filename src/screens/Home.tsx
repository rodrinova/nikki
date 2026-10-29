import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { store } from '@/lib/store';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Wordmark } from '@/brand/Wordmark';
import { Poster } from '@/ui/Poster';
import { How, Year } from '@/ui/Year';
import { eur, monthClose, toU } from '@/lib/money';
import { addDays, dayLabel, monthName, toDateStr, todayStr } from '@/lib/dates';
import { MODULES } from '@/lib/modules';
import { ExpenseSheet, INVEST, useLedger, useMonth } from './Money';
import { InviteForm } from './People';
import { arrange, parseHidden, prune, type Hidden, type NowItem } from '@/lib/now';
import { ContractSheet, PaidSheet, useCasa } from './Casa';
import { useTick } from './Today';
import { GoalLine } from './Goals';
import { CarPaidSheet } from './Garage';
import { todayList } from '@/lib/chores';
import { seenKey, useAskHk, useHkPay, usePaid } from './Housekeeping';
import { isVisitDay, nextVisit, payDue } from '@/lib/hk';
import { fmt, nextCheck, summary } from '@/lib/gym';
import { useAgendaItems } from '@/data/agenda';
import { AgendaPane } from './Agenda';
import { warrantyState } from '@/lib/chores';
import { useWealth } from '@/data/wealth';

export function Top({ title, right }: { title: string; right?: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <>
      <button className="back press" onClick={() => (loc.key !== 'default' ? nav(-1) : nav('/'))}><Icon n="back" s={20} /><span>Voltar</span></button>
      <div className="titlebar"><h1 className="l">{title}</h1>{right}</div>
    </>
  );
}

/** Quantas vezes este ecrã já foi visto (as linhas de ajuda só aparecem nas 3 primeiras). */
export function useSeen(k: string) {
  const key = `nikki_seen_${k}`;
  const [n] = useState(() => Number(store.get(key) ?? 0));
  useEffect(() => { store.set(key, String(n + 1)); }, [key, n]);
  return n;
}
export const Hint = ({ show, children }: { show: boolean; children: ReactNode }) => (show ? <p className="hint">{children}</p> : null);

const hello = () => { const h = new Date().getHours(); return h >= 6 && h < 12 ? 'Bom dia' : h < 20 && h >= 12 ? 'Boa tarde' : 'Boa noite'; };

function FirstSteps() {
  const { me, members, house } = useSession();
  const { expenses, shop, on } = useHouse();
  const { open } = useOverlays();
  const nav = useNavigate();
  const hideKey = `nikki_first_hidden_${house?.id}`;
  const [hidden, setHidden] = useState(() => store.get(hideKey) === '1');
  const done = {
    exp: expenses.rows.some((e) => e.created_by === me?.id),
    item: shop.rows.length > 0,
    invite: members.length > 1 || store.get(`nikki_invited_${house?.id}`) === '1',
  };
  const rows: [keyof typeof done, string, () => void][] = [
    ['exp', 'Registar uma despesa', () => open(<ExpenseSheet />)],
    ...(on('compras') ? [['item', 'Pôr algo na lista de compras', () => nav('/compras')] as [keyof typeof done, string, () => void]] : []),
    ['invite', 'Convidar quem vive contigo', () => open(<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><p className="l">Convidar</p><InviteForm householdId={house!.id} onDone={() => store.set(`nikki_invited_${house?.id}`, '1')} /></div>)],
  ];
  const n = rows.filter(([k]) => done[k]).length;
  if (hidden || n === rows.length || expenses.loading) return null;
  return (
    <section className="tile card" aria-label="Primeiros passos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 }}>
        <span className="s">Primeiros passos · {n} de {rows.length}</span>
        <button className="back press" style={{ fontSize: 'var(--t-s)' }} onClick={() => { store.set(hideKey, '1'); setHidden(true); }}>Esconder</button>
      </div>
      <div className="rows">{rows.map(([k, label, go]) => (
        <button key={k} className="press" disabled={done[k]} onClick={go}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className={`tick${done[k] ? ' on' : ''}`}>{done[k] && <Icon n="check" s={14} w={2.4} />}</span><span style={done[k] ? { color: 'var(--sub)', textDecoration: 'line-through' } : undefined}>{label}</span></span>
          {!done[k] && <Icon n="arrow" s={16} />}
        </button>
      ))}</div>
    </section>
  );
}


/**
 * A NIKKI lembra (avisos): o que pede atenção, em lista (o mais urgente primeiro). Cada aviso dispensa-se com o ✕ ou a deslizar para o
 * lado; fica «Desfazer» uns segundos. Um aviso dispensado volta se mudar (ver lib/now.ts).
 */
/** Uma linha de «A NIKKI lembra», com o que a resolve ali mesmo (marcar feito, «Paguei»…). */
type Need = NowItem & { act?: { label: string; run: () => void }; tick?: () => Promise<void> };

function Now() {
  const { partner, me, house } = useSession();
  const { deadlines, on, chores, warranties, hk, hkMessages, cars, todos, gym } = useHouse();
  const { open } = useOverlays();
  const casa = useCasa();
  const tickIt = useTick();
  const hkPay = useHkPay();
  const askHk = useAskHk();
  // Uma tarefa ou manutenção da casa: «Pedir a Maria» (se houver housekeeping), ou já pedida.
  const hkAsk = (c: { id: string; title: string }) => (!askHk.card ? {} : askHk.pending(c.id) ? { note: `Pedido a ${askHk.card.name} para ${dayLabel(askHk.pending(c.id)!.due_on ?? todayStr())}` } : { act: { label: `Pedir a ${askHk.card.name}`, run: () => askHk.ask(c) } });
  const today = todayStr();
  const bdays = useAgendaItems(today, addDays(today, 60)).filter((x) => x.kind === 'birthday' && x.day <= addDays(today, x.ev!.remind_days ?? 7));
  const hkCard = on('housekeeping') ? hk.rows.find((r) => !r.archived) : undefined;
  const hkPaid = usePaid(hkCard);
  const [undo, setUndo] = useState<{ t: string; verb: string; run: () => Promise<void> | void } | null>(null);
  const items: Need[] = [];
  // O que é para fazer hoje (tarefas da casa e «a fazer»): marca-se aqui.
  const late = (n: number) => (n === 1 ? 'desde ontem' : n > 1 ? `atrasada ${n} dias` : '');
  for (const it of me ? todayList(on('casa') ? chores.rows : [], todos.rows, me.id, today).mine : []) {
    const maint = it.kind === 'chore' && it.chore!.kind === 'maintenance';
    const ha = it.kind === 'chore' ? hkAsk({ id: it.id, title: it.title }) : {};
    items.push({
      key: `td:${it.kind}:${it.id}:${today}`, rank: it.late > 0 ? 1 : 2, t: it.title,
      s: cap1([maint ? 'manutenção' : '', it.owner === null ? (partner ? 'de quem puder' : '') : it.chore?.assign === 'rotate' ? 'a tua vez' : '', late(it.late), 'note' in ha ? ha.note : ''].filter(Boolean).join(' · ') || 'para hoje'),
      tick: async () => { const u = await tickIt(it); if (u) setUndo({ t: it.title, verb: 'feito', run: u }); },
      ...('act' in ha ? { act: ha.act } : {}),
    });
  }
  // Prazos: com a antecedência de cada um (IUC, IMI, seguros e contratos: um mês; o resto: uma semana).
  for (const d of deadlines.rows.filter((x) => !x.paid_at && (on('casa') || (x.car_id && on('garagem'))) && x.due_on <= addDays(today, x.remind_days ?? 7))) {
    const to = d.car_id ? `/garagem/${d.car_id}` : on('casa') ? '/casa/prazos' : undefined, near = d.due_on <= addDays(today, 2);
    const s = d.kind === 'insurance' ? `Renova ${dayLabel(d.due_on)}. Boa altura para comparar propostas.`
      : d.kind === 'contract' ? `Acaba ${dayLabel(d.due_on)}. Podes mudar sem penalização.`
        : `${d.kind === 'iuc' || d.kind === 'imi' ? 'Até ' : ''}${dayLabel(d.due_on)}${d.amount ? ` · ${eur(Number(d.amount) * 100_000)} €` : ''}`;
    const car = d.car_id ? cars.rows.find((c) => c.id === d.car_id) : undefined;
    const act = d.kind === 'contract' ? { label: 'Tratado', run: () => open(<ContractSheet d={d} />) }
      : car ? { label: 'Paguei', run: () => open(<CarPaidSheet d={d} car={car} />) } : !d.car_id ? { label: 'Paguei', run: () => open(<PaidSheet d={d} />) } : undefined;
    items.push({ key: `dl:${d.id}:${d.due_on}`, rank: d.due_on < today ? 0 : near ? 1 : 3, due: d.due_on, t: d.title, s, to, urgent: near, act });
  }
  // Casa: contas a pagar nos próximos 2 dias e despesas que parecem contas fixas (a confirmar).
  if (on('casa')) for (const d of casa.dues.filter((x) => x.on <= addDays(today, 2))) items.push({ key: `due:${d.b.id}:${d.on}`, rank: 1, due: d.on, urgent: true, t: d.b.name, s: `Paga-se ${dayLabel(d.on)}${d.amount ? `, ${d.invoice ? '' : 'cerca de '}${eur(d.amount, d.invoice ? 2 : 0)} €` : ''}.`, to: `/casa/conta/${d.b.id}` });
  if (on('casa') && casa.pending.length) items.push({ key: `pend:${casa.pending.map((x) => x.e.id).sort().join(',')}`, rank: 4, t: casa.pending.length === 1 ? '1 despesa parece uma conta fixa' : `${casa.pending.length} despesas parecem contas fixas`, s: 'Um toque para confirmar.', to: '/casa/contas' });
  // Aniversários: com os dias de antecedência de cada um (para o presente).
  for (const b of bdays) items.push({ key: `bday:${b.ev!.id}:${b.day}`, rank: b.day <= addDays(today, 1) ? 1 : 3, due: b.day, urgent: b.day <= addDays(today, 1), t: b.title, s: `${cap1(dayLabel(b.day))}. ${b.day === today ? 'Dá os parabéns!' : 'Já há presente?'}` });
  // Manutenção: duas semanas antes, para marcar o técnico. Garantias: nos últimos 60 dias.
  if (on('casa')) for (const c of chores.rows.filter((x) => !x.archived && x.kind === 'maintenance' && x.next_on > today && x.next_on <= addDays(today, 14))) { const ha = hkAsk(c); items.push({ key: `mnt:${c.id}:${c.next_on}`, rank: 3, due: c.next_on, t: c.title, s: 'note' in ha ? `${cap1(dayLabel(c.next_on))}. ${ha.note}.` : `${cap1(dayLabel(c.next_on))}. Se precisa de técnico, é altura de marcar.`, to: '/casa/manutencao', ...('act' in ha ? { act: ha.act } : {}) }); }
  if (on('casa')) for (const g of warranties.rows.filter((x) => !x.archived)) {
    const st = warrantyState(g.bought_on, Number(g.years), today);
    if (st.state === 'soon' && st.days <= 60) items.push({ key: `gar:${g.id}:${st.end}`, rank: 4, due: st.end, t: `Garantia: ${g.item}`, s: `Acaba ${dayLabel(st.end)}.`, to: '/casa/garantias' });
  }
  // Housekeeping: o pagamento do mês (três dias antes) e mensagens novas de quem faz o housekeeping.
  // Antes do dia (com a antecedência escolhida): preparar; no dia ou depois: pagar.
  if (hkCard?.monthly_pay) for (const p of payDue({ ...hkCard, monthly_pay: Number(hkCard.monthly_pay) }, hkPaid, today))
    items.push({ key: `hkpay:${p.month}`, rank: p.late > 0 ? 0 : p.late >= -2 ? 1 : 2, due: p.due, urgent: p.late >= -2, t: p.late < 0 ? `Preparar o housekeeping de ${monthName(p.month)}` : `Housekeeping de ${monthName(p.month)}`,
      s: p.late < 0 ? `${eur(toU(hkCard.monthly_pay), 0)} € para ${hkCard.name}, a pagar ${dayLabel(p.due)}. Dá tempo de preparar.` : `${eur(toU(hkCard.monthly_pay), 0)} € para ${hkCard.name}, ${p.late > 0 ? 'era para ' : 'paga-se '}${dayLabel(p.due)}.`, to: '/housekeeping', act: { label: 'Paguei', run: () => hkPay(hkCard, p.month) } });
  // Ginásio: a próxima avaliação (de n em n semanas desde a última).
  const gnext = on('ginasio') && gym.prefs ? nextCheck(gym.rows, gym.prefs.every_weeks, today) : null;
  if (gnext && gnext.late >= 0) items.push({ key: `gym:${gnext.due}`, rank: 3, due: gnext.due, t: 'Avaliação no ginásio', s: gnext.late > 0 ? `Era ${dayLabel(gnext.due)}. Só tu vês os valores.` : 'Hoje é dia. Só tu vês os valores.', to: '/ginasio' });
  const hkSeen = store.get(seenKey(house?.id, me?.id)) ?? '';
  const hkNew = hkCard ? hkMessages.rows.filter((m) => m.author_id === hkCard.profile_id && m.created_at > hkSeen) : [];
  if (hkNew.length) items.push({ key: `hkmsg:${hkNew.at(-1)!.id}`, rank: 0.5, urgent: true, // mensagem nova: logo a seguir ao que está atrasado
    t: hkNew.length === 1 ? `Mensagem de ${hkCard!.name}` : `${hkNew.length} mensagens de ${hkCard!.name}`, s: `«${hkNew.at(-1)!.body.slice(0, 80)}${hkNew.at(-1)!.body.length > 80 ? '…' : ''}»`, to: '/housekeeping/mensagens' });

  const sk = `nikki_now_hidden_${house?.id}_${me?.id}`;
  const [hidden, setHidden] = useState<Hidden>(() => prune(parseHidden(store.get(sk)), todayStr()));
  useEffect(() => { setHidden(prune(parseHidden(store.get(sk)), todayStr())); }, [sk]); // a sessão pode chegar depois
  const save = (h: Hidden) => { setHidden(h); if (house && me) store.set(sk, JSON.stringify(h)); };
  const [more, setMore] = useState(false);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t); }, [undo]);
  const { shown, hiddenKeys } = arrange(items, hidden);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const dismiss = (it: NowItem) => { const h = { ...hidden, [it.key]: todayStr() }; save(h); setUndo({ t: it.t, verb: 'dispensado', run: () => { const x = { ...h }; delete x[it.key]; save(x); } }); };
  // Só as 3 mais importantes; o resto a um toque.
  const MAX = 3, list = (more ? shown : shown.slice(0, MAX)).map((i) => byKey.get(i.key)!);
  return (
    <section className="tile pane now" aria-label="A NIKKI lembra">
      <div className="pane-top"><span className="s">A NIKKI lembra</span></div>
      {shown.length === 0 && !undo && <p className="l" style={{ fontSize: 'var(--t-m)' }}>Nada para hoje. Está tudo a tempo.</p>}
      <ul className="now-list">
        {list.map((it) => <NowRow key={it.key} it={it} onDismiss={() => dismiss(it)} />)}
        {undo && <li className="now-undo s"><span>{undo.t}: {undo.verb}.</span><button className="tb press" onClick={async () => { await undo.run(); setUndo(null); }}>Desfazer</button></li>}
      </ul>
      {(shown.length > MAX || (more && hiddenKeys.length > 0)) && <div className="now-foot">
        {shown.length > MAX && <button className="tb quiet press" onClick={() => setMore(!more)}>{more ? 'Só as importantes' : `Mais ${shown.length - MAX}`}</button>}
        {more && hiddenKeys.length > 0 && <button className="tb quiet press" onClick={() => { const h = { ...hidden }; for (const k of hiddenKeys) delete h[k]; save(h); }}>{hiddenKeys.length === 1 ? 'Mostrar o dispensado' : `Mostrar os ${hiddenKeys.length} dispensados`}</button>}
      </div>}
    </section>
  );
}

/** Dinheiro numa frase: o mês comparado com o habitual e, a dois, como estão entre vocês. */
function MoneyLine() {
  const { partner } = useSession();
  const m = useMonth(), L = useLedger();
  const pace = m.pace.fresh ? '' : `, ${Math.abs(m.pace.pct)}% ${m.pace.pct >= 0 ? 'acima' : 'abaixo'} do habitual`;
  const us = partner && L ? (L.even ? 'Entre nós: estão quites.' : L.v > 0 ? `Entre nós: adiantaste ${eur(Math.abs(L.v))} € a mais.` : `Entre nós: ${partner.name} adiantou ${eur(Math.abs(L.v))} € a mais.`) : '';
  return (
    <Link className="tile money-line press" to="/dinheiro">
      <span className="st2"><span>{cap1(monthName(m.key))}{partner ? ', a tua parte' : ''}: {eur(m.total, 0)} €{pace}.</span>{us && <span className="s">{us}</span>}</span>
      <Icon n="chev" s={16} />
    </Link>
  );
}

/** Uma linha do Agora: toca para abrir; ✕ ou deslizar para o lado (mais de 90 px) para dispensar. */
function NowRow({ it, onDismiss }: { it: Need; onDismiss: () => void }) {
  const nav = useNavigate();
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const swiped = useRef(false); // depois de deslizar, o toque não abre
  const leave = () => { setGone(true); setTimeout(onDismiss, 200); };
  return (
    <li className={`now-row${gone ? ' gone' : ''}${it.urgent ? ' urgent' : ''}`}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, opacity: dx ? Math.max(0.3, 1 - Math.abs(dx) / 260) : undefined, transition: start.current ? 'none' : undefined }}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, moved: false }; }}
      onPointerMove={(e) => {
        const s = start.current; if (!s) return;
        const x = e.clientX - s.x, y = e.clientY - s.y;
        if (!s.moved && Math.abs(x) > 10 && Math.abs(x) > Math.abs(y)) { s.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
        if (s.moved) setDx(x);
      }}
      onPointerUp={() => { const s = start.current; start.current = null; swiped.current = !!s?.moved; if (s?.moved && Math.abs(dx) > 90) leave(); else setDx(0); }}
      onPointerCancel={() => { start.current = null; setDx(0); }}>
      {it.tick && <button type="button" className="tick press" role="checkbox" aria-checked="false" aria-label={`Feito: ${it.t}`} onClick={it.tick}><i /></button>}
      <button type="button" className="now-main press" onClick={() => { if (!swiped.current && it.to) nav(it.to); swiped.current = false; }} disabled={!it.to}>
        {!it.tick && <span className="now-dot" aria-hidden="true" />}
        <span className="st2"><span>{it.t}</span><span className="s">{it.s}</span></span>
        {it.to && !it.act && <Icon n="chev" s={16} />}
      </button>
      {it.act && <button type="button" className="tb press now-act" onClick={it.act.run}>{it.act.label}</button>}
      <button type="button" className="x-btn press" aria-label={`Dispensar: ${it.t}`} onClick={leave}><Icon n="close" s={14} /></button>
    </li>
  );
}

/** A agenda no início: eventos da casa, os teus e os do outro (os «só para mim» dele aparecem como «Inês tem planos») e os prazos. */
const cap1 = (t: string) => t[0].toUpperCase() + t.slice(1);



/**
 * O início responde a três perguntas: o que tenho (a semana, com hoje e amanhã), o que precisa de mim (no máximo
 * três coisas, cada uma com o que a resolve) e como estamos de dinheiro (uma frase). O resto está em Espaços.
 */
export function Hub() {
  const { toast } = useOverlays();
  // Volta do Google (ligar o calendário): diz como correu e limpa o endereço.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('calendario');
    if (!q) return;
    toast(q === 'google' ? 'Ligado ao Google: o calendário «NIKKI» já está no telemóvel.' : 'Não foi possível ligar o calendário. Tenta outra vez.', { ok: q === 'google' });
    history.replaceState(null, '', location.pathname);
  }, [toast]);
  // Atalho do ícone (tocar e manter no ecrã principal): «Nova despesa».
  const { open } = useOverlays();
  useEffect(() => {
    if (new URLSearchParams(location.search).get('juntar') !== 'despesa') return;
    history.replaceState(null, '', location.pathname);
    open(<ExpenseSheet />);
  }, [open]);
  const { me } = useSession();
  return (
    <>
      <p className="l" style={{ paddingTop: 8 }}>{hello()}, {me?.name}.</p>
      <AgendaPane />
      <Now />
      <MoneyLine />
      <GoalLine />
      <MonthClose />
      <FirstSteps />
    </>
  );
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/**
 * Fecho do mês em voz alta: na primeira visita ao início depois de um mês acabar, um cartaz com a tua parte
 * desse mês comparada com o teu normal. Aparece uma vez por mês e por pessoa.
 */
function MonthClose() {
  const { me, partner, house } = useSession();
  const { expenses } = useHouse();
  const key = `nikki_closed_${house?.id}_${me?.id}`;
  const [seen, setSeen] = useState(() => store.get(key));
  const c = useMemo(() => (expenses.loading || !me ? null : monthClose(expenses.rows.filter((e) => e.category !== INVEST), me.id, todayStr())), [expenses.rows, expenses.loading, me]);
  const done = useCallback(() => { if (c) { store.set(key, c.key); setSeen(c.key); } }, [c, key]);
  if (!c || seen === c.key) return null;
  const name = monthName(c.key);
  const band = c.pct === null ? 'Primeiro mês completo' : c.pct === 0 ? 'Igual ao teu normal' : `${Math.abs(c.pct)}% ${c.pct < 0 ? 'abaixo' : 'acima'} do teu normal`;
  return (
    <Poster
      lines={[name.toUpperCase(), 'FECHOU.']}
      band={band}
      foot={`${partner ? 'A tua parte' : 'Total'} em ${name} · ${eur(c.total, 0)} €`}
      how={c.normal
        ? <How><p className="s">{eur(c.total)} € em {name} ÷ {eur(c.normal)} € do teu normal = {(c.total / c.normal).toFixed(2).replace('.', ',')}.</p><p className="s">O normal é a média dos meses completos antes de {name}, até 6.</p></How>
        : <p className="s">A partir de agora, cada mês compara-se com o teu normal.</p>}
      share={`${cap(name)} fechou: ${band.toLowerCase()}. Contas feitas na NIKKI.`}
      onClose={done}
    />
  );
}

function Space({ to, ic, n, d, more }: { to: string; ic: string; n: string; d: string; more?: boolean }) {
  return (
    <Link className={`tile press sp${more ? ' more' : ''}`} to={to} aria-label={`${n}: ${d}`}>
      <span className="ic"><Icon n={ic} s={24} /></span>
      <span className="sp-t"><span className="sp-n">{n}</span><span className="s sp-d">{d}</span></span>
    </Link>
  );
}

/**
 * Espaços: Dinheiro, os módulos ligados nesta casa e Pessoas, cada um com uma linha do que lá está agora.
 * No fim, o caminho para ligar mais módulos.
 */
export function Spaces() {
  const { me, members, partner } = useSession();
  const { on, modules, shop, events, busy, deadlines, cars, goals, hk, gym } = useHouse();
  const hkc = hk.rows.find((r) => !r.archived);
  const m = useMonth(), L = useLedger(), w = useWealth('casa'), casaV = useCasa();
  const today = todayStr();
  const left = shop.rows.filter((i) => !i.done).length;
  const todayN = [...events.rows, ...busy.rows].filter((e) => toDateStr(new Date(e.starts_at)) === today).length;
  const due = deadlines.rows.filter((x) => !x.paid_at && x.due_on <= addDays(today, 7)).length;
  const detail: Record<string, string> = {
    compras: left ? `${left} por comprar` : 'lista vazia',
    agenda: todayN ? `${todayN} hoje` : 'nada hoje',
    casa: casaV.pending.length ? `${casaV.pending.length} por confirmar` : due ? `${due} ${due === 1 ? 'aviso' : 'avisos'}` : casaV.active.length ? `${eur(casaV.total, 0)} € por mês` : 'tudo em dia',
    housekeeping: hkc ? (isVisitDay(hkc.weekdays, today) && hkc.weekdays.length ? `${hkc.name} vem hoje` : `${hkc.name} · ${dayLabel(nextVisit(hkc.weekdays, today))}`) : 'por arrancar',
    garagem: ((n) => (n ? `${n} ${n === 1 ? 'carro' : 'carros'}` : 'sem carros'))(cars.rows.filter((c) => !c.archived).length),
    patrimonio: w.ready ? `${w.score.total} · ${w.score.level.toLowerCase()}` : '…',
    ginasio: ((x) => (x ? `${fmt(x.s.last, x.f.unit)} · ${x.f.label.toLowerCase()}` : gym.prefs ? 'sem avaliações' : 'por começar'))((() => { const f = gym.fields.find((y) => y.key === gym.prefs?.fields[0]); const s = f ? summary(gym.rows, f.key) : null; return f && s ? { f, s } : null; })()),
    objetivos: ((n) => (n ? `${n} ${n === 1 ? 'objetivo' : 'objetivos'}` : 'nenhum ainda'))(goals.rows.filter((g) => g.status === 'active').length),
  };
  const lit = MODULES.filter((x) => on(x.k));
  return (
    <>
      <Top title="Espaços" />
      <div className="lib">
        <Space to="/dinheiro" ic="coins" n="Dinheiro" d={`${eur(m.total, 0)} € em ${monthName(m.key).slice(0, 3)}${partner && L ? (L.even ? ' · quites' : ` · ${L.v > 0 ? 'adiantaste' : `${partner.name} adiantou`} ${eur(Math.abs(L.v), 0)} €`) : ''}`} />
        {/* Todos à vista: os que estão em uso com o que lá está; os outros começam com um toque (abrir é ligar). */}
        {lit.map((x) => <Space key={x.k} to={x.to} ic={x.ic} n={x.name} d={detail[x.k] ?? 'em breve'} />)}
        <Space to="/pessoas" ic="people" n="Pessoas" d={members.length === 1 ? `só ${me?.name ?? 'tu'}` : `${members.length} pessoas`} />
        {!modules.loading && MODULES.filter((x) => !on(x.k)).map((x) => <Space key={x.k} to={x.to} ic={x.ic} n={x.name} d="toca para começar" more />)}
      </div>
    </>
  );
}

const SOON: Record<string, [string, string]> = {
};

export function Soon({ k }: { k: string }) {
  const [t, d] = SOON[k] ?? ['Em breve', ''];
  return (
    <>
      <Top title={t} />
      <p className="l">Chega na próxima fase.</p>
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{d}</p>
      {k === 'patrimonio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Year free={0} label="Meses livres: 0 de 12" />
        <span className="s">Meses livres · 0 de 12. Cada mês do ano pinta-se quando o rendimento dos investimentos já o paga.</span>
      </div>}
    </>
  );
}

const STORY = [
  'A Nikki é uma chinchila. Cinzenta, macia e com aquela autoridade natural de quem nunca precisou de levantar a voz. As chinchilas, de resto, não levantam a voz. Levantam a taça. E depois atiram-na ao chão.',
  'Partilha a gaiola com o Balki. Partilha da mesma forma que um casal partilha o comando da televisão: é dos dois, mas há sempre um que o tem na mão.',
  'Quando o Balki está a comer, a Nikki chega, encosta-o com o focinho e fica com a taça. Não é egoísmo. É gestão de prioridades. Quando acaba, empurra a taça para o chão, que é a maneira que ela tem de dizer «assunto encerrado». Quem a vai buscar é o Balki. Ninguém lhe pede. Ninguém precisa.',
  'À hora do banho passa-se o mesmo. As chinchilas tomam banho em pó, o que revela uma espécie que olhou para a água e pensou: isto pode ser simplificado. A Nikki entra na banheira, o Balki sai. Sem drama, com a elegância de quem segura a porta. Há quem chame a isto ceder. O Balki chama-lhe paz.',
  'Ao fim do dia, depois de horas a mandar e a ser mandado, dormem os dois encostadinhos na casinha de madeira que foram roendo juntos. Já é mais janela do que parede. Não faz mal. Ninguém fica numa casa por causa das paredes.',
  'É assim que funciona uma boa equipa: há quem saiba onde está cada coisa, há quem vá buscar a taça, e à noite ninguém se lembra de quem empurrou quem.',
  'A NIKKI faz isso por nós. Sabe quanto gastámos, o que falta comprar, quem adiantou mais e quando é a revisão do carro. Põe ordem nas coisas pequenas, para sobrar espaço para as grandes. E, de vez em quando, dá-nos um empurrãozinho. Com o focinho, claro.',
];
export function Story() {
  return (
    <>
      <Top title="A história" />
      <div style={{ color: 'var(--ink)', padding: '16px 0 8px' }}><Wordmark h={48} draw alive /></div>
      <h1 className="l">Quem é a NIKKI</h1>
      <div className="story">{STORY.map((p) => <p key={p.slice(0, 12)}>{p}</p>)}<p className="sign">A NIKKI manda. Nós agradecemos.</p></div>
      <div className="tile" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--ink)' }}>
        <Wordmark h={20} />
        <p className="s">O nome é o logótipo. O primeiro K está espelhado e os dois K são mais pequenos: as hastes são os olhos e as pernas finas são os bigodes. No resto da app fica só a cara.</p>
        <button className="btn quiet press" style={{ alignSelf: 'flex-start' }} onClick={() => dispatchEvent(new Event('nikki:intro'))}>Ver a abertura outra vez</button>
      </div>
    </>
  );
}
