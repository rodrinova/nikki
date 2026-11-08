import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type CarRow, type ExpenseRow, type IncomeEntryRow } from '@/data/house';
import { attachReceipt, readReceipt } from '@/data/receipts';
import { parseAtQr } from '@/lib/atqr';
import { readQr } from '@/lib/qrread';
import { KINDS, type Occasion, type OccasionKind } from '@/lib/occasions';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Whiskers } from '@/ui/Whiskers';
import { GIFTS, abates, partOf, abatingKind, eur, monthCurve, monthSpend, monthlySeries, normalMonth, openingOf, pace, pairBalance, parseAmount, toU, type EntryKind, type Split, whiskerLean } from '@/lib/money';
import { addDays, dayLabel, monthKey, monthName, nextMonth, prevMonth, todayStr } from '@/lib/dates';
import { store } from '@/lib/store';
import { useZoom } from '@/ui/zoom';
import { ZoomHint } from '@/ui/ZoomHint';
import { KIND_ASK, carKindOf, guess, parseQuick, splitOf, type Past } from '@/lib/quick';
import { pairEntries, pairFilter, type PairPeriod, type PairSort, type PairWho } from '@/lib/pairlog';
import { Hint, Top, heat, useSeen } from './Home';
import { CountUp } from '@/ui/CountUp';
import { Arc } from '@/ui/Arc';
import { BillFields, billEntry, useBillChoice, useSaveBill, type BillEntry } from './Casa';
import { CarEntryFields, carEntry, checkEntry, entryWhy, lastOdometer, useLearnFromPayment, useSaveCarLog, type CarEntry } from './Garage';

export const CATEGORIES = ['Supermercado', 'Restaurantes', 'Casa', 'Contas', 'Carros', 'Lazer', 'Saúde', 'Roupa', 'Viagens', GIFTS, 'Future Me'];
export const INVEST = 'Future Me'; // investir não é gasto
/** O nome que se mostra: «Future Me» (como fica guardado) aparece como «Investir». */
export const catLabel = (c: string) => (c === INVEST ? 'Investir' : c);

/** "Do Rodrigo", "Da Inês"… sem saber o género, "De Marta". */
export const ofName = (n: string) => `De ${n}`;

/** Resumo de um mês da pessoa (por omissão, o corrente): parte dela, normal, ritmo. */
export function useMonth(at?: string) {
  const { me } = useSession();
  const { spendRows } = useHouse();
  return useMemo(() => {
    const today = todayStr(), key = at ?? monthKey(today);
    const spend = spendRows.filter((e) => e.category !== INVEST);
    const m = monthSpend(spend, me?.id ?? '', key);
    // Os eventos (casamento, batizado…) contam no total do mês, mas à parte: o ritmo, o normal e as comparações
    // são só com o dia a dia (senão um casamento faria qualquer mês parecer fora do normal).
    const daily = spend.filter((e) => !e.occasion_id);
    const dm = monthSpend(daily, me?.id ?? '', key);
    const everyday = dm.total;
    const normal = normalMonth(daily, me?.id ?? '', today);
    return { key, today, current: key === monthKey(today), ...m, everyday, dailyByCat: dm.byCat, events: m.total - everyday, normal, pace: pace(everyday, normal, today, monthCurve(daily, me?.id ?? '', today)) };
  }, [spendRows, me?.id, at]);
}

export function useLedger() {
  const { me, partner } = useSession();
  const { pairRows, transfers, openings } = useHouse();
  return useMemo(() => {
    if (!me || !partner) return null;
    const v = pairBalance(pairRows, transfers.rows, me.id, partner.id, openingOf(openings.rows, me.id, partner.id));
    const even = Math.abs(v) < 500; // menos de meio cêntimo
    const who = v > 0 ? me : partner;
    const lead = even ? 'Em equilíbrio' : v > 0 ? 'Adiantaste mais' : `${partner.name} adiantou mais`;
    return { v, even, who, lead, lean: whiskerLean(v) };
  }, [pairRows, transfers.rows, openings.rows, me, partner]);
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
  const { spendRows: expRows } = useHouse();
  const [key, setKey] = useMonthParam();
  const m = useMonth(key);
  const p = m.pace;
  const spendRows = useMemo(() => expRows.filter((e) => e.category !== INVEST && !e.occasion_id), [expRows]);
  // Para o gráfico: desde o primeiro registo (até 10 anos), com pelo menos 12 meses.
  const hist = useMemo(() => {
    const s = monthlySeries(spendRows, me?.id ?? '', todayStr(), 120);
    const i = s.first ? s.months.findIndex((m) => m.key >= s.first!) : s.months.length;
    // O que foi de eventos, mês a mês, por cima de cada barra (contam no mês, mas à parte).
    const ev = monthlySeries(expRows.filter((e) => e.category !== INVEST && !!e.occasion_id), me?.id ?? '', todayStr(), 120);
    const evBy = new Map(ev.months.map((x) => [x.key, x.total]));
    return { months: s.months.slice(Math.min(i, s.months.length - 12)).map((x) => ({ ...x, events: evBy.get(x.key) ?? 0 })) };
  }, [spendRows, expRows, me?.id]);
  const vsAvg = !m.current && m.normal && m.everyday > 0 ? Math.round((m.everyday / m.normal - 1) * 100) : null;
  // Score do mês face ao teu normal: 100 no normal ou abaixo, menos um ponto por cada 1% acima. No mês a decorrer, pelo
  // ritmo (o mês projetado); nos fechados, pelo que se gastou no dia a dia.
  // O ritmo já segue a curva normal de um mês (a renda do dia 1 conta como no início de qualquer mês): o score e o
  // ritmo dizem sempre o mesmo.
  const ratio = !m.normal ? null : m.current ? (p.fresh ? null : 1 + p.pct / 100) : m.everyday / m.normal;
  const score = ratio === null ? null : Math.max(0, Math.min(100, Math.round(100 - Math.max(0, ratio - 1) * 100)));
  const catN = useMemo(() => catNormals(spendRows, me?.id ?? '', todayStr()), [spendRows, me?.id]);
  return (
    <>
      <div className="mnav">
        <button type="button" className="tb press" aria-label="Mês anterior" onClick={() => setKey(prevMonth(key))}><Icon n="arrow" s={16} /></button>
        <span className="mnav-t">{monthTitle(key)}{!m.current && <button type="button" className="mnav-now press" onClick={() => setKey(monthKey(todayStr()))}>Este mês</button>}</span>
        <button type="button" className="tb press" aria-label="Mês seguinte" disabled={m.current} onClick={() => setKey(nextMonth(key))}><Icon n="arrow" s={16} /></button>
      </div>
      <div className="money-hero">
        <div className="swap" key={key} style={{ ['--heat' as any]: m.current ? heat(p) : 0.5 }}><p className="xl vt-total"><CountUp to={m.total} fmt={(v) => eur(v, 0)} /><small>€</small></p><div className="with-hint" style={{ marginTop: 8 }}><p className="s">{partner ? `A tua parte em ${monthName(m.key)}` : monthTitle(m.key)}{vsAvg !== null ? ` · ${vsAvg === 0 ? 'no teu normal' : `${Math.abs(vsAvg)}% ${vsAvg > 0 ? 'acima' : 'abaixo'}`}` : ''}</p>
          <Hint>{partner ? 'A tua parte: o que é só teu mais a tua fatia das partilhadas, pague quem pagar. ' : ''}Eventos e compras extraordinárias contam no mês, mas à parte: ficam fora do ritmo e do teu normal. O score do mês: 100 no teu normal ou abaixo; desce um ponto por cada 1% acima.</Hint></div></div>
        {score !== null && <div className="month-score"><Arc value={score} label={`Score do mês: ${score} de 100`} unit="" /><span className="s">score do mês</span></div>}
      </div>
      <CatRank byCat={m.byCat} normal={catN} monthKey={key} current={m.current} />
      {m.current && (p.fresh
        ? <p className="s why"><span className="dot" aria-hidden="true" /><span>O ritmo aparece ao fim do primeiro mês completo.</span></p>
        : <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="bar31" style={{ gridTemplateColumns: `repeat(${p.days},minmax(0,1fr))` }} role="img" aria-label={`Ritmo ${p.pct}%`}>
              {Array.from({ length: p.days }, (_, j) => <i key={j} className={`${j < p.blocks ? (j < p.day ? 'f' : 'a') : ''}${j === p.day - 1 ? ' today' : ''}`} />)}
            </div>
            <div className="with-hint"><span className="s">Ritmo · {p.pct === 0 ? 'no ritmo habitual' : `${Math.abs(p.pct)}% ${p.pct > 0 ? 'acima' : 'abaixo'} do ritmo habitual`}</span>
              <Hint>Cada traço é um dia de um mês normal. Os brancos já foram. Os laranja são dias que ainda não chegaram, mas já foram gastos.</Hint></div>
          </div>
        </>)}
      <YearBars months={hist.months} normal={m.normal} sel={key} onPick={setKey} />
      <Purchases />
      <Movements monthKey={key} />
      <div className="tile card rows"><ExpenseButton /></div>
    </>
  );
}

