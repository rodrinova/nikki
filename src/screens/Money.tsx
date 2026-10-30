import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type CarRow, type ExpenseRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Whiskers } from '@/ui/Whiskers';
import { eur, monthSpend, monthlySeries, normalMonth, openingOf, pace, pairBalance, parseAmount, toU, type Split, whiskerLean } from '@/lib/money';
import { addDays, dayLabel, monthKey, monthName, nextMonth, prevMonth, todayStr } from '@/lib/dates';
import { store } from '@/lib/store';
import { useZoom } from '@/ui/zoom';
import { ZoomHint } from '@/ui/ZoomHint';
import { KIND_ASK, carKindOf, guess, parseQuick, splitOf, type Past } from '@/lib/quick';
import { pairEntries, pairFilter, type PairPeriod, type PairSort, type PairWho } from '@/lib/pairlog';
import { Hint, Top, useSeen } from './Home';
import { BillFields, billEntry, useBillChoice, useSaveBill, type BillEntry } from './Casa';
import { CarEntryFields, carEntry, checkEntry, entryWhy, lastOdometer, useLearnFromPayment, useSaveCarLog, type CarEntry } from './Garage';

export const CATEGORIES = ['Supermercado', 'Restaurantes', 'Casa', 'Contas', 'Carros', 'Lazer', 'Saúde', 'Roupa', 'Viagens', 'Future Me'];
export const INVEST = 'Future Me'; // investir não é gasto
/** O nome que se mostra: «Future Me» (como fica guardado) aparece como «Investir». */
export const catLabel = (c: string) => (c === INVEST ? 'Investir' : c);

/** "Do Rodrigo", "Da Inês"… sem saber o género, "De Marta". */
export const ofName = (n: string) => `De ${n}`;

/** Resumo de um mês da pessoa (por omissão, o corrente): parte dela, normal, ritmo. */
export function useMonth(at?: string) {
  const { me } = useSession();
  const { expenses } = useHouse();
  return useMemo(() => {
    const today = todayStr(), key = at ?? monthKey(today);
    const spend = expenses.rows.filter((e) => e.category !== INVEST);
    const m = monthSpend(spend, me?.id ?? '', key);
    // Os eventos (casamento, batizado…) contam no total do mês, mas à parte: o ritmo, o normal e as comparações
    // são só com o dia a dia (senão um casamento faria qualquer mês parecer fora do normal).
    const daily = spend.filter((e) => !e.occasion_id);
    const everyday = monthSpend(daily, me?.id ?? '', key).total;
    const normal = normalMonth(daily, me?.id ?? '', today);
    return { key, today, current: key === monthKey(today), ...m, everyday, events: m.total - everyday, normal, pace: pace(everyday, normal, today) };
  }, [expenses.rows, me?.id, at]);
}

export function useLedger() {
  const { me, partner } = useSession();
  const { expenses, transfers, openings } = useHouse();
  return useMemo(() => {
    if (!me || !partner) return null;
    const v = pairBalance(expenses.rows, transfers.rows, me.id, partner.id, openingOf(openings.rows, me.id, partner.id));
    const even = Math.abs(v) < 500; // menos de meio cêntimo
    const who = v > 0 ? me : partner;
    const lead = even ? 'Em equilíbrio' : v > 0 ? 'Adiantaste mais' : `${partner.name} adiantou mais`;
    return { v, even, who, lead, lean: whiskerLean(v) };
  }, [expenses.rows, transfers.rows, openings.rows, me, partner]);
}

/**
 * Dinheiro: um só sítio, com dois separadores quando são dois. «Gastos» responde a «quanto gastei?» (a tua parte,
 * pague quem pagar); «Entre nós» responde a «quem adiantou mais?» (quem pagou mais do que o combinado).
 */
export function Money() {
  const { partner } = useSession();
  const [sp, setSp] = useSearchParams();
  const us = !!partner && sp.get('ver') === 'entre-nos';
  return (
    <>
      <Top title="Dinheiro" />
      {partner && <div className="seg" role="tablist" aria-label="Dinheiro">
        <button type="button" role="tab" className="press" aria-selected={!us} aria-pressed={!us} onClick={() => setSp({}, { replace: true })}>Gastos</button>
        <button type="button" role="tab" className="press" aria-selected={us} aria-pressed={us} onClick={() => setSp({ ver: 'entre-nos' }, { replace: true })}>Entre nós</button>
      </div>}
      {partner && <p className="s">{us ? `Quem pagou mais do que o combinado, e como acertar.` : 'O que é teu, mês a mês, pague quem pagar.'}</p>}
      {us ? <Ledger embedded /> : <Spend />}
    </>
  );
}

/** O mês que se vê no separador Gastos: `?mes=AAAA-MM` (por omissão, o corrente; nunca depois dele). */
function useMonthParam(): [string, (k: string) => void] {
  const [sp, setSp] = useSearchParams();
  const cur = monthKey(todayStr()), q = sp.get('mes');
  const key = q && /^\d{4}-\d{2}$/.test(q) && q <= cur ? q : cur;
  const set = (k: string) => { const n = new URLSearchParams(sp); if (k === cur) n.delete('mes'); else n.set('mes', k); setSp(n, { replace: true }); };
  return [key, set];
}

const monthTitle = (k: string, year = monthKey(todayStr()).slice(0, 4)) => { const n = monthName(k); return `${n[0].toUpperCase()}${n.slice(1)}${k.slice(0, 4) !== year ? ` ${k.slice(0, 4)}` : ''}`; };

