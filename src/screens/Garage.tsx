import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEMO, supabase } from '@/lib/supabase';
import { readFuel, readOdometer } from '@/lib/fuel';
import { imagesText } from '@/lib/ocr';
import { useSession } from '@/data/session';
import { useHouse, type CarRow, type DeadlineRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { How } from '@/ui/Year';
import { Face } from '@/brand/Face';
import { eur, parseAmount, toU } from '@/lib/money';
import { addDays, dayLabel, monthKey, monthName, prevMonth, todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import {
  L100, anniversary, consumption, fixedIn, flags, iucDue, kmIn, longRun, nextYear, paymentKind, perKm, period, waitingFull,
  yearFigures, yearlyInsurance, type CarLog,
} from '@/lib/garage';
import { Top } from './Home';

// Garagem: carros da casa ou de cada um, consumo de cheio a cheio, km, €/km, prazos (IUC e seguro com um mês de
// antecedência) e o que está a rever. Regras em docs/CALCULOS.md, secção 5.

type PK = '12m' | 'year' | 'all';
const km = (n: number) => `${n.toLocaleString('pt-PT').replace(/ |,/g, ' ')} km`;
const eurKm = (u: number | null) => (u === null ? '—' : (u / 100_000).toFixed(2).replace('.', ','));
const dt = (d: string) => shortDate(`${d}T12:00:00`);
/** Perto: "daqui a 4 dias"; longe: "14 dez" (com o ano, se for outro). */
const when = (d: string) => (d <= addDays(todayStr(), 6) ? dayLabel(d) : dt(d));
const tankOf = (c: CarRow) => (c.tank_litres ? Number(c.tank_litres) : null);
const electric = (c: CarRow) => c.energy === 'eletrico';

function useOwnerLabel() {
  const { me, partner } = useSession();
  return (id: string | null) => (id === null ? (partner ? 'dos dois' : 'da casa') : id === me?.id ? 'teu' : id === partner?.id ? `de ${partner.name}` : '—');
}

/** O que a despesa de um carro faz às contas: carro dos dois → partilhada; teu → só tua; do outro → toda dele. */
function useCarSplit() {
  const { me, partner, myShare } = useSession();
  return (car: CarRow) => {
    if (!partner || car.owner_id === me?.id) return { split: 'mine', other_id: null, payer_share: null };
    if (car.owner_id === null) return { split: 'shared', other_id: partner.id, payer_share: myShare };
    return { split: 'other', other_id: partner.id, payer_share: null };
  };
}

/** Números de um carro num período: consumo (e longo prazo), km, gasto (registos + fixos proporcionais), €/km e o que rever. */
function useCarStats(car: CarRow | undefined, pk: PK) {
  const { carLogs } = useHouse();
  return useMemo(() => {
    if (!car) return null;
    const today = todayStr(), p = period(pk, today), tank = tankOf(car);
    const logs = carLogs.rows.filter((l) => l.car_id === car.id);
    // Gasto: os valores dos registos do carro, que toda a casa vê. Os prazos pagos (IUC, seguro) não têm registo:
    // já estão nos fixos por ano.
    const spent = logs.filter((l) => l.logged_on >= p.from && l.logged_on <= p.to && l.amount !== null).reduce((t, l) => t + toU(l.amount!), 0);
    const fixed = fixedIn(car, p, today), k = kmIn(logs, p), c = consumption(logs, p, tank), all = consumption(logs, undefined, tank);
    const lastOdo = logs.filter((l) => l.odometer !== null).sort((a, b) => b.logged_on.localeCompare(a.logged_on) || (b.odometer ?? 0) - (a.odometer ?? 0))[0]?.odometer ?? null;
    const yf = yearFigures(car, logs, today), c12 = consumption(logs, { from: addDays(today, -365), to: today, label: '' }, tank);
    return { p, logs, spent, fixed, km: k, c, all, c12, yf, long: longRun(logs, tank), waiting: waitingFull(logs, today), perKm: perKm(spent + fixed, k), flags: flags(logs), lastOdo };
  }, [car, pk, carLogs.rows]);
}

type Stats = NonNullable<ReturnType<typeof useCarStats>>;

/**
 * Os quatro números de um carro, nos últimos 12 meses: km por ano (reais ou estimados), €/km, custos fixos por mês
 * (tudo menos combustível e portagens) e consumo médio. Num elétrico, o consumo fica para mais tarde.
 */
function MainFigures({ car, s, compact }: { car: CarRow; s: Stats; compact?: boolean }) {
  const y = s.yf, c = s.c12.avg ?? s.all.last;
  const cells: [string, string, string][] = [
    [y.kmYear ? km(y.kmYear.km).replace(' km', '') : '—', 'km por ano', y.kmYear ? (y.kmYear.estimated ? 'estimado pelo ritmo' : 'últimos 12 meses') : 'faltam registos'],
    [eurKm(y.perKm), '€/km', 'tudo incluído'],
    [`${eur(y.fixedMonth, 0)} €`, 'fixos por mês', electric(car) ? 'seguro, oficina…' : 'seguro, IUC, oficina…'],
    electric(car) ? ['—', 'kWh/100 km', 'elétricos: em breve'] : [L100(c), 'L/100 km', s.c12.avg !== null ? 'média de 12 meses' : s.all.last !== null ? 'último medido' : 'ainda sem troço'],
  ];
  return compact
    ? <div className="car-stats four">{cells.map(([v, l, d]) => <span key={l}><b>{v}{d === 'estimado pelo ritmo' ? '*' : ''}</b><span className="s">{l === 'fixos por mês' ? 'fixos/mês' : l}</span></span>)}</div>
    : <div className="kpis">{cells.map(([v, l, d]) => <div className="tile kpi" key={l}><span className="l">{v}</span><span className="s">{l}<br />{d}</span></div>)}</div>;
}

/** Prazos que a NIKKI cria sozinha a partir dos dados do carro: IUC (mês da matrícula) e seguro (renovação), um mês antes. */
export function useCarDeadlines() {
  const { me, house } = useSession();
  const { deadlines } = useHouse();
  // paidOn: a partir de um pagamento acabado de fazer, o próximo prazo é o do ano seguinte.
  return async (car: CarRow, paidOn?: string) => {
    const open = (kind: string) => deadlines.rows.some((d) => d.car_id === car.id && d.kind === kind && !d.paid_at);
    const today = todayStr(), rows = [];
    const iucFrom = paidOn ? `${nextYear(paidOn).slice(0, 7)}-01` : today, insFrom = paidOn ? addDays(paidOn, 1) : today;
    // Os elétricos estão isentos de IUC.
    if (car.registered_on && !electric(car) && !open('iuc')) rows.push({ kind: 'iuc', title: `IUC do ${car.name}`, due_on: iucDue(car.registered_on, iucFrom), amount: Number(car.annual_tax) || null });
    if (car.insurance_renews_on && !open('insurance')) rows.push({ kind: 'insurance', title: `Seguro do ${car.name}${car.insurer ? ` (${car.insurer})` : ''}`, due_on: anniversary(car.insurance_renews_on, insFrom), amount: Number(car.annual_insurance) || null });
    if (!rows.length) return;
    await supabase.from('deadlines').insert(rows.map((r) => ({ ...r, household_id: house!.id, car_id: car.id, recurrence: 'yearly', remind_days: 30, created_by: me!.id })));
    deadlines.reload();
  };
}

/**
 * Aprender com um pagamento: se a nota diz que é o IUC ou o seguro (ex.: «IUC», «Fidelidade») e o carro ainda não
 * tem esses dados, ficam o mês, a data e o valor, para avisar a tempo no ano seguinte. Devolve a frase a dizer.
 */
export function useLearnFromPayment() {
  const { cars } = useHouse();
  const ensure = useCarDeadlines();
  return async (carOrNote: { car?: CarRow; note: string }, amount: number, on: string): Promise<string | null> => {
    const kind = paymentKind(carOrNote.note);
    if (!kind) return null;
    const active = cars.rows.filter((c) => !c.archived);
    const car = carOrNote.car ?? active.find((c) => carOrNote.note.toLowerCase().includes(c.name.toLowerCase())) ?? (active.length === 1 ? active[0] : undefined);
    if (!car) return null;
    const patch: Partial<CarRow> = {};
    if (kind === 'iuc') {
      if (!car.registered_on) patch.registered_on = `${on.slice(0, 7)}-01`;
      if (!Number(car.annual_tax)) patch.annual_tax = (amount / 100_000).toFixed(2);
    } else {
      if (!car.insurance_renews_on) patch.insurance_renews_on = on;
      if (!Number(car.annual_insurance)) patch.annual_insurance = (yearlyInsurance(amount) / 100_000).toFixed(2);
    }
    if (!Object.keys(patch).length) return null;
    await supabase.from('cars').update(patch).eq('id', car.id);
    await ensure({ ...car, ...patch }, on);
    cars.reload();
    return kind === 'iuc'
      ? `Percebi: é o IUC do ${car.name}. Fica o mês (${monthName(on.slice(0, 7))}) e o valor, e a NIKKI avisa um mês antes.`
      : `Percebi: é o seguro do ${car.name}. Fica a data de renovação e o valor; um mês antes, a NIKKI lembra que é altura de renegociar.`;
  };
}

/** A garagem por cima da cara da NIKKI: o portão sobe e aparece a chinchila. */
function GarageArt({ small }: { small?: boolean }) {
  return (
    <div className={`garage-art${small ? ' sm' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 120 92" className="garage-frame"><path d="M8 40 60 10l52 30M18 35v52M102 35v52M4 87h112" /></svg>
      <div className="garage-in"><Face h={small ? 24 : 36} /></div>
      <div className="garage-door"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

export function Garage() {
  const { house } = useSession();
  const { cars, deadlines } = useHouse();
  const { open } = useOverlays();
  const [showArchived, setShowArchived] = useState(false);
  const admin = !!house && house.role !== 'staff'; // os dois da casa são iguais
  const active = cars.rows.filter((c) => !c.archived), archived = cars.rows.filter((c) => c.archived);
  if (!cars.loading && !active.length && !archived.length) return <><Top title="Garagem" /><GarageSetup /></>;
  return (
    <>
      <Top title="Garagem" right={admin ? <button className="tb press" onClick={() => open(<CarSheet />)}>Juntar carro</button> : null} />
      <GarageArt small />
      {active.length >= 2 && <Compare cars={active} />}
      <div className="stack">{active.map((c) => <CarCard key={c.id} car={c} next={deadlines.rows.filter((d) => d.car_id === c.id && !d.paid_at).sort((a, b) => a.due_on.localeCompare(b.due_on))[0]} />)}</div>
      {archived.length > 0 && <>
        <button className="back press" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Esconder' : 'Ver'} os arquivados ({archived.length})</button>
        {showArchived && <div className="stack">{archived.map((c) => <CarCard key={c.id} car={c} />)}</div>}
      </>}
    </>
  );
}

/** Ao ligar o módulo: pôr os carros na garagem, com tudo o que a NIKKI precisa para avisar a tempo. */
function GarageSetup() {
  const { house } = useSession();
  const { cars } = useHouse();
  const nav = useNavigate();
  const admin = !!house && house.role !== 'staff'; // os dois da casa são iguais
  const [adding, setAdding] = useState(true);
  return (
    <>
      <GarageArt />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="l">Que carros há em casa?</p>
        <p className="s" style={{ fontSize: 'var(--t-m)' }}>Com a data da matrícula, a NIKKI avisa do IUC um mês antes; com a renovação do seguro, lembra que é altura de renegociar. O depósito ajuda a apanhar abastecimentos esquecidos. Tudo opcional: o que faltar, a NIKKI aprende com os pagamentos.</p>
      </div>
      {!admin ? <p className="s">Quem administra a casa junta os carros.</p>
        : adding ? <div className="tile" style={{ padding: 16 }}><CarForm onDone={() => setAdding(false)} /></div>
          : <div className="actions">
            <button className="btn quiet press" onClick={() => setAdding(true)}>Juntar outro carro</button>
            <button className="btn press" onClick={() => { cars.reload(); nav('/garagem'); }}>Feito <Icon n="check" s={18} /></button>
          </div>}
    </>
  );
}

const METRICS = [
  { k: 'km', label: 'Km/ano', unit: 'km por ano', low: false },
  { k: 'eurkm', label: '€/km', unit: '€/km', low: true },
  { k: 'fixed', label: 'Fixos', unit: '€ por mês', low: true },
  { k: 'l100', label: 'Consumo', unit: 'L/100 km', low: true },
] as const;

/** Comparar os carros da casa (até 5 lê-se bem num iPhone): uma barra por carro, nome à esquerda e valor à direita. */
function Compare({ cars }: { cars: CarRow[] }) {
  const { carLogs } = useHouse();
  const [m, setM] = useState<(typeof METRICS)[number]['k']>('km');
  const rows = useMemo(() => {
    const today = todayStr();
    return cars.map((car) => {
      const logs = carLogs.rows.filter((l) => l.car_id === car.id), y = yearFigures(car, logs, today);
      const v = m === 'l100' ? (electric(car) ? null : consumption(logs, { from: addDays(today, -365), to: today, label: '' }, tankOf(car)).avg)
        : m === 'eurkm' ? y.perKm : m === 'km' ? y.kmYear?.km ?? null : y.fixedMonth || null;
      return { car, v, est: m === 'km' && !!y.kmYear?.estimated };
    });
  }, [cars, carLogs.rows, m]);
  const meta = METRICS.find((x) => x.k === m)!;
  const has = rows.filter((r) => r.v !== null) as { car: CarRow; v: number; est: boolean }[];
  const max = Math.max(...has.map((r) => r.v), 0);
  const best = has.length > 1 ? (meta.low ? Math.min(...has.map((r) => r.v)) : Math.max(...has.map((r) => r.v))) : null;
  const fmt = (v: number) => (m === 'l100' ? L100(v) : m === 'eurkm' ? eurKm(v) : m === 'km' ? km(v).replace(' km', '') : `${eur(v, 0)}`);
  const sorted = [...rows].sort((a, b) => (a.v === null ? 1 : b.v === null ? -1 : meta.low ? a.v - b.v : b.v - a.v));
  return (
    <section className="tile pane cmp" aria-label="Comparar os carros" style={{ minHeight: 0 }}>
      <div className="pane-top"><span className="s">Comparar · 12 meses</span><span className="s">{meta.unit}</span></div>
      <div className="seg sm" role="group" aria-label="O quê">{METRICS.map((x) => <button key={x.k} className="press" aria-pressed={m === x.k} onClick={() => setM(x.k)}>{x.label}</button>)}</div>
      <div className="cmp-rows">{sorted.map(({ car, v, est }) => (
        <Link key={car.id} to={`/garagem/${car.id}`} className="cmp-row press" aria-label={`${car.name}: ${v === null ? 'sem dados' : `${fmt(v)} ${meta.unit}`}`}>
          <span className="cmp-n">{car.name}</span>
          <span className="cmp-b"><i className={v !== null && v === best ? 'best' : ''} style={{ width: v === null || !max ? 0 : `${Math.max(4, (v / max) * 100)}%` }} /></span>
          <span className="cmp-v">{v === null ? '—' : fmt(v)}{est ? '*' : ''}</span>
        </Link>
      ))}</div>
      {best !== null && <p className="s">{meta.low ? 'A laranja, o que gasta menos.' : 'A laranja, o que anda mais.'} {m === 'l100' ? 'Consumo de cheio a cheio; os elétricos ficam para breve.' : m === 'eurkm' ? 'Tudo incluído.' : m === 'fixed' ? 'Seguro, IUC, oficina e outras; sem combustível nem portagens.' : rows.some((r) => r.est) ? 'Com *, estimado pelo ritmo dos registos.' : ''}</p>}
    </section>
  );
}

/** Consumo de cada troço, em linha pequena (os últimos 10). */
function Spark({ values, med }: { values: number[]; med: number | null }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values) * 0.9, hi = Math.max(...values) * 1.05, w = 96, h = 28;
  const x = (j: number) => (j / (values.length - 1)) * w, y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * h;
  return (
    <svg className="spark" viewBox={`-2 -3 ${w + 4} ${h + 6}`} aria-hidden="true">
      {med !== null && <line x1="0" x2={w} y1={y(med)} y2={y(med)} className="med" />}
      <polyline points={values.map((v, j) => `${x(j)},${y(v)}`).join(' ')} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.6" />
    </svg>
  );
}

function CarCard({ car, next }: { car: CarRow; next?: DeadlineRow }) {
  const s = useCarStats(car, '12m')!;
  const { open } = useOverlays();
  const owner = useOwnerLabel();
  const review = s.flags.length + s.all.suspects.length;
  return (
    <article className={`tile car${car.archived ? ' arch' : ''}`}>
      <Link className="car-top press" to={`/garagem/${car.id}`}>
        <span className="ic"><Icon n="car" /></span>
        <span className="st2"><span>{car.name}{car.plate ? <span className="plate">{car.plate}</span> : null}</span><span className="s">{owner(car.owner_id)}{car.archived ? ' · arquivado' : ''}</span></span>
        {electric(car) ? <span className="ev-tag">elétrico</span> : <Spark values={s.all.segments.slice(-10).map((x) => x.l100)} med={s.all.median} />}
      </Link>
      <MainFigures car={car} s={s} compact />
      {(next || review > 0 || (s.waiting && !electric(car))) && <p className="s">{[next && `${next.title}: ${when(next.due_on)}`, s.waiting && !electric(car) && 'à espera de um depósito cheio', review > 0 && `${review} a rever`].filter(Boolean).join(' · ')}</p>}
      {!car.archived && <div className="actions"><button className="btn quiet press" onClick={() => open(<LogSheet car={car} kind={electric(car) ? 'charge' : 'fuel'} />)}>{electric(car) ? 'Carregar' : 'Abastecer'}</button><button className="btn quiet press" onClick={() => open(<LogSheet car={car} kind="service" />)}>Oficina</button></div>}
    </article>
  );
}

/** Consumo por troço (barras), com a mediana; os troços a rever ficam vazados. Um toque mostra o troço. */
function ConsumptionChart({ s }: { s: NonNullable<ReturnType<typeof useCarStats>> }) {
  const segs = [...s.all.segments.map((x) => ({ ...x, sus: '' })), ...s.all.suspects.map((x) => ({ ...x, sus: x.why }))].sort((a, b) => a.to.localeCompare(b.to)).slice(-12);
  const [sel, setSel] = useState(segs.length - 1);
  if (!segs.length) return null;
  const max = Math.max(...segs.map((x) => x.l100)) * 1.1, med = s.all.median;
  const cur = segs[Math.min(Math.max(sel, 0), segs.length - 1)];
  return (
    <section className="tile pane" aria-label="Consumo por troço" style={{ minHeight: 0 }}>
      <div className="pane-top"><span className="s">Consumo por depósito cheio</span><span className="s">L/100 km</span></div>
      <div className="cbars" role="group" aria-label="Troços" style={{ gridTemplateColumns: `repeat(${Math.max(8, segs.length)}, minmax(0, 1fr))` }}>
        {med !== null && <i className="cmed" style={{ bottom: `${(med / max) * 100}%` }} />}
        {Array.from({ length: Math.max(0, 8 - segs.length) }, (_, j) => <span key={'e' + j} aria-hidden="true" />)}
        {segs.map((x, j) => <button key={x.to + j} type="button" className={`press${x.sus ? ' sus' : ''}${x === cur ? ' on' : ''}`} aria-label={`${dt(x.from)} a ${dt(x.to)}: ${L100(x.l100)}`} onClick={() => setSel(j)}><i style={{ height: `${(x.l100 / max) * 100}%` }} /></button>)}
      </div>
      <p className="s"><span className="big2">{L100(cur.l100)}</span> · {dt(cur.from)} → {dt(cur.to)} · {km(cur.km)} · {cur.litres.toFixed(1).replace('.', ',')} L{cur.sus ? ` · a rever: ${cur.sus}` : ''}</p>
      {med !== null && <p className="s">A linha é o normal deste carro ({L100(med)}).</p>}
    </section>
  );
}

/** Gasto por mês nos 12 meses completos: registos do carro + a parte do mês dos fixos. */
function MonthlyCost({ car, logs }: { car: CarRow; logs: CarLog[] }) {
  const months = useMemo(() => {
    const out: string[] = [];
    let k = prevMonth(monthKey(todayStr()));
    for (let j = 0; j < 12; j++) { out.unshift(k); k = prevMonth(k); }
    const fixedMonth = ((Number(car.annual_insurance) + Number(car.annual_tax) + Number(car.annual_other)) * 100_000) / 12;
    const since = car.created_at.slice(0, 7);
    return out.map((m) => ({ m, v: logs.filter((l) => l.logged_on.startsWith(m) && l.amount !== null).reduce((t, l) => t + toU(l.amount!), 0) + (m >= since ? fixedMonth : 0) }));
  }, [car, logs]);
  const [sel, setSel] = useState(11);
  const max = Math.max(...months.map((x) => x.v), 1);
  if (!months.some((x) => x.v > 0)) return null;
  const cur = months[sel];
  return (
    <section className="tile pane" aria-label="Gasto por mês" style={{ minHeight: 0 }}>
      <div className="pane-top"><span className="s">Gasto por mês</span><span className="s">{monthName(cur.m)}: {eur(cur.v, 0)} €</span></div>
      <div className="wk mc" role="group" aria-label="Últimos 12 meses">{months.map((x, j) => (
        <button key={x.m} type="button" className={`press${j === sel ? ' on' : ''}`} aria-label={`${monthName(x.m)}: ${eur(x.v, 0)} €`} onClick={() => setSel(j)}><i style={{ height: x.v ? `${Math.max(6, (x.v / max) * 100)}%` : 2 }} className={x.v ? '' : 'zero'} /></button>
      ))}</div>
      <div className="wk-axis s"><span>{monthName(months[0].m).slice(0, 3)}</span><span>{monthName(months[11].m).slice(0, 3)}</span></div>
      <p className="s">Com seguro, IUC e outros fixos repartidos pelos meses.</p>
    </section>
  );
}

export function CarScreen() {
  const { id } = useParams();
  const { house } = useSession();
  const { cars, deadlines } = useHouse();
  const { open } = useOverlays();
  const owner = useOwnerLabel();
  const car = cars.rows.find((c) => c.id === id);
  const s = useCarStats(car, '12m');
  if (!car || !s) return <><Top title="Garagem" /><p className="s">{cars.loading ? 'A carregar…' : 'Este carro já não está na garagem.'}</p></>;
  const admin = !!house && house.role !== 'staff'; // os dois da casa são iguais
  const dl = deadlines.rows.filter((d) => d.car_id === car.id && !d.paid_at).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const flagged = new Map<string, string[]>();
  for (const f of s.flags) flagged.set(f.id, [...(flagged.get(f.id) ?? []), f.why]);
  const logs = [...s.logs].sort((a, b) => b.logged_on.localeCompare(a.logged_on) || b.created_at.localeCompare(a.created_at));
  const missing = [!car.registered_on && !electric(car) && 'a data da matrícula (para o IUC)', !car.insurance_renews_on && 'a renovação do seguro', !car.tank_litres && !electric(car) && 'o depósito'].filter(Boolean) as string[];
  return (
    <>
      <Top title={car.name} right={admin ? <button className="tb press" onClick={() => open(<CarSheet car={car} />)}>Editar</button> : null} />
      <p className="s">{car.plate ? `${car.plate} · ` : ''}{owner(car.owner_id)}{car.insurer ? ` · seguro ${car.insurer}` : ''}{car.archived ? ' · arquivado' : ''}</p>
      <MainFigures car={car} s={s} />
      {electric(car) && <p className="s why"><span className="dot" aria-hidden="true" /><span>Carro elétrico: o consumo em kWh/100 km chega em breve. Para já, a NIKKI conta os km, o €/km (com os carregamentos) e os fixos.</span></p>}
      {!electric(car) && s.waiting && <p className="s why"><span className="dot" aria-hidden="true" /><span>À espera de um depósito cheio{s.waiting !== 'nunca' ? ` desde ${dt(s.waiting)}` : ''}: o consumo só se mede de cheio a cheio.{s.long ? ` A longo prazo, ${L100(s.long.l100)} L/100 km${s.long.error !== null ? ` (± ${L100(s.long.error)})` : ''}, com todos os litros e km desde o primeiro cheio.` : ''}</span></p>}
      {!electric(car) && <ConsumptionChart s={s} />}
      <MonthlyCost car={car} logs={s.logs} />
      <How>
        <p className="s">Km por ano: os km dos últimos 12 meses pelo odómetro{s.yf.kmYear?.estimated ? '; como ainda não há um ano de registos, estima-se pelo ritmo dos que há (km por dia × 365)' : ''}.</p>
        <p className="s">€/km: tudo o que o carro custou ({electric(car) ? 'carregamentos' : 'combustível'}, portagens, oficina, seguro, IUC…) ÷ os km, desde {dt(s.yf.from)}.</p>
        <p className="s">Fixos por mês: seguro, IUC e outros por ano ÷ 12, mais oficina e outras despesas ÷ os meses com registos (até 12). {electric(car) ? 'Carregamentos' : 'Combustível'} e portagens ficam de fora.</p>
        {!electric(car) && <p className="s">Consumo: os litros desde o depósito cheio anterior (com os parciais) ÷ os km entre os dois cheios, nos últimos 12 meses. {s.c12.segments.length} {s.c12.segments.length === 1 ? 'troço medido' : 'troços medidos'}{s.c12.skipped ? `, ${s.c12.skipped} de fora por faltarem litros ou km` : ''}{s.c12.suspects.length ? `, ${s.c12.suspects.length} a rever` : ''}.</p>}
        {!electric(car) && s.long && <p className="s">Longo prazo (não precisa de atestar): {s.long.litres.toFixed(0)} L em {km(s.long.km)} = {L100(s.long.l100)} L/100 km.</p>}
      </How>
      {!car.archived && <div className="actions">
        <button className="btn press" onClick={() => open(<LogSheet car={car} kind={electric(car) ? 'charge' : 'fuel'} />)}>{electric(car) ? 'Carregar' : 'Abastecer'} <Icon n="plus" s={18} /></button>
        <button className="btn quiet press" onClick={() => open(<LogSheet car={car} kind="service" />)}>Oficina</button>
        <button className="btn quiet press" onClick={() => open(<LogSheet car={car} kind="toll" />)}>Portagens</button>
        <button className="btn quiet press" onClick={() => open(<LogSheet car={car} kind="other" />)}>Outra</button>
      </div>}
      {(s.flags.length > 0 || s.all.suspects.length > 0) && <section className="stack" aria-label="A rever">
        <span className="s">A rever</span>
        <div className="tile card rows">
          {s.all.suspects.map((x) => <div key={'s' + x.to}><span className="st2"><span>{dt(x.from)} → {dt(x.to)} · {L100(x.l100)} L/100 km</span><span className="s warn">{x.why}. Fica fora da média.</span></span></div>)}
          {s.flags.map((f, j) => { const l = s.logs.find((x) => x.id === f.id)!; return <div key={f.id + j}><span className="st2"><span>{dt(l.logged_on)}{l.odometer !== null ? ` · ${km(l.odometer)}` : ''}</span><span className="s warn">{f.why}</span></span></div>; })}
        </div>
      </section>}
      <section className="stack" aria-label="Prazos">
        <div className="wbar"><span className="s">Prazos</span>{!car.archived && <button className="tb press" onClick={() => open(<DeadlineSheet car={car} />)}>Novo prazo</button>}</div>
        {dl.length > 0 && <div className="tile card rows">{dl.map((d) => (
          <div key={d.id}>
            <span className="st2"><span>{d.title}</span><span className="s">{d.kind === 'iuc' ? 'até ' : d.kind === 'insurance' ? 'renova ' : ''}{when(d.due_on)}{d.amount ? ` · ${eur(toU(d.amount))} €` : ''}{d.kind === 'insurance' ? ' · um mês antes: pedir propostas e renegociar' : d.recurrence === 'yearly' ? ' · todos os anos' : ''}</span></span>
            <button className="tb press" onClick={() => open(<CarPaidSheet d={d} car={car} />)}>Paguei</button>
          </div>
        ))}</div>}
        {admin && missing.length > 0 && <button className="tile hint-card press" onClick={() => open(<CarSheet car={car} />)}><span className="st2"><span>Falta {missing.join(', ')}</span><span className="s">Para avisar {electric(car) ? 'da renovação do seguro' : 'do IUC e do seguro'} um mês antes. Ou a NIKKI aprende no próximo pagamento.</span></span><Icon n="arrow" s={16} /></button>}
      </section>
      <section className="stack" aria-label="Registos">
        <div className="wbar"><span className="s">Registos</span><span className="s">{logs.length}</span></div>
        {logs.length ? <div className="tile card rows">{logs.map((l) => {
          const a = l.amount !== null ? toU(l.amount) : null, why = flagged.get(l.id);
          return (
            <div key={l.id} className="mv">
              <span className="mv-t"><span>{l.kind === 'fuel' ? (l.full_tank ? 'Abastecimento' : 'Abastecimento parcial') : LOGNAME[l.kind]}{l.note && l.note !== LOGNAME[l.kind] ? ` · ${l.note}` : ''}</span>
                <span className="s">{dt(l.logged_on)}{l.odometer !== null ? ` · ${km(l.odometer)}` : ''}{l.litres !== null && l.litres !== '' ? ` · ${String(Number(l.litres)).replace('.', ',')} L` : ''}</span>
                {why && <span className="warn s">A rever: {why.join(', ')}</span>}</span>
              <span className="mv-v"><span>{a !== null ? `${eur(a)} €` : '—'}</span></span>
            </div>
          );
        })}</div> : <p className="s">Ainda sem registos. Abastece com o odómetro e os litros, e ao segundo depósito cheio a NIKKI já mede o consumo.</p>}
      </section>
    </>
  );
}

// ───────────── folhas ─────────────

function CarSheet({ car }: { car?: CarRow }) {
  const { close } = useOverlays();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><p className="l">{car ? car.name : 'Juntar carro'}</p><CarForm car={car} onDone={close} /></div>;
}

/** O carro: nome, matrícula e data, de quem, depósito, seguro (seguradora, renovação, valor), IUC e outros por ano. */
function CarForm({ car, onDone }: { car?: CarRow; onDone: () => void }) {
  const { me, partner, house } = useSession();
  const { cars } = useHouse();
  const { toast } = useOverlays();
  const ensure = useCarDeadlines();
  const [name, setName] = useState(car?.name ?? '');
  const [plate, setPlate] = useState(car?.plate ?? '');
  const [reg, setReg] = useState(car?.registered_on ?? '');
  const [owner, setOwner] = useState<string | null>(car ? car.owner_id : partner ? null : me!.id);
  const [tank, setTank] = useState(car?.tank_litres ? String(car.tank_litres) : '');
  const [energy, setEnergy] = useState<CarRow['energy']>(car?.energy ?? 'combustao');
  const [insurer, setInsurer] = useState(car?.insurer ?? '');
  const [renews, setRenews] = useState(car?.insurance_renews_on ?? '');
  const fx = (v: number | string | undefined) => (v && Number(v) ? String(v).replace('.', ',') : '');
  const [ins, setIns] = useState(fx(car?.annual_insurance)), [tax, setTax] = useState(fx(car?.annual_tax)), [oth, setOth] = useState(fx(car?.annual_other));
  const [err, setErr] = useState('');
  const money = (s: string) => (s.trim() ? parseAmount(s) : '0');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!name.trim()) return setErr('Dá um nome ao carro (ex.: Golf, o Mini da Inês).');
    const [a, b, c] = [money(ins), money(tax), money(oth)];
    if (a === null || b === null || c === null) return setErr('Os valores por ano escrevem-se assim: 380 ou 148,37.');
    const t = energy === 'combustao' && tank.trim() ? Number(tank.replace(',', '.')) : null;
    if (t !== null && !(t >= 10 && t <= 200)) return setErr('O depósito tem entre 10 e 200 litros.');
    const row = { household_id: house!.id, name: name.trim(), plate: plate.trim().toUpperCase() || null, owner_id: owner, annual_insurance: a, annual_tax: b, annual_other: c, registered_on: reg || null, insurer: insurer.trim() || null, insurance_renews_on: renews || null, tank_litres: t, energy };
    const res = car ? await supabase.from('cars').update(row).eq('id', car.id).select('*').single() : await supabase.from('cars').insert(row).select('*').single();
    if (res.error) return setErr(res.error.message);
    await ensure(res.data as CarRow);
    cars.reload(); onDone();
    toast(car ? 'Guardado.' : `${name.trim()} está na garagem.${reg || renews ? ' A NIKKI avisa um mês antes do IUC e do seguro.' : ''}`, { ok: true });
  }
  async function archive(v: boolean) {
    const { error } = await supabase.from('cars').update({ archived: v }).eq('id', car!.id);
    if (error) { toast(error.message); return; }
    cars.reload(); onDone(); toast(v ? 'Arquivado: fica o histórico.' : 'De volta à garagem.');
  }
  const owners: [string | null, string][] = [[me!.id, 'Meu'], ...(partner ? [[partner.id, `De ${partner.name}`], [null, 'Dos dois']] as [string | null, string][] : [])];
  return (
    <>
      <form className="form" onSubmit={save}>
        <div className="two">
          <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Golf" maxLength={40} /></label>
          <label>Matrícula<input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="AA-00-AA" maxLength={12} /></label>
        </div>
        <div className="seg" role="group" aria-label="Motor"><button type="button" className="press" aria-pressed={energy === 'combustao'} onClick={() => setEnergy('combustao')}>Combustão</button><button type="button" className="press" aria-pressed={energy === 'eletrico'} onClick={() => setEnergy('eletrico')}>Elétrico</button></div>
        {energy === 'eletrico' && <p className="s">Elétricos: km, €/km e fixos já contam. O consumo em kWh/100 km chega em breve.</p>}
        {owners.length > 1 && <div className="seg" role="group" aria-label="De quem">{owners.map(([id, l]) => <button key={l} type="button" className="press" aria-pressed={owner === id} onClick={() => setOwner(id)}>{l}</button>)}</div>}
        <div className="two">
          <label>Data da matrícula<input type="date" value={reg} onChange={(e) => setReg(e.target.value)} /></label>
          {energy === 'combustao' && <label>Depósito (L)<input inputMode="decimal" value={tank} onChange={(e) => setTank(e.target.value)} placeholder="ex.: 50" /></label>}
        </div>
        <p className="s">{energy === 'eletrico' ? 'Os elétricos estão isentos de IUC.' : 'O IUC paga-se até ao fim do mês da matrícula: a NIKKI avisa um mês antes.'}</p>
        <div className="two">
          <label>Seguradora<input value={insurer} onChange={(e) => setInsurer(e.target.value)} placeholder="ex.: Fidelidade" maxLength={40} /></label>
          <label>Renovação do seguro<input type="date" value={renews} onChange={(e) => setRenews(e.target.value)} /></label>
        </div>
        <p className="s">Por ano (entram no €/km, repartidos pelos dias)</p>
        <div className="three">
          <label>Seguro (€)<input inputMode="decimal" value={ins} onChange={(e) => setIns(e.target.value)} placeholder="0" /></label>
          <label>IUC (€)<input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" /></label>
          <label>Outros (€)<input inputMode="decimal" value={oth} onChange={(e) => setOth(e.target.value)} placeholder="0" /></label>
        </div>
        <p className="s">{owner === null ? 'As despesas deste carro ficam partilhadas.' : owner === me!.id ? 'As despesas deste carro ficam só tuas.' : `Se pagares uma despesa deste carro, fica na parte de ${partner?.name}.`} Tudo é opcional menos o nome: o que faltar, a NIKKI aprende com os pagamentos.</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {car && <button className="back press" onClick={() => archive(!car.archived)}>{car.archived ? 'Voltar a pôr na garagem' : 'Arquivar (vendido ou abatido)'}</button>}
    </>
  );
}

const KIND: Record<CarLog['kind'], string> = { fuel: 'Abastecer', charge: 'Carregar', service: 'Oficina', toll: 'Portagens', other: 'Outra despesa' };
const LOGNAME: Record<CarLog['kind'], string> = { fuel: 'Abastecimento', charge: 'Carregamento', service: 'Oficina', toll: 'Portagens', other: 'Outra' };

/** Os campos de um registo do carro (tipo, litros, km, cheio ou parcial), partilhados pela Garagem e pelo «+». */
export interface CarEntry { kind: CarLog['kind']; litres: string; odo: string; full: boolean }
export const carEntry = (car: CarRow, kind?: CarLog['kind']): CarEntry => ({ kind: kind ?? (electric(car) ? 'charge' : 'fuel'), litres: '', odo: '', full: true });
export const lastOdometer = (logs: CarLog[], car: CarRow) => logs.filter((l) => l.car_id === car.id && l.odometer !== null).reduce<number | null>((m, l) => Math.max(m ?? 0, l.odometer!), null);

/** Valida os litros e os km; devolve o erro a mostrar ou os números a gravar. */
export function checkEntry(car: CarRow, f: CarEntry, last: number | null): string | { litres: number | null; odometer: number | null } {
  const l = f.kind === 'fuel' && f.litres.trim() ? Number(f.litres.replace(',', '.')) : null;
  if (f.kind === 'fuel' && (l === null || !(l > 0) || l > 200)) return 'Quantos litros? (está no talão)';
  if (l !== null && car.tank_litres && l > Number(car.tank_litres) * 1.05) return `${l} L não cabem num depósito de ${car.tank_litres} L.`;
  const o = f.odo.trim() && hasOdo(f.kind) ? Number(f.odo.replace(/\D/g, '')) : null;
  if (o !== null && last !== null && o < last) return `Os km não podem ser menos do que no último registo (${km(last)}).`;
  return { litres: l, odometer: o };
}
const hasOdo = (k: CarLog['kind']) => k === 'fuel' || k === 'charge' || k === 'service';

/** Grava o registo do carro ligado à despesa (com o valor, para os dois verem a Garagem igual). */
export function useSaveCarLog() {
  const { me, house } = useSession();
  return (car: CarRow, f: CarEntry, n: { litres: number | null; odometer: number | null }, expense_id: string, amount: string, logged_on: string, note: string) =>
    supabase.from('car_logs').insert({ household_id: house!.id, car_id: car.id, logged_on, odometer: n.odometer, litres: n.litres, full_tank: f.kind === 'fuel' ? f.full : true, kind: f.kind, expense_id, amount, note: note.trim() || null, created_by: me!.id });
}

export function CarEntryFields({ car, f, set, last, pickKind, onAmount }: { car: CarRow; f: CarEntry; set: (f: CarEntry) => void; last: number | null; pickKind?: boolean; onAmount?: (v: number) => void }) {
  const kinds: CarLog['kind'][] = [electric(car) ? 'charge' : 'fuel', 'service', 'toll', 'other'];
  return (
    <>
      {pickKind && <div className="seg" role="group" aria-label="Que despesa">{kinds.map((k) => <button key={k} type="button" className="press" aria-pressed={f.kind === k} onClick={() => set({ ...f, kind: k })}>{k === 'other' ? 'Outra' : KIND[k]}</button>)}</div>}
      {(f.kind === 'fuel' || f.kind === 'charge') && <FuelPhotos f={f} set={set} last={last} onAmount={onAmount} />}
      {(f.kind === 'fuel' || hasOdo(f.kind)) && <div className="two">
        {f.kind === 'fuel' && <label>Litros<input inputMode="decimal" value={f.litres} onChange={(e) => set({ ...f, litres: e.target.value })} placeholder="0,00" /></label>}
        {hasOdo(f.kind) && <label>Odómetro (km)<input inputMode="numeric" value={f.odo} onChange={(e) => set({ ...f, odo: e.target.value })} placeholder={last !== null ? `último ${last}` : 'ex.: 48 210'} /></label>}
      </div>}
      {f.kind === 'fuel' && <div className="seg" role="group" aria-label="Depósito"><button type="button" className="press" aria-pressed={f.full} onClick={() => set({ ...f, full: true })}>Depósito cheio</button><button type="button" className="press" aria-pressed={!f.full} onClick={() => set({ ...f, full: false })}>Parcial</button></div>}
    </>
  );
}

/** A frase de ajuda de um registo do carro. */
export const entryWhy = (f: CarEntry) => (f.kind === 'fuel' ? (!f.full ? 'Parcial: os litros somam-se até ao próximo depósito cheio.' : f.odo.trim() ? 'Com os km e os litros, o consumo mede-se de depósito cheio a depósito cheio.' : 'Sem os km, este abastecimento não entra no consumo.')
  : f.kind === 'charge' ? 'Entra no €/km. O consumo em kWh/100 km chega em breve.' : f.kind === 'toll' ? 'Entra no €/km; não conta nos fixos por mês.' : 'Entra no €/km e nos fixos por mês. Se for o IUC ou o seguro, a NIKKI percebe pela nota.');

export function LogSheet({ car, kind }: { car: CarRow; kind: CarLog['kind'] }) {
  const { me, house } = useSession();
  const { expenses, carLogs } = useHouse();
  const { close, toast } = useOverlays();
  const split = useCarSplit();
  const learn = useLearnFromPayment();
  const saveLog = useSaveCarLog();
  const last = lastOdometer(carLogs.rows, car);
  const [amt, setAmt] = useState('');
  const [f, setF] = useState(() => carEntry(car, kind));
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'h' | 'o' | 'x'>('h');
  const [date, setDate] = useState(todayStr());
  const [err, setErr] = useState('');
  const spent_on = day === 'h' ? todayStr() : day === 'o' ? addDays(todayStr(), -1) : date;
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = parseAmount(amt);
    if (!v) return setErr('Escreve o valor.');
    const n = checkEntry(car, f, last);
    if (typeof n === 'string') return setErr(n);
    const what = f.kind === 'other' ? 'Carro' : LOGNAME[f.kind];
    const { data, error } = await supabase.from('expenses').insert({
      household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Carros', spent_on, car_id: car.id,
      note: `${note.trim() || what} · ${car.name}`.slice(0, 120), ...split(car),
    }).select('id').single();
    if (error) return setErr(error.message);
    const { error: e2 } = await saveLog(car, f, n, (data as { id: string }).id, v, spent_on, note);
    if (e2) return setErr(e2.message);
    expenses.reload(); carLogs.reload(); close();
    const learned = (f.kind === 'other' || f.kind === 'service') && note.trim() ? await learn({ car, note }, toU(v), spent_on) : null;
    toast(learned ?? `${car.name}: ${eur(toU(v))} €${n.litres !== null ? ` · ${String(n.litres).replace('.', ',')} L` : ''}.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{KIND[f.kind]} · {car.name}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} autoFocus /><span className="l">€</span></div>
      <div className="form">
        <CarEntryFields car={car} f={f} set={setF} last={last} onAmount={(a) => setAmt(a.toFixed(2).replace(".", ","))} />
        {f.kind !== 'fuel' && <label>Nota<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={f.kind === 'service' ? 'Ex.: revisão, pneus' : f.kind === 'toll' ? 'Ex.: Via Verde, A1' : f.kind === 'charge' ? 'Ex.: casa, Ionity' : 'Ex.: IUC, seguro, lavagem, estacionamento'} maxLength={60} /></label>}
      </div>
      <div className="chips" role="group" aria-label="Dia">
        <button type="button" className="press" aria-pressed={day === 'h'} onClick={() => setDay('h')}>Hoje</button>
        <button type="button" className="press" aria-pressed={day === 'o'} onClick={() => setDay('o')}>Ontem</button>
        <button type="button" className="press" aria-pressed={day === 'x'} onClick={() => setDay('x')}>Outro dia</button>
      </div>
      {day === 'x' && <input className="field" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Dia" />}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || entryWhy(f)}</span></p>
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}

const DL: [string, DeadlineRow['kind']][] = [['IUC', 'iuc'], ['Inspeção', 'inspection'], ['Seguro', 'insurance'], ['Revisão', 'service'], ['Outro', 'other']];

function DeadlineSheet({ car }: { car: CarRow }) {
  const { me, house } = useSession();
  const { deadlines } = useHouse();
  const { close, toast } = useOverlays();
  const [what, setWhat] = useState('IUC');
  const [other, setOther] = useState('');
  const [due, setDue] = useState(addDays(todayStr(), 30));
  const [amt, setAmt] = useState('');
  const [yearly, setYearly] = useState(true);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const t = what === 'Outro' ? other.trim() : what;
    if (!t) return setErr('O que é?');
    const a = amt.trim() ? parseAmount(amt) : null;
    if (amt.trim() && !a) return setErr('O valor escreve-se assim: 148,37.');
    const kind = DL.find(([l]) => l === what)![1];
    const { error } = await supabase.from('deadlines').insert({ household_id: house!.id, title: `${t} do ${car.name}`, due_on: due, amount: a, recurrence: yearly ? 'yearly' : 'none', car_id: car.id, kind, remind_days: kind === 'iuc' || kind === 'insurance' ? 30 : 7, created_by: me!.id });
    if (error) return setErr(error.message);
    deadlines.reload(); close(); toast(`${t} do ${car.name}: ${when(due)}.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Novo prazo · {car.name}</p>
      <div className="chips" role="group" aria-label="O quê">{DL.map(([d]) => <button key={d} type="button" className="press" aria-pressed={what === d} onClick={() => setWhat(d)}>{d}</button>)}</div>
      <div className="form">
        {what === 'Outro' && <label>O quê<input value={other} onChange={(e) => setOther(e.target.value)} maxLength={40} /></label>}
        <div className="two">
          <label>Até<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <label>Valor (€, opcional)<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0,00" /></label>
        </div>
        <div className="seg" role="group" aria-label="Repete"><button type="button" className="press" aria-pressed={yearly} onClick={() => setYearly(true)}>Todos os anos</button><button type="button" className="press" aria-pressed={!yearly} onClick={() => setYearly(false)}>Só uma vez</button></div>
      </div>
      {err && <p className="err">{err}</p>}
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}

/** Paguei: regista a despesa (fica no Dinheiro, fora do €/km, que já conta o IUC e o seguro por ano) e, se é anual, cria o do ano seguinte. */
export function CarPaidSheet({ d, car }: { d: DeadlineRow; car: CarRow }) {
  const { me, house } = useSession();
  const { deadlines, expenses, cars } = useHouse();
  const { close, toast } = useOverlays();
  const split = useCarSplit();
  const [amt, setAmt] = useState(d.amount ? eur(toU(d.amount)).replace(/\s/g, '') : '');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('Quanto pagaste?');
    const { data, error } = await supabase.from('expenses').insert({ household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Carros', spent_on: todayStr(), car_id: car.id, source: 'deadline', note: d.title.slice(0, 120), ...split(car) }).select('id').single();
    if (error) return setErr(error.message);
    await supabase.from('deadlines').update({ paid_at: new Date().toISOString(), paid_by: me!.id, expense_id: (data as { id: string }).id }).eq('id', d.id);
    if (d.recurrence === 'yearly') await supabase.from('deadlines').insert({ household_id: house!.id, title: d.title, due_on: nextYear(d.due_on), amount: v, recurrence: 'yearly', car_id: car.id, kind: d.kind, remind_days: d.remind_days ?? 7, created_by: me!.id });
    // O valor pago fica como referência do carro (IUC ou seguro por ano), se ainda não havia.
    if (d.kind === 'iuc' && !Number(car.annual_tax)) await supabase.from('cars').update({ annual_tax: v }).eq('id', car.id);
    if (d.kind === 'insurance' && !Number(car.annual_insurance)) await supabase.from('cars').update({ annual_insurance: (yearlyInsurance(toU(v)) / 100_000).toFixed(2) }).eq('id', car.id);
    deadlines.reload(); expenses.reload(); cars.reload(); close();
    toast(d.recurrence === 'yearly' ? `${d.title} pago. O próximo fica para ${dt(nextYear(d.due_on))}.` : `${d.title} pago.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{d.title}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor pago" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      {d.kind === 'insurance' && <p className="s">Antes de renovar: pede 2 ou 3 propostas com as mesmas coberturas e leva a melhor à tua seguradora. É a altura em que mais se poupa.</p>}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || `Fica nas despesas de hoje, em Carros${d.recurrence === 'yearly' ? `, e o prazo passa para ${dt(nextYear(d.due_on))}` : ''}.`}</span></p>
      <button className="btn wide press">Paguei <Icon n="check" s={20} /></button>
    </form>
  );
}

/**
 * Abastecer por fotografia: a do talão ou do mostrador da bomba dá o valor e os litros; a do conta-quilómetros, os
 * km. Lê-se no telemóvel e a foto não fica guardada. O que se leu fica nos campos, para confirmar.
 */
function FuelPhotos({ f, set, last, onAmount }: { f: CarEntry; set: (f: CarEntry) => void; last: number | null; onAmount?: (v: number) => void }) {
  const [busy, setBusy] = useState<'talao' | 'km' | null>(null);
  const [said, setSaid] = useState('');
  const talao = useRef<HTMLInputElement>(null), kmRef = useRef<HTMLInputElement>(null);
  const fuel = f.kind === 'fuel';
  function apply(which: 'talao' | 'km', text: string) {
    if (which === 'talao') {
      const r = readFuel(text);
      if (r.litres === null && r.amount === null) return setSaid('Não consegui ler o talão. Tenta de mais perto, com luz, ou escreve à mão.');
      if (r.litres !== null && fuel) set({ ...f, litres: String(r.litres).replace('.', ',') });
      if (r.amount !== null) onAmount?.(r.amount);
      setSaid(`Li ${[r.amount !== null ? `${String(r.amount.toFixed(2)).replace('.', ',')} €` : '', r.litres !== null && fuel ? `${String(r.litres).replace('.', ',')} L` : '', r.price ? `a ${String(r.price).replace('.', ',')} €/L` : ''].filter(Boolean).join(', ')}. Confirma.`);
    } else {
      const k = readOdometer(text, last);
      if (k === null) return setSaid('Não consegui ler os km. Tenta com o mostrador direito, ou escreve à mão.');
      set({ ...f, odo: String(k) });
      setSaid(`Li ${km(k)}. Confirma.`);
    }
  }
  async function read(which: 'talao' | 'km', file: File | undefined) {
    if (!file) return;
    setBusy(which); setSaid(which === 'talao' ? 'A ler o talão…' : 'A ler os km…');
    try { apply(which, await imagesText([file], () => {})); } catch { setSaid('Não deu para ler a foto. Escreve à mão.'); } finally { setBusy(null); }
  }
  return (
    <div className="fuel-photos">
      <input ref={talao} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read('talao', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={kmRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read('km', e.target.files?.[0]); e.target.value = ''; }} />
      <div className="two-btn">
        <button type="button" className="btn quiet press" disabled={!!busy} onClick={() => talao.current?.click()}><Icon n="cam" s={18} /> {fuel ? 'Talão ou bomba' : 'Talão'}</button>
        <button type="button" className="btn quiet press" disabled={!!busy} onClick={() => kmRef.current?.click()}><Icon n="cam" s={18} /> Km</button>
      </div>
      {DEMO && <div className="two-btn">
        <button type="button" className="tb quiet press" onClick={() => apply('talao', 'GALP\nGasoleo 34,66 L x 1,789 €/L\nTOTAL 62,00 €')}>Talão de exemplo</button>
        <button type="button" className="tb quiet press" onClick={() => apply('km', `TRIP A 412.3\nODO ${(last ?? 48000) + 640} km`)}>Km de exemplo</button>
      </div>}
      {said && <p className="s" aria-live="polite">{said}</p>}
    </div>
  );
}
