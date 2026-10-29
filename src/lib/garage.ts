// Garagem: consumo de depósito cheio a depósito cheio, km, custo por km e registos a rever.
// Regras em docs/CALCULOS.md (secção 5) do repositório thenikki. Valores em unidades de money.ts.

import { daysInMonth, monthKey, parseDate, prevMonth } from './dates';

export interface CarLog {
  id: string;
  car_id: string;
  logged_on: string; // YYYY-MM-DD
  odometer: number | null;
  litres: number | string | null;
  full_tank: boolean;
  kind: 'fuel' | 'charge' | 'service' | 'toll' | 'other';
  expense_id: string | null;
  amount: number | string | null; // o valor da despesa, guardado no registo (a Garagem é de toda a casa)
  note?: string | null;
  created_at: string;
}
export interface Car { id: string; created_at: string; annual_insurance: number | string; annual_tax: number | string; annual_other: number | string }

const num = (v: number | string | null) => (v === null || v === '' ? null : Number(v));
const order = (a: CarLog, b: CarLog) => a.logged_on.localeCompare(b.logged_on) || (a.odometer ?? 0) - (b.odometer ?? 0) || a.created_at.localeCompare(b.created_at);

export interface Period { from: string; to: string; label: string }

/** Os 12 meses completos antes do mês corrente; o ano até hoje; ou desde sempre. */
export function period(kind: '12m' | 'year' | 'all', today: string): Period {
  if (kind === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today, label: 'este ano' };
  if (kind === 'all') return { from: '0000-01-01', to: '9999-12-31', label: 'desde sempre' };
  const last = prevMonth(monthKey(today));
  let first = last;
  for (let j = 0; j < 11; j++) first = prevMonth(first);
  return { from: `${first}-01`, to: `${last}-${String(daysInMonth(last)).padStart(2, '0')}`, label: 'últimos 12 meses' };
}

const median = (xs: number[]) => { const v = [...xs].sort((x, y) => x - y), m = v.length >> 1; return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null; };

interface Segment { from: string; to: string; km: number; litres: number; l100: number }

/** Todos os troços de cheio a cheio de um carro (os que não se medem contam-se em skipped, com a data). */
function walk(logs: CarLog[]) {
  const fuel = logs.filter((l) => l.kind === 'fuel').sort(order);
  const segments: Segment[] = [], skipped: string[] = [];
  let prev: CarLog | null = null, acc = 0, bad = false;
  for (const l of fuel) {
    if (!prev) { if (l.full_tank && l.odometer !== null) prev = l; continue; }
    const litres = num(l.litres);
    if (litres === null) bad = true; else acc += litres;
    if (!l.full_tank) continue;
    const km = l.odometer !== null && prev.odometer !== null ? l.odometer - prev.odometer : null;
    if (bad || km === null || km <= 0) skipped.push(l.logged_on);
    else segments.push({ from: prev.logged_on, to: l.logged_on, km, litres: acc, l100: (acc / km) * 100 });
    prev = l.odometer !== null ? l : null; acc = 0; bad = false;
  }
  return { segments, skipped };
}

/**
 * Consumo de cheio a cheio: os litros desde o depósito cheio anterior (parciais incluídos) a dividir pelos km entre
 * os dois cheios. Fica de fora (skipped) um troço com um abastecimento sem litros, sem odómetro nas pontas ou com km
 * a descer. Fica de fora e a rever (suspects) um troço que parece ter um abastecimento esquecido: com 3 ou mais
 * troços, 35% abaixo da mediana do carro; com a capacidade do depósito, mais km do que cabem num depósito (+10%).
 * Só contam os troços que acabam dentro do período.
 */
export function consumption(logs: CarLog[], p?: Period, tank?: number | null) {
  const all = walk(logs);
  const med = all.segments.length >= 3 ? median(all.segments.map((s) => s.l100)) : null;
  const ref = med ?? (all.segments.length ? median(all.segments.map((s) => s.l100)) : null);
  const inside = (d: string) => !p || (d >= p.from && d <= p.to);
  const segments: Segment[] = [], suspects: (Segment & { why: string })[] = [];
  for (const s of all.segments) {
    if (!inside(s.to)) continue;
    if (med !== null && s.l100 < med * 0.65) suspects.push({ ...s, why: 'parece faltar um abastecimento (consumo muito abaixo do normal)' });
    else if (tank && ref && s.km > (tank / (ref / 100)) * 1.1) suspects.push({ ...s, why: `${s.km} km não cabem num depósito de ${tank} L: faltou registar um abastecimento` });
    else segments.push(s);
  }
  const km = segments.reduce((t, s) => t + s.km, 0), litres = segments.reduce((t, s) => t + s.litres, 0);
  return { avg: km ? (litres / km) * 100 : null, last: segments.length ? segments[segments.length - 1].l100 : null, segments, suspects, skipped: all.skipped.filter(inside).length, median: med };
}