function Spend() {
  const { me, partner } = useSession();
  const { expenses, occasions } = useHouse();
  const [key, setKey] = useMonthParam();
  const m = useMonth(key);
  const p = m.pace;
  const seen = useSeen('money');
  const spendRows = useMemo(() => expenses.rows.filter((e) => e.category !== INVEST && !e.occasion_id), [expenses.rows]);
  // Para o gráfico: desde o primeiro registo (até 10 anos), com pelo menos 12 meses.
  const hist = useMemo(() => {
    const s = monthlySeries(spendRows, me?.id ?? '', todayStr(), 120);
    const i = s.first ? s.months.findIndex((m) => m.key >= s.first!) : s.months.length;
    // O que foi de eventos, mês a mês, por cima de cada barra (contam no mês, mas à parte).
    const ev = monthlySeries(expenses.rows.filter((e) => e.category !== INVEST && !!e.occasion_id), me?.id ?? '', todayStr(), 120);
    const evBy = new Map(ev.months.map((x) => [x.key, x.total]));
    return { months: s.months.slice(Math.min(i, s.months.length - 12)).map((x) => ({ ...x, events: evBy.get(x.key) ?? 0 })) };
  }, [spendRows, expenses.rows, me?.id]);
  const evNames = useMemo(() => [...new Set(expenses.rows.filter((e) => e.occasion_id && monthKey(e.spent_on) === key).map((e) => occasions.rows.find((o) => o.id === e.occasion_id)?.name).filter(Boolean))].join(', '), [expenses.rows, occasions.rows, key]);
  const vsAvg = !m.current && m.normal && m.everyday > 0 ? Math.round((m.everyday / m.normal - 1) * 100) : null;
  return (
    <>
      <div className="mnav">
        <button type="button" className="tb press" aria-label="Mês anterior" onClick={() => setKey(prevMonth(key))}><Icon n="arrow" s={16} /></button>
        <span className="mnav-t">{monthTitle(key)}{!m.current && <button type="button" className="mnav-now press" onClick={() => setKey(monthKey(todayStr()))}>Este mês</button>}</span>
        <button type="button" className="tb press" aria-label="Mês seguinte" disabled={m.current} onClick={() => setKey(nextMonth(key))}><Icon n="arrow" s={16} /></button>
      </div>
      <div className="swap" key={key}><p className="xl">{eur(m.total, 0)}<small>€</small></p><p className="s" style={{ marginTop: 8 }}>{partner ? `A tua parte em ${monthName(m.key)}` : monthTitle(m.key)}{vsAvg !== null ? ` · ${vsAvg === 0 ? 'no teu normal' : `${Math.abs(vsAvg)}% ${vsAvg > 0 ? 'acima' : 'abaixo'} do teu normal`}` : ''}</p></div>
      {m.events > 0 && <p className="s why"><span className="dot" aria-hidden="true" /><span>{eur(m.everyday, 0)} € do dia a dia + {eur(m.events, 0)} € {evNames ? `do ${evNames}` : 'de eventos'}. Os eventos contam à parte: ficam fora do ritmo e do normal.</span></p>}
      {partner && <Hint show={seen < 3}>A tua parte é o que é só teu mais a tua percentagem das partilhadas. Não depende de quem pagou.</Hint>}
      {m.current && (p.fresh
        ? <p className="s why"><span className="dot" aria-hidden="true" /><span>Ritmo: no fim do primeiro mês completo a NIKKI já conhece o teu normal e começa a comparar.</span></p>
        : <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="bar31" style={{ gridTemplateColumns: `repeat(${p.days},minmax(0,1fr))` }} role="img" aria-label={`Ritmo ${p.pct}%`}>
              {Array.from({ length: p.days }, (_, j) => <i key={j} className={`${j < p.blocks ? (j < p.day ? 'f' : 'a') : ''}${j === p.day - 1 ? ' today' : ''}`} />)}
            </div>
            <span className="s">Ritmo · {p.pct === 0 ? 'no ritmo habitual' : `${Math.abs(p.pct)}% ${p.pct > 0 ? 'acima' : 'abaixo'} do ritmo habitual`}</span>
          </div>
          <Hint show={seen < 3}>Cada bloco é um dia de um mês normal. Os cheios já foram gastos; os laranja são gasto adiantado.</Hint>
        </>)}
      <YearBars months={hist.months} normal={m.normal} sel={key} onPick={setKey} />
      <div className="tile card rows">
        {m.current && !p.fresh && <div><span className="k">Fecho previsto{seen < 3 && <span className="s" style={{ display: 'block' }}>se o resto do mês for normal</span>}</span><span className="v">{eur(p.forecast, 0)} €</span></div>}
        {m.byCat.length > 0 && <Link className="press" to={m.current ? '/dinheiro/categorias' : `/dinheiro/categorias?mes=${key}`}><span className="k">Categorias</span><span className="v">{m.byCat.length}<Icon n="arrow" s={16} /></span></Link>}
        <ExpenseButton />
      </div>
      <Movements monthKey={key} />
    </>
  );
}

/**
 * Gasto mês a mês (a tua parte, sem investir): o dia a dia em barra e, por cima e mais claro, o que foi de eventos.
 * A linha é o teu normal (o mesmo do ritmo: média do dia a dia nos últimos 12 meses completos). Abre nos últimos 12;
 * dois dedos mudam a escala (de 3 meses a tudo); um toque numa barra abre esse mês.
 */