/** O normal de cada categoria: a média dos últimos meses completos (até 12, desde o primeiro registo). */
export function catNormals(rows: ExpenseRow[], who: string, today: string): Record<string, number> {
  const mine = rows.filter((e) => partOf(e, who) !== 0);
  if (!mine.length) return {};
  const first = monthKey(mine.reduce((a, e) => (e.spent_on < a ? e.spent_on : a), mine[0].spent_on));
  const ks: string[] = [];
  for (let k = prevMonth(monthKey(today)); k >= first && ks.length < 12; k = prevMonth(k)) ks.push(k);
  if (!ks.length) return {};
  const sum: Record<string, number> = {};
  for (const e of mine) if (ks.includes(monthKey(e.spent_on))) sum[e.category] = (sum[e.category] ?? 0) + partOf(e, who);
  return Object.fromEntries(Object.entries(sum).map(([c, v]) => [c, Math.round(v / ks.length)]));
}

/** Onde se gasta mais: as categorias do mês da maior para a menor, com a diferença face ao normal de cada uma. */
function CatRank({ byCat, normal, monthKey: key, current }: { byCat: [string, number][]; normal: Record<string, number>; monthKey: string; current: boolean }) {
  const list = byCat.filter(([, v]) => v > 0);
  if (!list.length) return null;
  const top = list.slice(0, 5), mx = top[0][1];
  return (
    <section className="cat-rank" aria-label="Onde gastas mais">
      <div className="wbar"><span className="s">Onde gastas mais</span>{list.length > 5 && <Link className="s press" to={current ? '/dinheiro/categorias' : `/dinheiro/categorias?mes=${key}`}>Todas ({list.length})</Link>}</div>
      {top.map(([c, v]) => {
        const n = normal[c] ?? 0, d = n > 0 ? Math.round((v / n - 1) * 100) : null;
        return (
          <div key={c} className="cr-row">
            <span className="cr-top"><span>{catLabel(c)}</span><span className="cr-v">{eur(v, 0)} €{d !== null && !current && Math.abs(d) >= 5 && <span className={`s cr-d${d > 0 ? ' up' : ''}`}>{d > 0 ? '+' : '−'}{Math.abs(d)}%</span>}</span></span>
            <span className="cr-bar"><i style={{ width: `${((v / mx) * 100).toFixed(1)}%` }} />{n > 0 && <b style={{ left: `${Math.min(100, (n / mx) * 100).toFixed(1)}%` }} title="o teu normal" />}</span>
          </div>
        );
      })}
    </section>
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
        <defs>
          <pattern id="yb-stripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" className="yb-ev-bg" /><rect width="2.2" height="5" className="yb-ev-st" />
          </pattern>
        </defs>
        {vis.map((m) => {
          const x = (m.i - a) * unit + gap / 2, h = Math.max(m.total > 0 ? 2 : 0, H - B - y(m.total)), he = m.events > 0 ? Math.max(2, H - B - y(m.events)) : 0;
          return (
            <g key={m.key} className={`yb${m.key === sel ? ' on' : ''}${m.current ? ' cur' : ''}`} role="button" tabIndex={0} aria-label={`${monthTitle(m.key)}: ${eur(m.total, 0)} € do dia a dia${m.events > 0 ? ` e ${eur(m.events, 0)} € de eventos` : ''}${m.current ? ' (em curso)' : ''}`} aria-pressed={m.key === sel}
              onClick={() => onPick(m.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(m.key); } }}>
              <rect x={x - gap / 2} y={0} width={unit} height={H} className="yb-hit" />
              <rect x={x} y={H - B - h} width={bw} height={h} rx={Math.min(3, bw / 3)} className="yb-bar" />
              {he > 0 && <rect x={x} y={H - B - h - he} width={bw} height={he} rx={Math.min(3, bw / 3)} className="yb-ev" fill="url(#yb-stripes)" />}
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="gc-ax">{lab(m)}</text>
            </g>
          );
        })}
        {normal !== null && <line x1={0} x2={W} y1={y(normal)} y2={y(normal)} className="ybars-avg" />}
      </svg>
      {(() => {
        const s = months.find((m) => m.key === sel);
        return s ? <p className="s ybars-cap">{monthTitle(s.key)}: {eur(s.total, 0)} € do dia a dia{s.events > 0 ? <> + <b>{eur(s.events, 0)} € à parte</b> = {eur(s.total + s.events, 0)} €</> : ''}</p> : null;
      })()}
      {anyEv && <p className="s ybars-key"><span><i className="k-day" aria-hidden="true" />dia a dia</span><span><i className="k-ev" aria-hidden="true" />eventos e compras (por cima; fora do normal)</span></p>}
      {n > 3 && <ZoomHint z={z} />}
    </figure>
  );
}

function ExpenseButton() {
  const { open } = useOverlays();
  return <button className="press" onClick={() => open(<ExpenseSheet />)}><span className="k">Registar despesa ou entrada</span><span className="v"><Icon n="plus" s={18} /></span></button>;
}

const MOVES = 40;
type MoveWho = 'me' | 'all';

/**
 * As despesas do mês. Por omissão, as que pagaste tu (as tuas e as partilhadas que adiantaste): quem junta talões e
 * os regista de uma vez vê logo até onde já registou. «Tudo» junta as que a outra pessoa pagou e te dizem respeito.
 */