/**
 * Consumo de longo prazo: todos os litros desde o primeiro depósito cheio a dividir pelos km até ao último
 * odómetro. Não precisa de atestar: o erro nunca passa de um depósito (± capacidade ÷ km). Null com menos de
 * 300 km ou com abastecimentos sem litros pelo meio.
 */
export function longRun(logs: CarLog[], tank?: number | null) {
  const fuel = logs.filter((l) => l.kind === 'fuel').sort(order);
  const i = fuel.findIndex((l) => l.full_tank && l.odometer !== null);
  if (i < 0) return null;
  const rest = fuel.slice(i + 1), lastOdo = [...rest].reverse().find((l) => l.odometer !== null);
  if (!lastOdo) return null;
  const upto = rest.slice(0, rest.indexOf(lastOdo) + 1);
  if (upto.some((l) => num(l.litres) === null)) return null;
  const km = lastOdo.odometer! - fuel[i].odometer!, litres = upto.reduce((t, l) => t + num(l.litres)!, 0);
  if (km < 300) return null;
  return { l100: (litres / km) * 100, km, litres, error: tank ? (tank / km) * 100 : null };
}

/** À espera de um depósito cheio: há abastecimentos depois do último troço medido (2 ou mais, ou 1 há mais de 60 dias). */
export function waitingFull(logs: CarLog[], today: string): string | null {
  const { segments } = walk(logs);
  const fuel = logs.filter((l) => l.kind === 'fuel');
  const lastTo = segments.length ? segments[segments.length - 1].to : null;
  const after = fuel.filter((l) => !lastTo || l.logged_on > lastTo);
  if (!fuel.length) return null;
  const old = lastTo ? (parseDate(today).getTime() - parseDate(lastTo).getTime()) / 86_400_000 > 60 : true;
  return after.length >= 2 || (after.length >= 1 && old) ? lastTo ?? 'nunca' : null;
}

/** Preço mediano por litro dos últimos 10 abastecimentos com valor e litros (para estimar litros que faltam). */
export function pricePerLitre(logs: CarLog[]): number | null {
  const both = logs.filter((l) => l.kind === 'fuel' && num(l.litres) && num(l.amount)).sort(order).slice(-10);
  return median(both.map((l) => num(l.amount)! / num(l.litres)!));
}

/** Km feitos no período: último odómetro − primeiro (todos os registos com odómetro, não só os troços medidos). */
export function kmIn(logs: CarLog[], p: Period): number {
  const o = logs.filter((l) => l.odometer !== null && l.logged_on >= p.from && l.logged_on <= p.to).sort(order).map((l) => l.odometer!);
  return o.length < 2 ? 0 : Math.max(0, o[o.length - 1] - o[0]);
}

/** Fixos (seguro, IUC, outros por ano) proporcionais aos dias do período em que o carro já era da casa. */
export function fixedIn(car: Car, p: Period, today: string): number {
  const yearly = (Number(car.annual_insurance) + Number(car.annual_tax) + Number(car.annual_other)) * 100_000;
  const start = [p.from, car.created_at.slice(0, 10)].sort()[1];
  const end = [p.to, today].sort()[0];
  if (end < start) return 0;
  const days = Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000) + 1;
  return Math.round((yearly * days) / 365);
}

/** €/km do período: despesas do carro + fixos proporcionais, a dividir pelos km. Null sem km. */
export const perKm = (cost: number, km: number) => (km > 0 ? cost / km : null);

/** Registos a rever: abastecimento sem litros ou sem odómetro, km a descer, possível duplicado. */
export function flags(logs: CarLog[]): { id: string; why: string }[] {
  const out: { id: string; why: string }[] = [];
  const ppl = pricePerLitre(logs);
  const sorted = [...logs].sort(order);
  let lastOdo: number | null = null;
  const seen = new Set<string>();
  for (const l of sorted) {
    if (l.kind === 'fuel' && num(l.litres) === null) {
      const a = num(l.amount);
      out.push({ id: l.id, why: a && ppl ? `sem litros (≈ ${(a / ppl).toFixed(1).replace('.', ',')} L estimados pelo preço; não entram no consumo)` : 'abastecimento sem litros' });
    }
    if (l.kind === 'fuel' && l.odometer === null) out.push({ id: l.id, why: 'sem quilómetros' });
    if (l.odometer !== null) {
      if (lastOdo !== null && l.odometer < lastOdo) out.push({ id: l.id, why: 'quilómetros abaixo do registo anterior' });
      lastOdo = Math.max(lastOdo ?? 0, l.odometer);
    }
    const key = `${l.kind}|${l.logged_on}|${l.litres}|${l.odometer}`;
    if (seen.has(key)) out.push({ id: l.id, why: 'possível duplicado' });
    seen.add(key);
  }
  return out;
}