function YearBars({ months, normal, sel, onPick }: { months: { key: string; total: number; events: number; current: boolean }[]; normal: number | null; sel: string; onPick: (k: string) => void }) {
  const n = months.length;
  const z = useZoom(0, n, Math.min(n, 3), [Math.max(0, n - 12), n]);
  if (!months.some((m) => m.total + m.events > 0)) return null;
  const [a, b] = z.win;
  const W = 340, H = 120, T = 14, B = 18;
  const vis = months.map((m, i) => ({ ...m, i })).filter((m) => m.i + 1 > a + 1e-9 && m.i < b - 1e-9);
  const hi = Math.max(...vis.map((m) => m.total + m.events), normal ?? 0) || 1;
  const unit = W / (b - a), gap = Math.min(4, unit * 0.2), bw = unit - gap;
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const many = vis.length > 14, step = Math.ceil(vis.length / 12);
  const lab = (m: { key: string; i: number }) => {
    const mm = m.key.slice(5, 7);
    if (many) return mm === '01' ? `’${m.key.slice(2, 4)}` : m.i % step === 0 && step < 3 ? monthName(m.key).slice(0, 1).toUpperCase() : '';
    return monthName(m.key).slice(0, 1).toUpperCase();
  };
  const full = Math.round(b - a);
  const anyEv = vis.some((m) => m.events > 0);
  return (
    <figure className="ybars" aria-label="Gasto mês a mês">
      <div className="wbar"><span className="s">{full >= n && n > 12 ? `Desde ${monthName(months[0].key).slice(0, 3)} ${months[0].key.slice(0, 4)}` : `${full} meses`}</span>{normal !== null && <span className="s"><i className="ybars-avg-k" aria-hidden="true" />o teu normal {eur(normal, 0)} €</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" {...z.bind}>
        {vis.map((m) => {
          const x = (m.i - a) * unit + gap / 2, h = Math.max(m.total > 0 ? 2 : 0, H - B - y(m.total)), he = m.events > 0 ? Math.max(2, H - B - y(m.events)) : 0;
          return (
            <g key={m.key} className={`yb${m.key === sel ? ' on' : ''}${m.current ? ' cur' : ''}`} role="button" tabIndex={0} aria-label={`${monthTitle(m.key)}: ${eur(m.total, 0)} € do dia a dia${m.events > 0 ? ` e ${eur(m.events, 0)} € de eventos` : ''}${m.current ? ' (em curso)' : ''}`} aria-pressed={m.key === sel}
              onClick={() => onPick(m.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(m.key); } }}>
              <rect x={x - gap / 2} y={0} width={unit} height={H} className="yb-hit" />
              <rect x={x} y={H - B - h} width={bw} height={h} rx={Math.min(3, bw / 3)} className="yb-bar" />
              {he > 0 && <rect x={x} y={H - B - h - he - 1} width={bw} height={he} rx={Math.min(3, bw / 3)} className="yb-ev" />}
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="gc-ax">{lab(m)}</text>
            </g>
          );
        })}
        {normal !== null && <line x1={0} x2={W} y1={y(normal)} y2={y(normal)} className="ybars-avg" />}
      </svg>
      {anyEv && <p className="s ybars-key"><i aria-hidden="true" />eventos, por cima do dia a dia (ficam fora do normal)</p>}
      {n > 3 && <ZoomHint z={z} />}
    </figure>
  );
}

function ExpenseButton() {
  const { open } = useOverlays();
  return <button className="press" onClick={() => open(<ExpenseSheet />)}><span className="k">Registar uma despesa</span><span className="v"><Icon n="plus" s={18} /></span></button>;
}

const MOVES = 40;
type MoveWho = 'me' | 'all';

/**
 * As despesas do mês. Por omissão, as que pagaste tu (as tuas e as partilhadas que adiantaste): quem junta talões e
 * os regista de uma vez vê logo até onde já registou. «Tudo» junta as que a outra pessoa pagou e te dizem respeito.
 */