function Movements({ monthKey: key }: { monthKey: string }) {
  const { me, members, partner } = useSession();
  const { expenses, incomeEntries } = useHouse();
  const { open } = useOverlays();
  const [who, setWhoS] = useState<MoveWho>(() => (store.get('nikki_moves_who') === 'all' ? 'all' : 'me'));
  const setWho = (w: MoveWho) => { setWhoS(w); store.set('nikki_moves_who', w); };
  const [n, setN] = useState(MOVES);
  useEffect(() => setN(MOVES), [key, who]);
  const month = expenses.rows.filter((e) => monthKey(e.spent_on) === key);
  const list = (who === 'me' && partner ? month.filter((e) => e.paid_by === me?.id) : month)
    .sort((a, b) => (a.spent_on !== b.spent_on ? (a.spent_on < b.spent_on ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';
  const lbl = (e: ExpenseRow) => e.split === 'mine' ? (e.paid_by === me?.id ? 'Minha' : name(e.paid_by)) : e.split === 'shared' ? `Partilhada · pagou ${e.paid_by === me?.id ? 'tu' : name(e.paid_by)}` : e.other_id === me?.id ? `Tua · pagou ${name(e.paid_by)}` : ofName(name(e.other_id));
  const paidMe = month.filter((e) => e.paid_by === me?.id).length;
  // As entradas do mês que te dizem respeito (recebidas por ti, ou partilhadas contigo).
  const ins = incomeEntries.rows.filter((x) => monthKey(x.received_on) === key && (x.received_by === me?.id || x.other_id === me?.id))
    .sort((a, b) => (a.received_on < b.received_on ? 1 : -1));
  return (
    <section className="stack" aria-label="Despesas do mês">
      <div className="wbar"><span className="s">Despesas de {monthName(key)}</span><span className="s">{list.length}</span></div>
      {partner && <div className="chips" role="group" aria-label="Quem pagou">
        <button className="press" aria-pressed={who === 'me'} onClick={() => setWho('me')}>Pagaste tu ({paidMe})</button>
        <button className="press" aria-pressed={who === 'all'} onClick={() => setWho('all')}>Tudo ({month.length})</button>
      </div>}
      {!list.length
        ? <p className="s">{who === 'me' && month.length ? `Em ${monthName(key)} não pagaste nada. Alguém pagou por ti.` : `Nada em ${monthName(key)}. Ou foi um mês muito zen.`}</p>
        : <div className="tile card rows">{list.slice(0, n).map((e) => (
          <button key={e.id} className={`press${partner && e.paid_by === me?.id ? ' paid-me' : ''}`} onClick={() => open(<ExpenseDetail e={e} label={lbl(e)} />)}>
            <span className="k" style={{ color: 'var(--ink)' }}>{e.note || catLabel(e.category)}<span className="s" style={{ display: 'block' }}>{dayLabel(e.spent_on)} · {lbl(e)}</span></span>
            <span className="v">{eur(toU(e.amount))} €</span>
          </button>
        ))}</div>}
      {list.length > n && <button className="btn quiet wide press" onClick={() => setN(n + MOVES)}>Mostrar mais ({list.length - n}) <Icon n="arrow" s={20} /></button>}
      {ins.length > 0 && <>
        <div className="wbar"><span className="s">Entradas de {monthName(key)}</span><span className="s">{ins.length}</span></div>
        <div className="tile card rows">{ins.map((x) => {
          const k = ENTRY_KINDS.find((y) => y.k === x.kind)?.name ?? 'Entrada';
          const whoL = x.split === 'mine' ? (x.received_by === me?.id ? 'Minha' : name(x.received_by)) : x.split === 'shared' ? `Partilhada · recebeu ${x.received_by === me?.id ? 'tu' : name(x.received_by)}` : x.other_id === me?.id ? `Tua · recebeu ${name(x.received_by)}` : ofName(name(x.other_id));
          return (
            <button key={x.id} className="press" onClick={() => open(<EntryDetail x={x} label={whoL} />)}>
              <span className="k" style={{ color: 'var(--ink)' }}>{x.note || k}<span className="s" style={{ display: 'block' }}>{dayLabel(x.received_on)} · {k}{x.category ? ` · ${catLabel(x.category)}` : ''} · {whoL}</span></span>
              <span className="v">+{eur(toU(x.amount))} €</span>
            </button>
          );
        })}</div>
      </>}
    </section>
  );
}

function EntryDetail({ x, label }: { x: IncomeEntryRow; label: string }) {
  const { me } = useSession();
  const { incomeEntries, occasions } = useHouse();
  const { close, toast } = useOverlays();
  const mine = x.created_by === me?.id || x.received_by === me?.id;
  async function del() {
    const { error } = await supabase.from('income_entries').delete().eq('id', x.id);
    if (error) toast(error.message); else { incomeEntries.reload(); close(); toast('Entrada apagada.'); }
  }
  const occ = x.occasion_id ? occasions.rows.find((o) => o.id === x.occasion_id)?.name : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="xl">+{eur(toU(x.amount))}<small>€</small></p>
      <div className="tile card rows" style={{ background: 'var(--tile-2)' }}>
        <div><span className="k">Tipo</span><span className="v">{ENTRY_KINDS.find((y) => y.k === x.kind)?.name ?? 'Entrada'}</span></div>
        {x.category && <div><span className="k">Categoria</span><span className="v">{catLabel(x.category)}</span></div>}
        {occ && <div><span className="k">Evento</span><span className="v">{occ}</span></div>}
        <div><span className="k">Dia</span><span className="v">{dayLabel(x.received_on)}</span></div>
        <div><span className="k">De quem é</span><span className="v">{label}</span></div>
        {x.note && <div><span className="k">Nota</span><span className="v">{x.note}</span></div>}
      </div>
      <p className="s">{abates(x.kind, x.category) ? 'Abate nos gastos da categoria e do evento, no mês em que entrou.' : 'Conta como dinheiro que entra (no Património, nos rendimentos).'}</p>
      {mine && <button className="btn quiet wide press" onClick={del}>Apagar <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

function ExpenseDetail({ e, label }: { e: ExpenseRow; label: string }) {
  const { me, house } = useSession();
  const { close, toast } = useOverlays();
  const { expenses, receiptItems } = useHouse();
  const [busyR, setBusyR] = useState(false);
  const items = receiptItems.rows.filter((r) => r.expense_id === e.id);
  async function attach(f: File | null) {
    if (!f || !house) return;
    setBusyR(true);
    const r = await attachReceipt(house.id, e, f);
    setBusyR(false);
    if (r.error) return toast(r.error);
    expenses.reload(); toast('Fatura junta.', { ok: true });
    if (r.reading) r.reading.then((why) => { toast(why ?? 'Fatura lida.', why ? undefined : { ok: true }); receiptItems.reload(); });
  }
  async function see() {
    if (!e.receipt_path) return;
    const { data } = await supabase.storage.from('receipts').createSignedUrl(e.receipt_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function reread() {
    setBusyR(true); const why = await readReceipt(e.id); setBusyR(false);
    toast(why ?? 'Fatura lida.', why ? undefined : { ok: true }); receiptItems.reload();
  }
  const { open } = useOverlays();
  const mine = e.created_by === me?.id || e.paid_by === me?.id || e.other_id === me?.id;
  async function del() {
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    if (error) toast(error.message); else { close(); toast('Despesa apagada. Como se nunca tivesse existido.'); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="xl">{eur(toU(e.amount))}<small>€</small></p>
      <div className="tile card rows" style={{ background: 'var(--tile-2)' }}>
        <div><span className="k">Categoria</span><span className="v">{catLabel(e.category)}</span></div>
        <div><span className="k">Dia</span><span className="v">{dayLabel(e.spent_on)}</span></div>
        <div><span className="k">De quem é</span><span className="v">{label}</span></div>
        {e.note && <div><span className="k">Nota</span><span className="v">{e.note}</span></div>}
        {e.receipt_path && <button type="button" className="press" onClick={see}><span className="k">Fatura</span><span className="v">Ver <Icon n="chev" s={16} /></span></button>}
        {items.length > 0 && <div><span className="k">Produtos lidos</span><span className="v">{items.length}</span></div>}
      </div>
      {items.length > 0 && <p className="s">{items.slice(0, 8).map((r) => r.product).join(', ')}{items.length > 8 ? '…' : ''}</p>}
      <label className="rcpt-pick press" aria-busy={busyR}>
        <input type="file" accept="image/*,application/pdf" hidden onChange={(ev) => { attach(ev.target.files?.[0] ?? null); ev.target.value = ''; }} />
        <Icon n="cam" s={18} /><span>{busyR ? 'A tratar…' : e.receipt_path ? 'Trocar a fatura' : 'Juntar a fatura'}</span>
      </label>
      {e.receipt_path && e.category === 'Supermercado' && <button className="btn quiet wide press" disabled={busyR} onClick={reread}>{e.receipt_read_at ? 'Ler outra vez' : 'Ler os produtos'} <Icon n="arrow" s={20} /></button>}
      {mine && <button className="btn wide press" onClick={() => open(<ExpenseEdit e={e} />)}>Editar <Icon n="arrow" s={20} /></button>}
      {mine && <button className="btn quiet wide press" onClick={del}>Apagar <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

/** Editar uma despesa já registada: tudo (valor, nota, categoria, de quem é, quem pagou, a parte, o dia, o evento). */
function ExpenseEdit({ e }: { e: ExpenseRow }) {
  const { me, partner, myShare } = useSession();
  const { expenses, occasions, on } = useHouse();
  const { close, toast } = useOverlays();
  const allOccs = occasions.rows.filter((o) => o.purchase || on('eventos'));
  // Do lado de quem edita: quem pagou e de quem é (na base, a divisão é do lado de quem pagou).
  const iPaid = e.paid_by === me?.id;
  const split0: Split = iPaid ? e.split : e.split === 'shared' ? 'shared' : e.split === 'mine' ? 'other' : 'mine';
  const payer0 = e.payer_share === null || e.payer_share === undefined ? null : Number(e.payer_share);
  const mine0 = payer0 === null ? myShare : iPaid ? payer0 : 1 - payer0;
  const [amt, setAmt] = useState(String(e.amount).replace('.', ','));
  const [note, setNote] = useState(e.note ?? '');
  const [cat, setCat] = useState(e.category);
  const [split, setSplit] = useState<Split>(split0);
  const [paid, setPaid] = useState<'me' | 'partner'>(iPaid || !partner ? 'me' : 'partner');
  const [pct, setPct] = useState(String(Math.round(mine0 * 100)));
  const [day, setDay] = useState(e.spent_on);
  const [occ, setOcc] = useState<string | null>(e.occasion_id ?? null);
  const [nif, setNif] = useState<string | null>(e.merchant_nif ?? null);
  const [busyR, setBusyR] = useState(false);
  const [hasR, setHasR] = useState(!!e.receipt_path);
  const [err, setErr] = useState('');
  const { house } = useSession();
  // A fatura (foto ou PDF) junta-se já à despesa; se tiver o QR, acerta o valor, o dia e a loja.
  async function receipt(file: File | null) {
    if (!file || !house) return;
    setBusyR(true); setErr('');
    const raw = await readQr(file).catch(() => null);
    const inv = raw ? parseAtQr(raw) : null;
    const r = await attachReceipt(house.id, e, file);
    setBusyR(false);
    if (r.error) return setErr(r.error);
    setHasR(true); expenses.reload();
    if (r.reading) r.reading.then((why) => toast(why ?? 'Fatura lida: as Compras já sabem o que compraram.', why ? undefined : { ok: true }));
    if (inv) {
      setAmt(inv.total.replace('.', ',')); setDay(inv.date); setNif(inv.nif);
      toast(`Fatura junta e lida pelo QR: ${inv.total.replace('.', ',')} € a ${inv.date.split('-').reverse().join('/')}. Guarda para ficar.`, { ok: true });
    } else toast('Fatura junta.', { ok: true });
  }
  async function save(ev: FormEvent) {
    ev.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('O valor escreve-se assim: 12,35.');
    if (!me) return;
    const p = Math.min(100, Math.max(0, Number(pct) || 0)) / 100;
    const payerShare = paid === 'me' ? p : 1 - p;
    const who = paid === 'partner' && partner
      ? { paid_by: partner.id, split: split === 'shared' ? 'shared' : split === 'mine' ? 'other' : 'mine', other_id: split === 'other' ? null : me.id, payer_share: split === 'shared' ? payerShare : null }
      : { paid_by: me.id, split, other_id: split === 'mine' || !partner ? null : partner.id, payer_share: split === 'shared' ? payerShare : null };
    const { error } = await supabase.from('expenses').update({ amount: v, note: note.trim().slice(0, 120) || null, category: cat, spent_on: day, occasion_id: occ, merchant_nif: nif, ...who }).eq('id', e.id);
    if (error) return setErr(error.message);
    expenses.reload(); close(); close(); toast(`Despesa mudada: ${eur(toU(v))} €.`, { ok: true });
  }
  const chip = (sel: boolean, t: string, f: () => void) => <button type="button" className="press" aria-pressed={sel} onClick={f} key={t}>{t}</button>;
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Editar despesa</p>
      <label className="rcpt-pick press" aria-busy={busyR}>
        <input type="file" accept="image/*,application/pdf" hidden onChange={(x) => { receipt(x.target.files?.[0] ?? null); x.target.value = ''; }} />
        <Icon n="cam" s={18} /><span>{busyR ? 'A tratar…' : hasR ? 'Trocar a fatura (foto ou PDF)' : 'Juntar a fatura: foto ou PDF (com QR, acerta tudo)'}</span>{hasR && !busyR && <Icon n="check" s={16} />}
      </label>
      {nif && <p className="s" style={{ marginTop: -6 }}>NIF da loja {nif}</p>}
      <div className="form">
        <div className="two">
          <label>Valor (€)<input inputMode="decimal" value={amt} onChange={(x) => { setAmt(x.target.value); setErr(''); }} /></label>
          <label>Dia<input type="date" value={day} max={todayStr()} onChange={(x) => setDay(x.target.value || day)} /></label>
        </div>
        <label>Nota<input value={note} maxLength={120} onChange={(x) => setNote(x.target.value)} placeholder="ex.: Pingo Doce" /></label>
      </div>
      <div className="chips wrap" role="group" aria-label="Categoria">{CATEGORIES.map((c) => chip(cat === c, catLabel(c), () => setCat(c)))}</div>
      {partner && <div className="seg" role="group" aria-label="De quem é">{chip(split === 'mine', 'Minha', () => setSplit('mine'))}{chip(split === 'shared', 'Partilhada', () => setSplit('shared'))}{chip(split === 'other', ofName(partner.name), () => setSplit('other'))}</div>}
      {partner && split === 'shared' && <label className="s salv-date">A tua parte (%) <input className="field" inputMode="numeric" value={pct} onChange={(x) => setPct(x.target.value.replace(/[^0-9]/g, '').slice(0, 3))} /></label>}
      {partner && <div className="seg" role="group" aria-label="Quem pagou">{chip(paid === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paid === 'partner', `Pagou ${partner.name}`, () => setPaid('partner'))}</div>}
      {allOccs.length > 0 && <div className="chips wrap" role="group" aria-label="Evento">{chip(!occ, 'Sem evento', () => setOcc(null))}{allOccs.filter((o) => !o.archived || o.id === occ).map((o) => chip(occ === o.id, `${o.purchase ? '◆ ' : ''}${o.name}`, () => setOcc(o.id)))}</div>}
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}

/** Despesa: valor, categoria, Minha · Partilhada · Do outro, dia e nota. Quem paga é quem regista. */
/** Para abrir a folha já preenchida: de um QR de fatura ou de um pagamento com o Apple Pay (rascunho). */
export interface ExpenseInit { text?: string; day?: string; file?: File; nif?: string; draftId?: string }

export function ExpenseSheet({ init }: { init?: ExpenseInit } = {}) {
  const learn = useLearnFromPayment();
  const saveLog = useSaveCarLog();
  const { me, partner, house, myShare } = useSession();
  const { cars, carLogs, on, expenses, occasions } = useHouse();
  // Eventos a decorrer (casamento, batizado…): a despesa pode ficar ligada a um. Mantém-se em «Guardar e outra».
  // Os arquivados (um casamento que já foi) também recebem despesas: escrevendo o nome ou em «Outros eventos».
  // Eventos (com o módulo ligado) e compras extraordinárias (sempre): a despesa pode juntar-se a um deles.
  const allOccs = occasions.rows.filter((o) => o.purchase || on('eventos'));
  // Despesa ou entrada (salário, reembolso, acerto, presente…): escolhe-se em cima ou adivinha-se pelo texto.
  const [modeSet, setMode] = useState<'out' | 'in' | null>(null);
  const [kindSet, setKind] = useState<EntryKind | null>(null);
  const [inCatSet, setInCat] = useState<string | null | undefined>(undefined);
  const { incomes, receiptItems } = useHouse();
  const [occSet, setOcc] = useState<string | null | undefined>(undefined);
  const { close, toast } = useOverlays();
  // Num gesto: «45 pingo doce» dá o valor e a nota; pode escrever-se tudo («ontem», «dia 3», «partilhada», «minha»,
  // «para a Inês», «pagou a Inês», «60/40», «lazer», o carro, o evento). O que não se escreve adivinha-se pelo que
  // fizeste antes. O que se escreve manda; tudo se pode mudar em «Mudar».
  const garage = on('garagem') ? cars.rows.filter((c) => !c.archived) : [];
  const [text, setText] = useState(init?.text ?? '');
  const [nif, setNif] = useState<string | null>(init?.nif ?? null); // o NIF da loja (do QR da fatura)
  const [draftId] = useState(init?.draftId ?? null);
  const [qrBusy, setQrBusy] = useState(false);
  const q = parseQuick(text, todayStr(), { partner: partner?.name, cats: CATEGORIES, cars: garage, occasions: allOccs });
  const note = q.note;
  const incoming = (modeSet ?? (entryKindOf(text) ? 'in' : 'out')) === 'in';
  const kind: EntryKind = kindSet ?? entryKindOf(text) ?? 'outro';
  const g = useMemo(() => guess(note, expenses.rows as Past[], me?.id ?? '', !!partner, CATEGORIES), [note, expenses.rows, me?.id, partner]);
  const [catSet, setCat] = useState<string | null>(null);
  const cat = catSet ?? q.category ?? g.category;
  const occ = occSet === undefined ? q.occasion ?? null : occSet;
  const [paidSet, setPaid] = useState<'me' | 'partner' | null>(null);
  const paidBy = partner ? paidSet ?? q.paidBy ?? 'me' : 'me';
  const [splitSet, setSplit] = useState<Split | null>(null);
  const [daySet, setDay] = useState<'hoje' | 'ontem' | 'outro' | null>(init?.day && init.day !== todayStr() ? 'outro' : null);
  const day = daySet ?? (q.day && q.day !== todayStr() ? 'outro' : 'hoje');
  const [dateSet, setDate] = useState<string | null>(init?.day ?? null);
  const date = dateSet ?? q.day ?? todayStr();
  const [more, setMore] = useState(false);
  // Na dúvida, a NIKKI pergunta antes de gravar: «Abastecimento do Golf?», «Supermercado, partilhada?».
  const [ok, setOk] = useState(false);
  const [noKm, setNoKm] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rfile, setRfile] = useState<File | null>(init?.file ?? null); // a fatura (foto ou PDF), se houver
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
  // Numa compra extraordinária (a entrada do carro novo, uma prestação) não há abastecimento nem km: fica à parte.
  const buying = !!allOccs.find((o) => o.id === occ)?.purchase;
  const car = !incoming && !buying && cat === 'Carros' && (q.amount || (note && g.why !== 'default')) ? pick : undefined;
  // A despesa de um carro fica, por defeito, de quem é o carro (como na Garagem); pode mudar-se a seguir.
  const splitFor = (c: CarRow): Split => (!partner || c.owner_id === me?.id ? 'mine' : c.owner_id === null ? 'shared' : 'other');
  // Numa entrada, por omissão é de quem recebe (só partilhada se escrito ou escolhido).
  const split: Split = splitSet ?? q.split ?? (incoming ? 'mine' : cat === 'Carros' && pick && !buying ? splitFor(pick) : cat !== g.category ? splitOf(cat, expenses.rows as Past[], me?.id ?? '', !!partner) : g.split);
  // A parte de quem paga numa partilhada: a escrita («60/40») ou a combinada (de quem pagou).
  const payerShare = q.share ?? (paidBy === 'me' ? myShare : 1 - myShare);
  const partnerPaid = !!partner && paidBy === 'partner';
  const splitWord = partner ? (split === 'shared' ? 'partilhada' : split === 'mine' ? 'só tua' : `de ${partner.name}`) : '';
  const [entry, setEntry] = useState<{ car: string; f: CarEntry } | null>(null);
  const f = car ? (entry && entry.car === car.id ? entry.f : carEntry(car, carKindOf(note, car.energy === 'eletrico'))) : null;
  const setF = (x: CarEntry) => car && setEntry({ car: car.id, f: x });
  const last = car ? lastOdometer(carLogs.rows, car) : null;
  const v = q.amount ? parseAmount(q.amount) : null;
  const sv = v ? toU(v) : 0;
  // A categoria de uma entrada: num reembolso ou acerto, a do gasto que abate (adivinhada); nas outras, só se escrita.
  const inCat = inCatSet !== undefined ? inCatSet : kind === 'presente' ? GIFTS : abatingKind(kind) ? cat : q.category ?? null;
  const sign = incoming ? '+' : '';
  const spentOn = day === 'hoje' ? todayStr() : day === 'ontem' ? addDays(todayStr(), -1) : date;
  // Em Contas ou Casa, com a Casa ligada: de que conta fixa é (reconhecida pela nota e pelo valor, ou escolhida).
  const [bf, setBf] = useState<BillEntry>(billEntry);
  const bc = useBillChoice(cat, note, v ? toU(v) : 0, spentOn, bf);
  // Tem a certeza quando foi a pessoa a escolher ou quando repete o que fez antes no mesmo sítio (num carro, pergunta sempre).
  const sure = incoming || ok || catSet !== null || carSet !== null || !!q.category || (g.why === 'history' && cat !== 'Carros');
  const occName = occ ? allOccs.find((o) => o.id === occ)?.name : undefined;
  const ask = (cat === 'Carros' && car && f ? `${KIND_ASK[f.kind]} do ${car.name}${partner ? `, ${splitWord}` : ''}` : `${bc.bill ? bc.bill.name : catLabel(cat)}${partner ? `, ${splitWord}` : ''}`) + (occName ? `, ${occName}` : '') + '?';
  const saveBill = useSaveBill();
  const pct = Math.round(myShare * 100);
  const mineShare = paidBy === 'me' ? payerShare : 1 - payerShare;
  const mp = Math.round(mineShare * 100);
  const hint = !v ? '' : !partner ? 'Em teu nome.' : split === 'shared'
    ? `Partilhada ${mp}/${100 - mp}${q.share === undefined ? '' : ' (escrito)'}: ${eur(sv * mineShare)} € na tua parte, ${eur(sv * (1 - mineShare))} € na parte de ${partner.name}.${partnerPaid ? ` Pagou ${partner.name}.` : ''}${q.share === undefined && pct === mp ? ' A percentagem muda-se em Pessoas.' : ''}`
    : split === 'other' ? `Toda na parte de ${partner.name}. ${partnerPaid ? `Pagou ${partner.name}.` : 'Pagaste tu.'}` : partnerPaid ? `Só tua. Pagou ${partner.name}.` : 'Só tua.';

  // Ler o QR da fatura (fotografia): valor, dia e NIF; a loja e o resto vêm do que se fez antes com o mesmo NIF.
  async function fromQr(file: File | null) {
    if (!file) return;
    setQrBusy(true); setErr('');
    const raw = await readQr(file).catch(() => null);
    setQrBusy(false);
    const inv = raw ? parseAtQr(raw) : null;
    setRfile(file);
    if (!inv) return setErr(raw ? 'Este código não é de uma fatura. A foto fica junta; escreve o valor.' : 'Não encontrei o código QR. A foto fica junta; escreve o valor.');
    const prev = expenses.rows.filter((x) => x.merchant_nif === inv.nif && x.note).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    // A loja: a que se usou da última vez com este NIF; senão, o que já estava escrito.
    const shop = (prev?.note ?? '').split(' · ')[0] || text.replace(/^[\d.,\s€]+/, '').trim();
    setNif(inv.nif);
    setText(`${inv.total.replace('.', ',')}${shop ? ` ${shop}` : ''}`);
    if (inv.date !== todayStr()) { setDay(inv.date === addDays(todayStr(), -1) ? 'ontem' : 'outro'); setDate(inv.date); } else { setDay('hoje'); setDate(null); }
    if (inv.credit) { setMode('in'); setKind('reembolso'); }
    if (!shop) { setErr('Fatura lida. Junta o nome da loja a seguir ao valor (a NIKKI fica a saber para a próxima).'); setTimeout(() => amtRef.current?.focus(), 30); }
  }
  async function discardDraft() {
    if (draftId) await supabase.from('expense_drafts').delete().eq('id', draftId);
    close();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const again = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.again === '1';
    if (!v) return setErr('Falta o valor. Por exemplo: «12,35 farmácia».');
    if (!me || !house) return;
    const spent_on = spentOn;
    if (incoming) return saveIn(again, spent_on);
    if (!sure) return setErr(`Confirma primeiro: ${ask}`);
    const n = car && f ? checkEntry(car, f, last) : null;
    if (typeof n === 'string') return setErr(n);
    if (car && f && (f.kind === 'fuel' || f.kind === 'charge') && !f.odo.trim() && !noKm) return setErr('E os km do conta-quilómetros? Sem eles, este depósito fica fora do consumo.');
    setBusy(true);
    const { data, error } = await supabase.from('expenses').insert({
      household_id: house.id, created_by: me.id, amount: v, category: cat, spent_on, car_id: car?.id ?? null, merchant_nif: nif, occasion_id: allOccs.some((o) => o.id === occ) ? occ : null,
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
    // A fatura vai depois da despesa (precisa do id); as de supermercado leem-se em segundo plano.
    if (rfile) {
      const r = await attachReceipt(house.id, { id: (data as { id: string }).id, category: cat }, rfile);
      if (r.error) toast(r.error);
      else if (r.reading) { toast('A ler a fatura…'); r.reading.then((why) => { toast(why ?? 'Fatura lida: as Compras já sabem o que compraram.', why ? undefined : { ok: true }); receiptItems.reload(); }); }
      setRfile(null);
    }
    // O pagamento do Apple Pay ficou registado: sai dos rascunhos.
    if (draftId) await supabase.from('expense_drafts').delete().eq('id', draftId);
    if (again) {
      setDone((d) => ({ n: (d?.n ?? 0) + 1, total: (d?.total ?? 0) + sv, last: `${eur(sv)} € · ${car ? car.name : note.trim() || cat}` }));
      setNif(null); setText(''); setCat(null); setSplit(null); setDay(null); setDate(null); setMore(false); setOk(false); setNoKm(false); setErr(''); setEntry(null); setBf(billEntry()); setPaid(null); setCarId(null); setKind(null); setInCat(undefined); // o evento escolhido mantém-se (várias despesas do mesmo casamento)
      setTimeout(() => amtRef.current?.focus(), 30);
    } else close();
    if (billErr) toast(`A despesa ficou guardada, mas não se ligou à conta: ${billErr}`);
    // Um pagamento em Carros com «IUC» ou o nome da seguradora na nota ensina a Garagem (mês, data e valor).
    const learned = cat === 'Carros' && note.trim() && (!f || f.kind === 'other' || f.kind === 'service') ? await learn({ car, note }, toU(v), spent_on) : null;
    if (!again || learned) toast(learned ?? `${eur(sv)} € · ${car ? car.name : cat}${n && n.litres !== null ? ` · ${String(n.litres).replace('.', ',')} L` : ''}${bc.bill && bf.pick !== 'none' ? ` · ${bc.bill.name}` : ''} · ${dayLabel(spent_on)}${partner ? ' · ' + (split === 'shared' ? 'partilhada' : split === 'mine' ? 'minha' : `de ${partner.name}`) + (partnerPaid ? ` · pagou ${partner.name}` : '') : ''}${occName ? ` · ${occName}` : ''}`, { ok: true });
  }

  /** Uma entrada: fica em income_entries (com a fonte de rendimento, se houver uma «pelos registos» do mesmo tipo). */
  async function saveIn(again: boolean, received_on: string) {
    if (!v || !me || !house) return;
    const who = partnerPaid ? partner!.id : me.id;
    const src = ['salario', 'alimentacao', 'complemento'].includes(kind) ? incomes.rows.find((r) => r.profile_id === who && r.kind === kind && r.mode === 'log') : undefined;
    setBusy(true);
    const { error } = await supabase.from('income_entries').insert({
      household_id: house.id, created_by: me.id, amount: v, received_on, kind, category: inCat, income_id: src?.id ?? null,
      occasion_id: allOccs.some((o) => o.id === occ) ? occ : null, note: note.trim().slice(0, 120) || null,
      ...(partnerPaid
        ? { received_by: partner!.id, split: split === 'shared' ? 'shared' : split === 'mine' ? 'other' : 'mine', other_id: split === 'other' ? null : me.id, payer_share: split === 'shared' ? payerShare : null }
        : { received_by: me.id, split, other_id: split === 'mine' || !partner ? null : partner.id, payer_share: split === 'shared' ? payerShare : null }),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    const label = `+${eur(sv)} € · ${ENTRY_KINDS.find((k) => k.k === kind)?.name ?? 'Entrada'}${inCat ? ` · ${catLabel(inCat)}` : ''}`;
    if (again) {
      setDone((d) => ({ n: (d?.n ?? 0) + 1, total: (d?.total ?? 0) + sv, last: label }));
      setText(''); setKind(null); setInCat(undefined); setSplit(null); setDay(null); setDate(null); setMore(false); setErr(''); setPaid(null);
      setTimeout(() => amtRef.current?.focus(), 30);
    } else close();
    if (!again) toast(`${label} · ${dayLabel(received_on)}${occName ? ` · ${occName}` : ''}`, { ok: true });
  }

  const chip = (on: boolean, txt: string, f: () => void) => <button type="button" className="press" aria-pressed={on} onClick={f} key={txt}>{txt}</button>;
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {done && <p className="s why"><span className="dot" aria-hidden="true" /><span>Guardada: {done.last}. {done.n > 1 ? `Já são ${done.n}, ${eur(done.total)} €. ` : ''}Mais uma:</span></p>}
      <div className="seg" role="group" aria-label="Despesa ou entrada">
        {chip(!incoming, 'Despesa', () => setMode('out'))}{chip(incoming, 'Entrada', () => setMode('in'))}
      </div>
      <label className="sr" htmlFor="amt">Valor e onde (ex.: 45 pingo doce)</label>
      <div className="amt-row">
        <input id="amt" ref={amtRef} className="field quick" placeholder={incoming ? '1500 salário' : '45 pingo doce ontem partilhada'} autoFocus={!init?.text} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} enterKeyHint="done" />
        {!incoming && <label className="qr-btn press" aria-label="Ler o QR da fatura" aria-busy={qrBusy}>
          <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { fromQr(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <Icon n="cam" s={20} />
        </label>}
      </div>
      {draftId && <p className="s why" style={{ marginTop: -8 }}><span className="dot" aria-hidden="true" /><span>Pago com o Apple Pay. Confirma (ou muda) e guarda.</span></p>}
      {nif && <p className="s" style={{ marginTop: -8 }}>Fatura lida pelo QR · NIF {nif}</p>}
      {v && !sure ? <div className="ask-card" role="group" aria-label="Confirmar">
        <span className="l">{sign}{eur(sv)} €</span>
        <p className="ask-q">{ask}</p>
        <div className="ask-btns">
          <button type="button" className="btn press" onClick={() => { setOk(true); setErr(''); }}>Sim</button>
          <button type="button" className="btn quiet press" onClick={() => { setOk(true); setMore(true); setErr(''); }}>Mudar</button>
        </div>
      </div> : v ? <div className="quick-sum">
        <span className="l">{sign}{eur(sv)} €</span>
        <button type="button" className="chip-sum press" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>{[incoming ? (ENTRY_KINDS.find((k) => k.k === kind)?.name ?? 'Entrada') : '', incoming ? (inCat ? catLabel(inCat) : '') : car ? car.name : catLabel(cat), partner ? (split === 'shared' ? `partilhada${q.share !== undefined ? ` ${mp}/${100 - mp}` : ''}` : split === 'mine' ? 'minha' : `de ${partner.name}`) : '', partnerPaid ? `pagou ${partner!.name}` : '', dayLabel(spentOn), occ ? allOccs.find((o) => o.id === occ)?.name ?? '' : ''].filter(Boolean).join(' · ')}</span>
          <span className="s">{more ? 'Fechar' : 'Mudar'}</span>
        </button>
      </div> : <QuickHint q={q} partner={partner?.name} err={err} cars={garage} occs={allOccs} />}
      {v && (err || (more && split === 'shared' && hint)) ? <p className="s" style={{ marginTop: -8 }}>{err || hint}</p> : null}
      {incoming && v && <div className="chips wrap" role="group" aria-label="Tipo de entrada">{ENTRY_KINDS.map((k) => chip(kind === k.k, k.name, () => setKind(k.k)))}</div>}
      {incoming && v && <p className="s why" style={{ marginTop: -8 }}><span className="dot" aria-hidden="true" /><span>{abates(kind, inCat) ? `Abate ${eur(sv)} € ${inCat ? `em ${catLabel(inCat)}` : 'nos gastos'}${occName ? ` do ${occName}` : ''} neste mês.` : `Conta como dinheiro que entra${occName ? `, ligado ao ${occName}` : ''}. Não mexe nos gastos${inCat === GIFTS ? ' (nas Prendas, as entradas nunca abatem)' : ''}.`}</span></p>}
      {more && !incoming && <div className="chips wrap" role="group" aria-label="Categoria">{CATEGORIES.map((c) => chip(cat === c, catLabel(c), () => setCat(c)))}</div>}
      {more && incoming && <div className="chips wrap" role="group" aria-label="Categoria">{chip(!inCat, 'Sem categoria', () => setInCat(null))}{CATEGORIES.filter((c) => c !== INVEST).map((c) => chip(inCat === c, catLabel(c), () => setInCat(c)))}</div>}
      {(sure || !v) && car && f && <div className="form">
        {garage.length > 1 && <div className="chips" role="group" aria-label="Carro">{garage.map((c) => chip(car.id === c.id, c.name, () => { setCarId(c.id); setSplit(splitFor(c)); }))}</div>}
        <CarEntryFields car={car} f={f} set={setF} last={last} pickKind onAmount={(a) => setText(`${a.toFixed(2).replace('.', ',')} ${note || 'Combustível'}`)} />
        <p className="s why"><span className="dot" aria-hidden="true" /><span>{entryWhy(f)}</span></p>
        {(f.kind === 'fuel' || f.kind === 'charge') && !f.odo.trim() && <label className="check s"><input type="checkbox" checked={noKm} onChange={(e) => setNoKm(e.target.checked)} /> Não sei os km agora</label>}
      </div>}
      {sure && !incoming && <BillFields c={bc} f={bf} set={setBf} amount={v ? toU(v) : 0} spent_on={spentOn} />}
      {v && (sure || more) && <OccPick occ={occ} setOcc={setOcc} occs={allOccs} day={spentOn} onCar={() => { if (catSet === null) setCat('Carros'); }} />}
      {more && partner && <div className="seg" role="group" aria-label="De quem é">
        {chip(split === 'mine', 'Minha', () => setSplit('mine'))}{chip(split === 'shared', 'Partilhada', () => setSplit('shared'))}{chip(split === 'other', ofName(partner.name), () => setSplit('other'))}
      </div>}
      {more && partner && <div className="seg" role="group" aria-label="Quem pagou">
        {incoming
          ? <>{chip(paidBy === 'me', 'Recebi eu', () => setPaid('me'))}{chip(paidBy === 'partner', `Recebeu ${partner.name}`, () => setPaid('partner'))}</>
          : <>{chip(paidBy === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paidBy === 'partner', `Pagou ${partner.name}`, () => setPaid('partner'))}</>}
      </div>}
      {more && <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}{chip(day === 'outro', 'Outro dia', () => setDay('outro'))}</div>}
      {more && day === 'outro' && <input className="field" type="date" aria-label="Dia da despesa" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />}
      {!incoming && <label className="rcpt-pick press" aria-busy={qrBusy}>
        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { fromQr(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <Icon n="cam" s={18} /><span>{qrBusy ? 'A ler…' : rfile ? 'Fatura junta · trocar' : cat === 'Supermercado' ? 'Juntar a fatura: foto ou PDF (lê os produtos)' : 'Juntar a fatura: foto ou PDF'}</span>{rfile && !qrBusy && <Icon n="check" s={16} />}
      </label>}
      <div className="save-two">
        <button className="btn quiet press" data-again="1" disabled={busy}>Guardar e outra</button>
        <button className="btn press" disabled={busy}>{done ? 'Guardar e fechar' : incoming ? 'Guardar entrada' : `Guardar · ${me?.name}`} <Icon n="arrow" s={20} /></button>
      </div>
      {done && <button type="button" className="back press" onClick={close}>Fechar ({done.n} {done.n === 1 ? 'guardada' : 'guardadas'})</button>}
      {draftId && !done && <button type="button" className="back press" onClick={discardDraft}>Não registar este pagamento</button>}
    </form>
  );
}

/** Os tipos de entrada, pela ordem dos botões. Reembolso e acerto abatem nos gastos; os outros são rendimento. */
export const ENTRY_KINDS: { k: EntryKind; name: string }[] = [
  { k: 'salario', name: 'Salário' }, { k: 'reembolso', name: 'Reembolso' }, { k: 'acerto', name: 'Acerto' },
  { k: 'presente', name: 'Presente' }, { k: 'alimentacao', name: 'Subsídio de alimentação' }, { k: 'complemento', name: 'Extra' }, { k: 'outro', name: 'Outro rendimento' },
];
/** O tipo de entrada pelo texto («1500 salário», «40 reembolso jantar»); null se não parece uma entrada. */
export function entryKindOf(t: string): EntryKind | null {
  const s = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(salario|ordenado|vencimento)\b/.test(s)) return 'salario';
  if (/\breembols/.test(s)) return 'reembolso';
  if (/\bacerto\b/.test(s)) return 'acerto';
  if (/\bsubsidio de alimentacao\b|\bcartao refeicao\b/.test(s)) return 'alimentacao';
  if (/\b(recebi|entrou|entrada)\b/.test(s)) return 'outro';
  return null;
}

/**
 * Evento ou compra extraordinária, discreto: «+ Evento» (ou o escolhido, com ✕). Ao tocar, escolhe-se um dos que
 * há, cria-se um evento novo (com o módulo Eventos) ou uma compra extraordinária.
 */
function OccPick({ occ, setOcc, occs, day, onCar }: { occ: string | null; setOcc: (id: string | null) => void; occs: Occasion[]; day: string; onCar: () => void }) {
  const { on } = useHouse();
  const [openP, setOpenP] = useState(false);
  const [old, setOld] = useState(false);
  const [make, setMake] = useState<'event' | 'buy' | null>(null);
  const cur = occs.find((o) => o.id === occ);
  const chip = (sel: boolean, txt: string, f: () => void) => <button type="button" className="press" aria-pressed={sel} onClick={f} key={txt}>{txt}</button>;
  const pick = (id: string | null) => { setOcc(id); setOpenP(false); setMake(null); setOld(false); };
  return (
    <>
      <div className="chips wrap" role="group" aria-label="Evento ou compra extraordinária">
        {cur
          ? <>{chip(true, `${cur.purchase ? '◆ ' : ''}${cur.name}`, () => setOpenP(!openP))}<button type="button" className="press" aria-label={`Tirar ${cur.name}`} onClick={() => pick(null)}>✕</button></>
          : chip(openP, '+ Evento', () => setOpenP(!openP))}
      </div>
      {openP && <div className="chips wrap" role="group" aria-label="Escolher evento">
        {occs.filter((o) => !o.archived || o.id === occ || old).map((o) => chip(occ === o.id, `${o.purchase ? '◆ ' : ''}${o.name}${o.archived ? ' (arquivado)' : ''}`, () => pick(o.id)))}
        {!old && occs.some((o) => o.archived && o.id !== occ) && chip(false, 'Outros…', () => setOld(true))}
        {on('eventos') && chip(make === 'event', '+ Novo evento', () => setMake(make === 'event' ? null : 'event'))}
        {chip(make === 'buy', '+ Compra extraordinária', () => setMake(make === 'buy' ? null : 'buy'))}
      </div>}
      {openP && make === 'event' && <NewOccasion onMade={pick} />}
      {openP && make === 'buy' && <NewPurchase on={day} onMade={(id, isCar) => { pick(id); if (isCar) onCar(); }} />}
    </>
  );
}

/** Um evento novo sem sair da despesa: o nome e o tipo (o resto completa-se depois, em Eventos). */
function NewOccasion({ onMade }: { onMade: (id: string) => void }) {
  const { me, house } = useSession();
  const { occasions } = useHouse();
  const { toast } = useOverlays();
  const [name, setName] = useState('');
  const guessKind = (n: string): OccasionKind => KINDS.find((k) => k.k !== 'outro' && n.toLowerCase().includes(k.name.toLowerCase()))?.k ?? 'festa';
  const [kindSet, setKind] = useState<OccasionKind | null>(null);
  const kind = kindSet ?? guessKind(name);
  const [busy, setBusy] = useState(false);
  async function make() {
    const n = name.trim();
    if (!n || !house || !me) return toast('Falta o nome do evento (ex.: Casamento, Batizado da Matilde).');
    setBusy(true);
    const { data, error } = await supabase.from('occasions').insert({ household_id: house.id, name: n.slice(0, 60), kind, created_by: me.id }).select('id').single();
    setBusy(false);
    if (error) return toast(error.message);
    occasions.reload();
    toast(`${n}: evento criado. A data, o orçamento e os convidados ficam em Eventos.`, { ok: true });
    onMade((data as { id: string }).id);
  }
  return (
    <div className="tile card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
      <span className="s">Conta no mês, mas fora do teu normal.</span>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casamento, Batizado da Matilde" maxLength={60} aria-label="Nome do evento" />
      <div className="chips wrap" role="group" aria-label="Tipo de evento">{KINDS.map((k) => <button type="button" key={k.k} className="press" aria-pressed={kind === k.k} onClick={() => setKind(k.k)}>{k.name}</button>)}</div>
      <button type="button" className="btn quiet press" disabled={busy} onClick={make}>Criar e juntar</button>
    </div>
  );
}

/** Compras extraordinárias: cada uma com o que já se pagou (todas as despesas juntas, de qualquer mês). */
function Purchases() {
  const { occasions, spendRows } = useHouse();
  const { open } = useOverlays();
  const list = occasions.rows.filter((o) => o.purchase && !o.archived);
  if (!list.length) return null;
  const paid = (id: string) => spendRows.filter((e) => e.occasion_id === id).reduce((t, e) => t + toU(e.amount), 0);
  return (
    <section className="stack" aria-label="Compras extraordinárias">
      <div className="wbar"><span className="s">Compras extraordinárias</span><span className="s">à parte do mês</span></div>
      <div className="tile card rows">{list.map((o) => (
        <button key={o.id} className="press" onClick={() => open(<PurchaseSheet id={o.id} />)}>
          <span className="k" style={{ color: 'var(--ink)' }}>{o.name}<span className="s" style={{ display: 'block' }}>{((n) => `${n} ${n === 1 ? 'despesa' : 'despesas'}`)(spendRows.filter((e) => e.occasion_id === o.id && !e.id.startsWith('in:')).length)}{o.car_id ? ' · na garagem' : ''}</span></span>
          <span className="v">{eur(paid(o.id), 0)} €<Icon n="arrow" s={16} /></span>
        </button>
      ))}</div>
    </section>
  );
}

function PurchaseSheet({ id }: { id: string }) {
  const { occasions, spendRows } = useHouse();
  const { close, toast } = useOverlays();
  const o = occasions.rows.find((x) => x.id === id);
  if (!o) return null;
  const list = spendRows.filter((e) => e.occasion_id === id).sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));
  const total = list.reduce((t, e) => t + toU(e.amount), 0);
  async function archive(v: boolean) {
    const { error } = await supabase.from('occasions').update({ archived: v }).eq('id', id);
    if (error) return toast(error.message);
    occasions.reload(); close(); toast(v ? `${o!.name}: arquivada. Ainda se lhe podem juntar despesas.` : 'De volta às compras.');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{o.name}</p>
      <p className="xl" style={{ margin: 0 }}>{eur(total, 0)}<small>€</small></p>
      <p className="s">Pago até agora, em {list.length} {list.length === 1 ? 'despesa' : 'despesas'}. Conta no mês de cada uma, mas à parte: o teu normal não sofre com isto.</p>
      {list.length > 0 && <div className="tile card rows">{list.map((e) => (
        <div key={e.id}><span className="k" style={{ color: 'var(--ink)' }}>{e.note || catLabel(e.category)}<span className="s" style={{ display: 'block' }}>{dayLabel(e.spent_on)}</span></span><span className="v">{eur(toU(e.amount))} €</span></div>
      ))}</div>}
      <p className="s">Para juntar mais (uma prestação, um extra): regista a despesa e escolhe «{o.name}», ou escreve o nome na frase.</p>
      {o.car_id && <Link className="btn quiet wide press" to={`/garagem/${o.car_id}`} onClick={close}>Ver na garagem <Icon n="arrow" s={20} /></Link>}
      <button className="back press" onClick={() => archive(!o.archived)}>{o.archived ? 'Reativar' : 'Arquivar (está paga)'}</button>
    </div>
  );
}

/**
 * Uma compra extraordinária nova (um carro, um sofá, um computador): fica como «categoria» à parte, à qual se vão
 * juntando despesas (a entrada, as prestações, os extras). Sendo um carro, entra também na garagem.
 */
function NewPurchase({ on: day, onMade }: { on: string; onMade: (id: string, isCar: boolean) => void }) {
  const { me, partner, house } = useSession();
  const { occasions, cars, modules, on } = useHouse();
  const { toast } = useOverlays();
  const [name, setName] = useState('');
  const [isCar, setIsCar] = useState(false);
  const [busy, setBusy] = useState(false);
  async function make() {
    const n = name.trim();
    if (!n || !house || !me) return toast('Falta o nome da compra (ex.: Carro novo, Sofá).');
    setBusy(true);
    let carId: string | null = null;
    if (isCar) {
      if (!on('garagem')) await supabase.from('household_modules').insert({ household_id: house.id, module: 'garagem', enabled_by: me.id });
      const c = await supabase.from('cars').insert({ household_id: house.id, name: n, owner_id: partner ? null : me.id, annual_insurance: 0, annual_tax: 0, annual_other: 0 }).select('id').single();
      if (c.error) { setBusy(false); return toast(c.error.message); }
      carId = (c.data as { id: string }).id;
    }
    const { data, error } = await supabase.from('occasions').insert({ household_id: house.id, name: n.slice(0, 60), kind: 'outro', on_date: day, purchase: true, car_id: carId, created_by: me.id }).select('id').single();
    setBusy(false);
    if (error) return toast(error.message);
    occasions.reload(); if (isCar) { cars.reload(); modules.reload(); }
    toast(isCar ? `${n}: compra criada e já na garagem. Completa lá a matrícula e o seguro.` : `${n}: compra criada. As próximas despesas podem juntar-se aqui.`, { ok: true });
    onMade((data as { id: string }).id, isCar);
  }
  return (
    <div className="tile card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
      <span className="s">Compra extraordinária: conta no mês, mas à parte (fora do ritmo e do teu normal). Juntas-lhe a entrada, as prestações e os extras.</span>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Carro novo, Sofá, Computador" maxLength={60} aria-label="Nome da compra" />
      <label className="check s"><input type="checkbox" checked={isCar} onChange={(e) => setIsCar(e.target.checked)} /> É um carro (entra na garagem)</label>
      <button type="button" className="btn quiet press" disabled={busy} onClick={make}>Criar e juntar esta despesa</button>
    </div>
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
  return <p className="s" style={{ minHeight: 18 }}>{`Escreve como falas: «45 jantar ontem partilhada${partner ? ` pagou a ${partner}` : ''}». O resto a NIKKI adivinha.`}</p>;
}

export function Cats() {
  const [key] = useMonthParam();
  const m = useMonth(key);
  const mx = m.byCat[0]?.[1] ?? 1;
  return (
    <>
      <Top title="Categorias" />
      {!m.byCat.length ? <p className="s">{m.current ? 'Ainda nada este mês. Promissor.' : `Sem despesas em ${monthName(m.key)}.`}</p> : <>
        <p className="s">A tua parte em {monthName(m.key)}</p>
        <div className="tile card rows">{m.byCat.map(([n, v]) => (
          <div key={n} style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 8, padding: '10px 0' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span>{eur(v, 0)} €</span></span>
            <span style={{ height: 2, background: 'var(--tile-2)', display: 'block' }}><span style={{ display: 'block', height: 2, width: `${((Math.max(v, 0) / mx) * 100).toFixed(1)}%`, background: 'var(--ink)' }} /></span>
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
    <>{!embedded && <Top title="Entre nós" />}<p className="l">Isto é para dois.</p><p className="s" style={{ fontSize: 'var(--t-m)' }}>Quando alguém se juntar à casa, aqui fica quem adiantou mais.</p><Link className="btn quiet wide press" to="/pessoas">Convidar <Icon n="arrow" s={20} /></Link></>
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
      <div className="swap"><p className="xl"><CountUp to={Math.abs(L.v)} fmt={(v) => eur(v)} /><small>€</small></p><p className="s" style={{ marginTop: 8 }}>{L.even ? 'Estão quites' : L.v > 0 ? `Adiantaste a mais (o combinado é ${Math.round(myShare * 100)}/${100 - Math.round(myShare * 100)})` : `${partner.name} adiantou a mais (o combinado é ${Math.round(myShare * 100)}/${100 - Math.round(myShare * 100)})`}</p></div>
      <Hint show={seen < 3}>{`Quanto cada um adiantou face ao combinado (${pct}/${100 - pct}). Não é uma dívida: é só para o esforço ficar bem repartido.`}</Hint>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0 4px', color: 'var(--ink)' }}>
          <Whiskers h={112} lean={L.lean} label={L.even ? 'Em equilíbrio: os bigodes estão iguais, como no logótipo. Paz.' : `${L.lead}: os bigodes do lado de ${L.v > 0 ? 'ti' : partner.name} estão maiores e a laranja.`} />
        </div>
        <div className="s" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tu {Math.round(a)}%</span><span>combinado {pct}/{100 - pct}</span><span>{partner.name} {100 - Math.round(a)}%</span></div>
      </div>
      {!L.even && <p className="s why"><span className="dot" aria-hidden="true" /><span>Para equilibrar sem transferências: {L.v > 0 ? `os próximos jantares são com ${partner.name}` : 'os próximos jantares são contigo'}.</span></p>}
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
  const { pairRows, transfers } = useHouse();
  const [q, setQ] = useState('');
  const [who, setWho] = useState<PairWho>('all');
  const [period, setPeriod] = useState<PairPeriod>('all');
  const [sort, setSort] = useState<PairSort>('new');
  const [n, setN] = useState(PAGE);
  const all = useMemo(() => (me && partner ? pairEntries(pairRows, transfers.rows, me.id, partner.id) : []), [pairRows, transfers.rows, me, partner]);
  const names = useMemo(() => ({ [me!.id]: me!.name, [partner!.id]: partner!.name }), [me, partner]);
  const list = useMemo(() => pairFilter(all, { q, who, period, sort, me: me!.id, names, today: todayStr() }), [all, q, who, period, sort, me, names]);
  useEffect(() => setN(PAGE), [q, who, period, sort]);
  const p = partner!.name;
  const effect = (v: number, kind: string) => (Math.abs(v) < 500 ? '' : kind === 'transfer' ? (v > 0 ? 'enviaste' : 'recebeste') : kind === 'entry' ? (v > 0 ? `${p} recebeu a tua parte (${eur(v)} €)` : `recebeste a parte de ${p} (${eur(-v)} €)`) : v > 0 ? `adiantaste ${eur(v)} €` : `${p} adiantou ${eur(-v)} €`);
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
        ? <p className="s">{all.length ? 'Nada com estes filtros. Tenta menos exigência.' : 'Ainda nada a dois. Um jantar partilhado resolve isto.'}</p>
        : <div className="tile card rows">{shown.map((e, j) => {
          const head = months && (j === 0 || monthKey(shown[j - 1].date) !== monthKey(e.date));
          const fx = effect(e.effect, e.kind);
          return (
            <Fragment key={e.id}>
              {head && <div className="mhead"><span className="s">{monthName(monthKey(e.date))} {e.date.slice(0, 4)}</span></div>}
              <div className={`mv${e.kind === 'expense' && e.payer === me!.id ? ' paid-me' : ''}`}>
                <span className="mv-t"><span>{e.title}</span><span className="s">{e.kind === 'transfer' ? (e.payer === me!.id ? `Tu → ${p}` : `${p} → tu`) : e.kind === 'entry' ? (e.payer === me!.id ? 'Entrada · recebeste tu' : `Entrada · recebeu ${p}`) : e.payer === me!.id ? 'Pagaste tu' : `Pagou ${p}`} · {dayLabel(e.date)}{e.category && e.title !== e.category ? ` · ${e.category}` : ''}</span></span>
                <span className="mv-v"><span>{e.kind === 'entry' ? '+' : ''}{eur(e.amount)} €</span>{fx && <span className={`s${e.effect > 0 ? ' up' : ''}`}>{fx}</span>}</span>
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
    if (!v) return setErr('Falta o valor.');
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