/** Próximo vencimento de um prazo anual: o mesmo dia, um ano depois (29 de fevereiro → 28). */
export function nextYear(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const key = `${y + 1}-${String(m).padStart(2, '0')}`;
  return `${key}-${String(Math.min(day, daysInMonth(key))).padStart(2, '0')}`;
}

export const L100 = (v: number | null) => (v === null ? '—' : v.toFixed(1).replace('.', ','));

/** Próximo aniversário de uma data (renovação do seguro): o mesmo dia e mês, hoje ou depois. */
export function anniversary(date: string, today: string): string {
  const md = date.slice(5);
  for (let y = Number(today.slice(0, 4)); ; y++) {
    const key = `${y}-${md.slice(0, 2)}`, d = `${key}-${String(Math.min(Number(md.slice(3)), daysInMonth(key))).padStart(2, '0')}`;
    if (d >= today) return d;
  }
}

/** IUC: paga-se até ao fim do mês da matrícula, todos os anos. O próximo prazo, hoje ou depois. */
export function iucDue(registered: string, today: string): string {
  const m = registered.slice(5, 7);
  for (let y = Number(today.slice(0, 4)); ; y++) {
    const key = `${y}-${m}`, d = `${key}-${daysInMonth(key)}`;
    if (d >= today) return d;
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Um pagamento é do IUC ou do seguro do carro? Pela nota (ex.: «IUC», «Fidelidade», «seguro auto»). */
export function paymentKind(note: string): 'iuc' | 'insurance' | null {
  const n = fold(note);
  if (/\biuc\b|imposto unico|selo do carro/.test(n)) return 'iuc';
  if (/seguro|fidelidade|tranquilidade|allianz|ageas|generali|zurich|liberty|mapfre|logo seguros|caravela|lusitania|una seguros|real vida|ac seguros|verti|n seguros|123 seguro/.test(n)) return 'insurance';
  return null;
}

/** Seguro por ano a partir de um pagamento: de 100 € para cima é anual; abaixo, é a prestação mensal (× 12). */
export const yearlyInsurance = (u: number) => (u >= 100 * 100_000 ? u : u * 12);

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);

/** O custo de andar (combustível, carregamentos, portagens); tudo o resto conta nos fixos. */
export const isRunning = (k: CarLog['kind']) => k === 'fuel' || k === 'charge' || k === 'toll';

/**
 * Os números principais de um carro nos últimos 12 meses (365 dias até hoje):
 * - kmYear: km do ano. Reais se os registos chegam a um ano (com o odómetro de há 365 dias interpolado entre os
 *   registos à volta); senão, estimados pelo ritmo dos registos que há (km por dia × 365, com pelo menos 30 dias).
 * - perKm: o que o carro custou (registos + fixos por ano proporcionais) ÷ km, no período coberto pelos registos.
 * - fixedMonth: custos fixos por mês: seguro, IUC e outros por ano ÷ 12, mais oficina e outras despesas
 *   (tudo menos combustível, carregamentos e portagens) ÷ os meses cobertos (até 12).
 */
export function yearFigures(car: Car, logs: CarLog[], today: string) {
  const cutoff = addDaysIso(today, -365);
  const odo = logs.filter((l) => l.odometer !== null).sort(order);
  let kmYear: { km: number; estimated: boolean } | null = null, from = cutoff;
  if (odo.length >= 2) {
    const last = odo[odo.length - 1];
    const before = [...odo].reverse().find((l) => l.logged_on <= cutoff), after = odo.find((l) => l.logged_on > cutoff);
    if (before && after) {
      const span = days(before.logged_on, after.logged_on) || 1;
      const at = before.odometer! + ((after.odometer! - before.odometer!) * days(before.logged_on, cutoff)) / span;
      kmYear = { km: Math.round(last.odometer! - at), estimated: false };
    } else {
      const first = odo[0], d = days(first.logged_on, last.logged_on);
      from = first.logged_on;
      if (d >= 30) kmYear = { km: Math.round(((last.odometer! - first.odometer!) / d) * 365), estimated: true };
    }
  }
  const start = [from, car.created_at.slice(0, 10)].sort()[1];
  const p = { from: start, to: today, label: '' };
  const inP = logs.filter((l) => l.logged_on >= start && l.logged_on <= today && l.amount !== null);
  const cost = inP.reduce((t, l) => t + Math.round(Number(l.amount) * 100_000), 0) + fixedIn(car, p, today);
  const km = kmIn(logs, p);
  const months = Math.min(12, Math.max(1, days(start, today) / 30.44));
  const yearly = (Number(car.annual_insurance) + Number(car.annual_tax) + Number(car.annual_other)) * 100_000;
  const other = inP.filter((l) => !isRunning(l.kind)).reduce((t, l) => t + Math.round(Number(l.amount) * 100_000), 0);
  return { kmYear, perKm: perKm(cost, km), fixedMonth: Math.round(yearly / 12 + other / months), months, from: start };
}

function addDaysIso(d: string, n: number) { const x = parseDate(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