function Movements({ monthKey: key }: { monthKey: string }) {
  const { me, members, partner } = useSession();
  const { expenses } = useHouse();
  const { open } = useOverlays();
  const [who, setWhoS] = useState<MoveWho>(() => (store.get('nikki_moves_who') === 'all' ? 'all' : 'me'));
  const setWho = (w: MoveWho) => { setWhoS(w); store.set('nikki_moves_who', w); };
  const [n, setN] = useState(MOVES);
  useEffect(() => setN(MOVES), [key, who]);
  const mineAll = useMemo(() => expenses.rows.filter((e) => e.paid_by === me?.id), [expenses.rows, me?.id]);
  const last = useMemo(() => mineAll.reduce<ExpenseRow | null>((b, e) => (!b || e.spent_on > b.spent_on ? e : b), null), [mineAll]);
  const month = expenses.rows.filter((e) => monthKey(e.spent_on) === key);
  const list = (who === 'me' && partner ? month.filter((e) => e.paid_by === me?.id) : month)
    .sort((a, b) => (a.spent_on !== b.spent_on ? (a.spent_on < b.spent_on ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';
  const lbl = (e: ExpenseRow) => e.split === 'mine' ? (e.paid_by === me?.id ? 'Minha' : name(e.paid_by)) : e.split === 'shared' ? `Partilhada · pagou ${e.paid_by === me?.id ? 'tu' : name(e.paid_by)}` : e.other_id === me?.id ? `Tua · pagou ${name(e.paid_by)}` : ofName(name(e.other_id));
  const paidMe = month.filter((e) => e.paid_by === me?.id).length;
  return (
    <section className="stack" aria-label="Despesas do mês">
      <div className="wbar"><span className="s">Despesas de {monthName(key)}</span><span className="s">{list.length}</span></div>
      {partner && <div className="chips" role="group" aria-label="Quem pagou">
        <button className="press" aria-pressed={who === 'me'} onClick={() => setWho('me')}>Pagaste tu ({paidMe})</button>
        <button className="press" aria-pressed={who === 'all'} onClick={() => setWho('all')}>Tudo ({month.length})</button>
      </div>}
      {last && <p className="s why"><span className="dot" aria-hidden="true" /><span>Registaste até {dayLabel(last.spent_on)}{last.spent_on.slice(0, 4) !== todayStr().slice(0, 4) ? ` ${last.spent_on.slice(0, 4)}` : ''}: a mais recente que pagaste foi {last.note || catLabel(last.category)} ({eur(toU(last.amount))} €).</span></p>}
      {!list.length
        ? <p className="s">{who === 'me' && month.length ? `Não pagaste nenhuma despesa em ${monthName(key)}.` : `Sem despesas em ${monthName(key)}.`}</p>
        : <div className="tile card rows">{list.slice(0, n).map((e) => (
          <button key={e.id} className={`press${partner && e.paid_by === me?.id ? ' paid-me' : ''}`} onClick={() => open(<ExpenseDetail e={e} label={lbl(e)} />)}>
            <span className="k" style={{ color: 'var(--ink)' }}>{e.note || catLabel(e.category)}<span className="s" style={{ display: 'block' }}>{dayLabel(e.spent_on)} · {lbl(e)}</span></span>
            <span className="v">{eur(toU(e.amount))} €</span>
          </button>
        ))}</div>}
      {list.length > n && <button className="btn quiet wide press" onClick={() => setN(n + MOVES)}>Mostrar mais ({list.length - n}) <Icon n="arrow" s={20} /></button>}
    </section>
  );
}

function ExpenseDetail({ e, label }: { e: ExpenseRow; label: string }) {
  const { me } = useSession();
  const { close, toast } = useOverlays();
  const mine = e.created_by === me?.id || e.paid_by === me?.id;
  async function del() {
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    if (error) toast(error.message); else { close(); toast('Despesa apagada.'); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="xl">{eur(toU(e.amount))}<small>€</small></p>
      <div className="tile card rows" style={{ background: 'var(--tile-2)' }}>
        <div><span className="k">Categoria</span><span className="v">{catLabel(e.category)}</span></div>
        <div><span className="k">Dia</span><span className="v">{dayLabel(e.spent_on)}</span></div>
        <div><span className="k">De quem é</span><span className="v">{label}</span></div>
        {e.note && <div><span className="k">Nota</span><span className="v">{e.note}</span></div>}
      </div>
      {mine && <button className="btn quiet wide press" onClick={del}>Apagar <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

/** Despesa: valor, categoria, Minha · Partilhada · Do outro, dia e nota. Quem paga é quem regista. */
export function ExpenseSheet() {
  const learn = useLearnFromPayment();
  const saveLog = useSaveCarLog();
  const { me, partner, house, myShare } = useSession();
  const { cars, carLogs, on, expenses, occasions } = useHouse();
  // Eventos a decorrer (casamento, batizado…): a despesa pode ficar ligada a um. Mantém-se em «Guardar e outra».
  const occs = on('eventos') ? occasions.rows.filter((o) => !o.archived) : [];
  const [occSet, setOcc] = useState<string | null | undefined>(undefined);
  const { close, toast } = useOverlays();
  // Num gesto: «45 pingo doce» dá o valor e a nota; pode escrever-se tudo («ontem», «dia 3», «partilhada», «minha»,
  // «para a Inês», «pagou a Inês», «60/40», «lazer», o carro, o evento). O que não se escreve adivinha-se pelo que
  // fizeste antes. O que se escreve manda; tudo se pode mudar em «Mudar».
  const garage = on('garagem') ? cars.rows.filter((c) => !c.archived) : [];
  const [text, setText] = useState('');
  const q = parseQuick(text, todayStr(), { partner: partner?.name, cats: CATEGORIES, cars: garage, occasions: occs });
  const note = q.note;
  const g = useMemo(() => guess(note, expenses.rows as Past[], me?.id ?? '', !!partner, CATEGORIES), [note, expenses.rows, me?.id, partner]);
  const [catSet, setCat] = useState<string | null>(null);
  const cat = catSet ?? q.category ?? g.category;
  const occ = occSet === undefined ? q.occasion ?? null : occSet;
  const [paidSet, setPaid] = useState<'me' | 'partner' | null>(null);
  const paidBy = partner ? paidSet ?? q.paidBy ?? 'me' : 'me';
  const [splitSet, setSplit] = useState<Split | null>(null);
  const [daySet, setDay] = useState<'hoje' | 'ontem' | 'outro' | null>(null);
  const day = daySet ?? (q.day && q.day !== todayStr() ? 'outro' : 'hoje');
  const [dateSet, setDate] = useState<string | null>(null);
  const date = dateSet ?? q.day ?? todayStr();
  const [more, setMore] = useState(false);
  // Na dúvida, a NIKKI pergunta antes de gravar: «Abastecimento do Golf?», «Supermercado, partilhada?».
  const [ok, setOk] = useState(false);
  const [noKm, setNoKm] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // «Guardar e outra»: a folha fica aberta, com a mesma categoria, divisão e dia, para registar várias seguidas.
  const [done, setDone] = useState<{ n: number; total: number; last: string } | null>(null);
  const amtRef = useRef<HTMLInputElement>(null);
  // Em Carros, com a Garagem ligada: de que carro, que despesa, e os litros e km (como no Abastecer da Garagem).
  const [carSet, setCarId] = useState<string | null>(null);
  const carId = carSet ?? q.car ?? null;
  // O carro: o escolhido; senão o da última despesa com o mesmo sítio; senão o último usado; senão o meu.
  const mineCar = expenses.rows.filter((e) => e.created_by === me?.id && e.car_id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const sameCar = note ? mineCar.find((e) => (e.note ?? '').toLowerCase().startsWith(note.toLowerCase().split(' ')[0])) : undefined;
  const pick = garage.find((c) => c.id === carId) ?? garage.find((c) => c.id === (sameCar ?? mineCar[0])?.car_id) ?? garage.find((c) => c.owner_id === me?.id) ?? garage[0];
  // Os campos do carro: depois do valor, ou logo que a nota diz que é do carro (para começar pela foto do talão).
  const car = cat === 'Carros' && (q.amount || (note && g.why !== 'default')) ? pick : undefined;
  // A despesa de um carro fica, por defeito, de quem é o carro (como na Garagem); pode mudar-se a seguir.
  const splitFor = (c: CarRow): Split => (!partner || c.owner_id === me?.id ? 'mine' : c.owner_id === null ? 'shared' : 'other');
  const split: Split = splitSet ?? q.split ?? (cat === 'Carros' && pick ? splitFor(pick) : cat !== g.category ? splitOf(cat, expenses.rows as Past[], me?.id ?? '', !!partner) : g.split);
  // A parte de quem paga numa partilhada: a escrita («60/40») ou a combinada (de quem pagou).
  const payerShare = q.share ?? (paidBy === 'me' ? myShare : 1 - myShare);
  const partnerPaid = !!partner && paidBy === 'partner';
  const splitWord = partner ? (split === 'shared' ? 'partilhada' : split === 'mine' ? 'só tua' : `de ${partner.name}`) : '';
  const [entry, setEntry] = useState<{ car: string; f: CarEntry } | null>(null);
  const f = car ? (entry && entry.car === car.id ? entry.f : carEntry(car, carKindOf(note, car.energy === 'eletrico'))) : null;
  const setF = (x: CarEntry) => car && setEntry({ car: car.id, f: x });
  const last = car ? lastOdometer(carLogs.rows, car) : null;
  const v = q.amount ? parseAmount(q.amount) : null;
  const spentOn = day === 'hoje' ? todayStr() : day === 'ontem' ? addDays(todayStr(), -1) : date;
  // Em Contas ou Casa, com a Casa ligada: de que conta fixa é (reconhecida pela nota e pelo valor, ou escolhida).
  const [bf, setBf] = useState<BillEntry>(billEntry);
  const bc = useBillChoice(cat, note, v ? toU(v) : 0, spentOn, bf);
  // Tem a certeza quando foi a pessoa a escolher ou quando repete o que fez antes no mesmo sítio (num carro, pergunta sempre).
  const sure = ok || catSet !== null || carSet !== null || !!q.category || (g.why === 'history' && cat !== 'Carros');
  const ask = cat === 'Carros' && car && f ? `${KIND_ASK[f.kind]} do ${car.name}${partner ? `, ${splitWord}` : ''}?` : `${bc.bill ? bc.bill.name : catLabel(cat)}${partner ? `, ${splitWord}` : ''}?`;
  const saveBill = useSaveBill();
  const pct = Math.round(myShare * 100);
  const mineShare = paidBy === 'me' ? payerShare : 1 - payerShare;
  const mp = Math.round(mineShare * 100);
  const hint = !v ? '' : !partner ? 'Em teu nome.' : split === 'shared'
    ? `Partilhada ${mp}/${100 - mp}${q.share === undefined ? '' : ' (escrito)'}: ${eur(toU(v) * mineShare)} € na tua parte, ${eur(toU(v) * (1 - mineShare))} € na parte de ${partner.name}.${partnerPaid ? ` Pagou ${partner.name}.` : ''}${q.share === undefined && pct === mp ? ' A percentagem muda-se em Pessoas.' : ''}`
    : split === 'other' ? `Toda na parte de ${partner.name}. ${partnerPaid ? `Pagou ${partner.name}.` : 'Pagaste tu.'}` : partnerPaid ? `Só tua. Pagou ${partner.name}.` : 'Só tua.';

  async function save(e: FormEvent) {
    e.preventDefault();
    const again = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.again === '1';
    if (!v) return setErr('Falta o valor: por exemplo «12,35 farmácia».');
    if (!me || !house) return;
    const spent_on = spentOn;
    if (!sure) return setErr(`Confirma primeiro: ${ask}`);
    const n = car && f ? checkEntry(car, f, last) : null;
    if (typeof n === 'string') return setErr(n);
    if (car && f && (f.kind === 'fuel' || f.kind === 'charge') && !f.odo.trim() && !noKm) return setErr('E os km do conta-quilómetros? Sem eles, não entra no consumo.');
    setBusy(true);
    const { data, error } = await supabase.from('expenses').insert({
      household_id: house.id, created_by: me.id, amount: v, category: cat, spent_on, car_id: car?.id ?? null, occasion_id: occs.some((o) => o.id === occ) ? occ : null,
      // Quem pagou: tu, ou a outra pessoa (escrito «pagou a Inês» ou escolhido em «Mudar»).
      ...(partnerPaid
        ? { paid_by: partner!.id, split: split === 'shared' ? 'shared' : split === 'mine' ? 'other' : 'mine', other_id: split === 'other' ? null : me.id, payer_share: split === 'shared' ? payerShare : null }
        : { paid_by: me.id, split, other_id: split === 'mine' || !partner ? null : partner.id, payer_share: split === 'shared' ? payerShare : null }),
      note: (car ? `${note.trim() || (f!.kind === 'fuel' ? 'Combustível' : f!.kind === 'charge' ? 'Carregamento' : f!.kind === 'toll' ? 'Portagens' : f!.kind === 'service' ? 'Oficina' : 'Carro')} · ${car.name}` : note.trim()).slice(0, 120) || null,
    }).select('id').single();
    if (!error && car && f && n) {
      const { error: e2 } = await saveLog(car, f, n, (data as { id: string }).id, v, spent_on, note);
      if (e2) { setBusy(false); return setErr(e2.message); }
      carLogs.reload();
    }
    setBusy(false);
    if (error) return setErr(error.message);
    const billErr = await saveBill(bc, bf, (data as { id: string }).id, v, spent_on);
    if (again) {
      setDone((d) => ({ n: (d?.n ?? 0) + 1, total: (d?.total ?? 0) + toU(v), last: `${eur(toU(v))} € · ${car ? car.name : note.trim() || cat}` }));
      setText(''); setCat(null); setSplit(null); setDay(null); setDate(null); setMore(false); setOk(false); setNoKm(false); setErr(''); setEntry(null); setBf(billEntry()); setPaid(null); setOcc(undefined); setCarId(null);
      setTimeout(() => amtRef.current?.focus(), 30);
    } else close();
    if (billErr) toast(`A despesa ficou, mas não ficou ligada à conta: ${billErr}`);
    // Um pagamento em Carros com «IUC» ou o nome da seguradora na nota ensina a Garagem (mês, data e valor).
    const learned = cat === 'Carros' && note.trim() && (!f || f.kind === 'other' || f.kind === 'service') ? await learn({ car, note }, toU(v), spent_on) : null;
    if (!again || learned) toast(learned ?? `${eur(toU(v))} € · ${car ? car.name : cat}${n && n.litres !== null ? ` · ${String(n.litres).replace('.', ',')} L` : ''}${bc.bill && bf.pick !== 'none' ? ` · ${bc.bill.name}` : ''} · ${dayLabel(spent_on)}${partner ? ' · ' + (split === 'shared' ? 'partilhada' : split === 'mine' ? 'minha' : `de ${partner.name}`) + (partnerPaid ? ` · pagou ${partner.name}` : '') : ''}`, { ok: true });
  }

  const chip = (on: boolean, txt: string, f: () => void) => <button type="button" className="press" aria-pressed={on} onClick={f} key={txt}>{txt}</button>;
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {done && <p className="s why"><span className="dot" aria-hidden="true" /><span>Guardada: {done.last}. {done.n > 1 ? `Já são ${done.n}, ${eur(done.total)} €. ` : ''}Mais uma:</span></p>}
      <label className="sr" htmlFor="amt">Valor e onde (ex.: 45 pingo doce)</label>
      <input id="amt" ref={amtRef} className="field quick" placeholder="45 pingo doce ontem partilhada" autoFocus value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} enterKeyHint="done" />
      {v && !sure ? <div className="ask-card" role="group" aria-label="Confirmar">
        <span className="l">{eur(toU(v))} €</span>
        <p className="ask-q">{ask}</p>
        <div className="ask-btns">
          <button type="button" className="btn press" onClick={() => { setOk(true); setErr(''); }}>Sim</button>
          <button type="button" className="btn quiet press" onClick={() => { setOk(true); setMore(true); setErr(''); }}>Mudar</button>
        </div>
      </div> : v ? <div className="quick-sum">
        <span className="l">{eur(toU(v))} €</span>
        <button type="button" className="chip-sum press" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>{[car ? car.name : catLabel(cat), partner ? (split === 'shared' ? `partilhada${q.share !== undefined ? ` ${mp}/${100 - mp}` : ''}` : split === 'mine' ? 'minha' : `de ${partner.name}`) : '', partnerPaid ? `pagou ${partner!.name}` : '', dayLabel(spentOn), occ ? occs.find((o) => o.id === occ)?.name ?? '' : ''].filter(Boolean).join(' · ')}</span>
          <span className="s">{more ? 'Fechar' : 'Mudar'}</span>
        </button>
      </div> : <QuickHint q={q} partner={partner?.name} err={err} cars={garage} occs={occs} />}
      {v && (err || (more && split === 'shared' && hint)) ? <p className="s" style={{ marginTop: -8 }}>{err || hint}</p> : null}
      {more && <div className="chips wrap" role="group" aria-label="Categoria">{CATEGORIES.map((c) => chip(cat === c, catLabel(c), () => setCat(c)))}</div>}
      {(sure || !v) && car && f && <div className="form">
        {garage.length > 1 && <div className="chips" role="group" aria-label="Carro">{garage.map((c) => chip(car.id === c.id, c.name, () => { setCarId(c.id); setSplit(splitFor(c)); }))}</div>}
        <CarEntryFields car={car} f={f} set={setF} last={last} pickKind onAmount={(a) => setText(`${a.toFixed(2).replace('.', ',')} ${note || 'Combustível'}`)} />
        <p className="s why"><span className="dot" aria-hidden="true" /><span>{entryWhy(f)}</span></p>
        {(f.kind === 'fuel' || f.kind === 'charge') && !f.odo.trim() && <label className="check s"><input type="checkbox" checked={noKm} onChange={(e) => setNoKm(e.target.checked)} /> Não sei os km agora</label>}
      </div>}
      {sure && <BillFields c={bc} f={bf} set={setBf} amount={v ? toU(v) : 0} spent_on={spentOn} />}
      {v && sure && occs.length > 0 && <div className="chips" role="group" aria-label="Evento">{chip(!occ, 'Sem evento', () => setOcc(null))}{occs.map((o) => chip(occ === o.id, o.name, () => setOcc(o.id)))}</div>}
      {more && partner && <div className="seg" role="group" aria-label="De quem é">
        {chip(split === 'mine', 'Minha', () => setSplit('mine'))}{chip(split === 'shared', 'Partilhada', () => setSplit('shared'))}{chip(split === 'other', ofName(partner.name), () => setSplit('other'))}
      </div>}
      {more && partner && <div className="seg" role="group" aria-label="Quem pagou">
        {chip(paidBy === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paidBy === 'partner', `Pagou ${partner.name}`, () => setPaid('partner'))}
      </div>}
      {more && <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}{chip(day === 'outro', 'Outro dia', () => setDay('outro'))}</div>}
      {more && day === 'outro' && <input className="field" type="date" aria-label="Dia da despesa" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />}
      <div className="save-two">
        <button className="btn quiet press" data-again="1" disabled={busy}>Guardar e outra</button>
        <button className="btn press" disabled={busy}>{done ? 'Guardar e fechar' : `Guardar · ${me?.name}`} <Icon n="arrow" s={20} /></button>
      </div>
      {done && <button type="button" className="back press" onClick={close}>Fechar ({done.n} {done.n === 1 ? 'guardada' : 'guardadas'})</button>}
    </form>
  );
}

/**
 * Por baixo do texto, enquanto ainda não há valor: o que a NIKKI já percebeu (dia, divisão, quem pagou, categoria,
 * carro, evento) ou, sem nada escrito, o que se pode escrever.
 */
function QuickHint({ q, partner, err, cars, occs }: { q: ReturnType<typeof parseQuick>; partner?: string; err: string; cars: { id: string; name: string }[]; occs: { id: string; name: string }[] }) {
  if (err) return <p className="s" style={{ minHeight: 18 }}>{err}</p>;
  const got = [
    q.day ? dayLabel(q.day) : '',
    q.split === 'shared' ? `partilhada${q.share !== undefined ? ` ${Math.round(q.share * 100)}/${100 - Math.round(q.share * 100)}` : ''}` : q.split === 'mine' ? 'minha' : q.split === 'other' && partner ? `de ${partner}` : '',
    q.paidBy === 'partner' && partner ? `pagou ${partner}` : '',
    q.car ? cars.find((c) => c.id === q.car)?.name ?? '' : q.category ? catLabel(q.category) : '',
    q.occasion ? occs.find((o) => o.id === q.occasion)?.name ?? '' : '',
  ].filter(Boolean);
  if (got.length) return <p className="s qk-got" style={{ minHeight: 18 }}>{got.map((x) => <span key={x}>{x}</span>)}<span className="s">falta o valor</span></p>;
  return <p className="s" style={{ minHeight: 18 }}>{`O valor e onde, e o resto se quiseres: «ontem», «dia 3», «partilhada», «minha»${partner ? `, «pagou a ${partner}»` : ''}, «lazer».`}</p>;
}

export function Cats() {
  const [key] = useMonthParam();
  const m = useMonth(key);
  const mx = m.byCat[0]?.[1] ?? 1;
  return (
    <>
      <Top title="Categorias" />
      {!m.byCat.length ? <p className="s">{m.current ? 'Ainda sem despesas este mês.' : `Sem despesas em ${monthName(m.key)}.`}</p> : <>
        <p className="s">A tua parte em {monthName(m.key)}</p>
        <div className="tile card rows">{m.byCat.map(([n, v]) => (
          <div key={n} style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 8, padding: '10px 0' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span>{eur(v, 0)} €</span></span>
            <span style={{ height: 2, background: 'var(--tile-2)', display: 'block' }}><span style={{ display: 'block', height: 2, width: `${((v / mx) * 100).toFixed(1)}%`, background: 'var(--ink)' }} /></span>
          </div>
        ))}</div>
      </>}
    </>
  );
}

export function Ledger({ embedded }: { embedded?: boolean }) {
  const { me, partner, myShare } = useSession();
  const { expenses, transfers } = useHouse();
  const { open } = useOverlays();
  const L = useLedger();
  const seen = useSeen('ledger');
  if (!me || !partner || !L) return (
    <>{!embedded && <Top title="Entre nós" />}<p className="l">Aparecem quando alguém se junta à casa.</p><p className="s" style={{ fontSize: 'var(--t-m)' }}>Mostram quem adiantou mais nas despesas partilhadas.</p><Link className="btn quiet wide press" to="/pessoas">Convidar <Icon n="arrow" s={20} /></Link></>
  );
  // Esforço: quanto cada um pagou do que é partilhado ou do outro.
  const pair = expenses.rows.filter((e) => e.split !== 'mine' && [e.paid_by, e.other_id].includes(me.id) && [e.paid_by, e.other_id].includes(partner.id));
  const paid = (id: string) => pair.filter((e) => e.paid_by === id).reduce((t, e) => t + toU(e.amount), 0);
  const pm = paid(me.id), pp = paid(partner.id), T = pm + pp;
  const sent = transfers.rows.filter((t) => t.from_id === me.id && t.to_id === partner.id).reduce((s, t) => s + toU(t.amount), 0), got = transfers.rows.filter((t) => t.to_id === me.id && t.from_id === partner.id).reduce((s, t) => s + toU(t.amount), 0);
  // Esforço de cada um: o que pagou das partilhadas, mais o que transferiu ao outro, menos o que recebeu.
  const a = T ? Math.max(0, Math.min(100, ((pm + sent - got) / T) * 100)) : 50;
  const pct = Math.round(myShare * 100);
  return (
    <>
      {!embedded && <Top title="Entre nós" />}
      <div className="swap"><p className="xl">{eur(Math.abs(L.v))}<small>€</small></p><p className="s" style={{ marginTop: 8 }}>{L.even ? 'Estão quites' : L.v > 0 ? `Adiantaste a mais (o combinado é ${Math.round(myShare * 100)}/${100 - Math.round(myShare * 100)})` : `${partner.name} adiantou a mais (o combinado é ${Math.round(myShare * 100)}/${100 - Math.round(myShare * 100)})`}</p></div>
      <Hint show={seen < 3}>{`Quanto cada um adiantou face ao combinado (${pct}/${100 - pct}). Não é uma dívida: serve para distribuírem o esforço.`}</Hint>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0 4px', color: 'var(--ink)' }}>
          <Whiskers h={112} lean={L.lean} label={L.even ? 'Em equilíbrio: os bigodes estão iguais, como no logótipo.' : `${L.lead}: os bigodes do lado de ${L.v > 0 ? 'ti' : partner.name} estão maiores e a laranja.`} />
        </div>
        <div className="s" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tu {Math.round(a)}%</span><span>combinado {pct}/{100 - pct}</span><span>{partner.name} {100 - Math.round(a)}%</span></div>
      </div>
      {!L.even && <p className="s why"><span className="dot" aria-hidden="true" /><span>Para equilibrar sem transferências, as próximas partilhadas ficam com {L.v > 0 ? partner.name : 'contigo'}.</span></p>}
      <button className={`btn wide press${L.even ? ' quiet' : ''}`} onClick={() => open(<TransferSheet />)}>{L.even ? 'Registar uma transferência' : 'Equilibrar com uma transferência'}<Icon n="arrow" s={20} /></button>
      <PairLog />
    </>
  );
}

const PAGE = 40;

/**
 * Movimentos a dois: quem pagou quanto, em que despesa e quando, e o efeito de cada um nas contas a dois.
 * Ao fim de anos, os totais acumulados não dizem nada; a lista diz. Do mais recente para o mais antigo.
 */
function PairLog() {
  const { me, partner } = useSession();
  const { expenses, transfers } = useHouse();
  const [q, setQ] = useState('');
  const [who, setWho] = useState<PairWho>('all');
  const [period, setPeriod] = useState<PairPeriod>('all');
  const [sort, setSort] = useState<PairSort>('new');
  const [n, setN] = useState(PAGE);
  const all = useMemo(() => (me && partner ? pairEntries(expenses.rows, transfers.rows, me.id, partner.id) : []), [expenses.rows, transfers.rows, me, partner]);
  const names = useMemo(() => ({ [me!.id]: me!.name, [partner!.id]: partner!.name }), [me, partner]);
  const list = useMemo(() => pairFilter(all, { q, who, period, sort, me: me!.id, names, today: todayStr() }), [all, q, who, period, sort, me, names]);
  useEffect(() => setN(PAGE), [q, who, period, sort]);
  const p = partner!.name;
  const effect = (v: number, transfer: boolean) => (Math.abs(v) < 500 ? '' : transfer ? (v > 0 ? 'enviaste' : 'recebeste') : v > 0 ? `adiantaste ${eur(v)} €` : `${p} adiantou ${eur(-v)} €`);
  const shown = list.slice(0, n);
  const months = sort !== 'big';
  return (
    <section className="stack pairlog" aria-label="Movimentos a dois">
      <div className="wbar"><span className="s">Movimentos a dois</span><span className="s">{list.length === all.length ? `${all.length}` : `${list.length} de ${all.length}`}</span></div>
      <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Procurar: jantar, ${p}, 46,80…`} aria-label="Procurar nos movimentos" />
      <div className="chips" role="group" aria-label="Quem">
        {([['all', 'Tudo'], ['me', 'Pagaste tu'], ['other', `Pagou ${p}`], ['transfers', 'Transferências']] as [PairWho, string][]).map(([k, l]) => <button key={k} className="press" aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}
      </div>
      <div className="chips" role="group" aria-label="Período e ordem">
        {([['all', 'Sempre'], ['month', 'Este mês'], ['12m', '12 meses'], ['year', 'Este ano']] as [PairPeriod, string][]).map(([k, l]) => <button key={k} className="press" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        <span className="chips-sep" aria-hidden="true" />
        {([['new', 'Recentes'], ['old', 'Antigos'], ['big', 'Maior valor']] as [PairSort, string][]).map(([k, l]) => <button key={k} className="press" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
      </div>
      {!shown.length
        ? <p className="s">{all.length ? 'Nada com estes filtros.' : 'Ainda não há despesas partilhadas nem transferências.'}</p>
        : <div className="tile card rows">{shown.map((e, j) => {
          const head = months && (j === 0 || monthKey(shown[j - 1].date) !== monthKey(e.date));
          const fx = effect(e.effect, e.kind === 'transfer');
          return (
            <Fragment key={e.id}>
              {head && <div className="mhead"><span className="s">{monthName(monthKey(e.date))} {e.date.slice(0, 4)}</span></div>}
              <div className={`mv${e.kind !== 'transfer' && e.payer === me!.id ? ' paid-me' : ''}`}>
                <span className="mv-t"><span>{e.title}</span><span className="s">{e.kind === 'transfer' ? (e.payer === me!.id ? `Tu → ${p}` : `${p} → tu`) : e.payer === me!.id ? 'Pagaste tu' : `Pagou ${p}`} · {dayLabel(e.date)}{e.category && e.title !== e.category ? ` · ${e.category}` : ''}</span></span>
                <span className="mv-v"><span>{eur(e.amount)} €</span>{fx && <span className={`s${e.effect > 0 ? ' up' : ''}`}>{fx}</span>}</span>
              </div>
            </Fragment>
          );
        })}</div>}
      {list.length > n && <button className="btn quiet wide press" onClick={() => setN(n + PAGE)}>Mostrar mais ({list.length - n}) <Icon n="arrow" s={20} /></button>}
    </section>
  );
}

/** O valor define-se; à partida és tu que transferes; um toque inverte. Sugere o valor que equilibra. */
export function TransferSheet() {
  const { me, partner, house } = useSession();
  const { close, toast } = useOverlays();
  const L = useLedger()!;
  const need = L.even ? null : L.v > 0 ? 'them' : 'me'; // quem deve transferir para equilibrar
  const [from, setFrom] = useState<'me' | 'them'>('me');
  const [amt, setAmt] = useState(need === 'me' ? eur(Math.abs(L.v)).replace(/\s/g, '') : '');
  const [err, setErr] = useState('');
  function flip(f: 'me' | 'them') { setFrom(f); setAmt(need === f ? eur(Math.abs(L.v)).replace(/\s/g, '') : ''); }
  async function save(e: FormEvent) {
    e.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('Escreve o valor.');
    const f = from === 'me' ? me! : partner!, t = from === 'me' ? partner! : me!;
    const { error } = await supabase.from('transfers').insert({ household_id: house!.id, from_id: f.id, to_id: t.id, amount: v, created_by: me!.id });
    if (error) return setErr(error.message);
    close(); toast(`Transferência registada: ${f.id === me!.id ? 'tu' : f.name} → ${t.id === me!.id ? 'tu' : t.name}, ${eur(toU(v))} €.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Registar transferência</p>
      <div className="seg" role="group" aria-label="Quem transfere">
        <button type="button" className="press" aria-pressed={from === 'me'} onClick={() => flip('me')}>Eu → {partner!.name}</button>
        <button type="button" className="press" aria-pressed={from === 'them'} onClick={() => flip('them')}>{partner!.name} → eu</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || (need ? `Para ficarem em equilíbrio, ${need === 'me' ? 'transferes' : partner!.name + ' transfere'} ${eur(Math.abs(L.v))} €.` : 'Estão em equilíbrio: uma transferência agora muda isso.')}</span></p>
      <button className="btn wide press">Registar <Icon n="check" s={20} /></button>
    </form>
  );
}
