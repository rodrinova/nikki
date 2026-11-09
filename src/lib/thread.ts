// O fio do tempo (NIKKI 2): o mesmo tempo visto a quatro escalas, com o «agora» no meio. Para trás, o que se gastou
// e o que aconteceu; para a frente, o que está marcado e os «fantasmas» (o que costuma vir: lib/forecast.ts e prazos).
//   0 Dia     · as horas de hoje (06–23), com o que está marcado
//   1 Semana  · os dias, de há 7 dias a daqui a 7
//   2 Mês     · as semanas (segunda a domingo), de há 8 a daqui a 4
//   3 Ano     · os meses, de há 11 a daqui a 2
import { addDays, monthKey, monthName, nextMonth, parseDate, prevMonth } from './dates';
import { partOf, type Expense } from './money';

export type Level = 0 | 1 | 2 | 3;
export const LEVELS = ['Dia', 'Semana', 'Mês', 'Ano'] as const;
export interface TItem { day: string; time: string | null; title: string; kind: string }
export interface Ghost { day: string; title: string; amount?: number }
export interface Bucket {
  key: string; label: string; sub: string; spend: number; items: TItem[]; ghosts: Ghost[];
  now: boolean; future: boolean;
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const mondayOf = (d: string) => addDays(d, -((parseDate(d).getDay() + 6) % 7));
const dm = (d: string) => `${Number(d.slice(8, 10))}`;

export function buckets(level: Level, today: string, hour: number, x: { expenses: Expense[]; who: string; items: TItem[]; ghosts: Ghost[] }): Bucket[] {
  const spendIn = (a: string, b: string) => x.expenses.reduce((t, e) => (e.spent_on >= a && e.spent_on <= b ? t + partOf(e, x.who) : t), 0);
  const itemsIn = (a: string, b: string) => x.items.filter((i) => i.day >= a && i.day <= b);
  const ghostsIn = (a: string, b: string) => x.ghosts.filter((g) => g.day >= a && g.day <= b);
  const out: Bucket[] = [];
  if (level === 0) {
    const its = x.items.filter((i) => i.day === today);
    for (let h = 6; h <= 23; h++) {
      const hh = String(h).padStart(2, '0');
      out.push({ key: hh, label: `${hh}:00`, sub: '', spend: 0, items: its.filter((i) => i.time && Number(i.time.slice(0, 2)) === h), ghosts: [], now: h === hour, future: h > hour });
    }
    // O que é do dia inteiro fica na primeira hora.
    out[0].items.unshift(...its.filter((i) => !i.time));
    return out;
  }
  if (level === 1) {
    for (let k = -7; k <= 7; k++) {
      const d = addDays(today, k), wd = parseDate(d).getDay();
      out.push({ key: d, label: k === 0 ? 'Hoje' : k === -1 ? 'Ontem' : k === 1 ? 'Amanhã' : `${WD[wd]} ${dm(d)}`, sub: k === 0 || Math.abs(k) === 1 ? `${WD[wd]} ${dm(d)}` : '', spend: spendIn(d, d), items: itemsIn(d, d), ghosts: ghostsIn(d, d), now: k === 0, future: k > 0 });
    }
    return out;
  }
  if (level === 2) {
    const m0 = mondayOf(today);
    for (let k = -8; k <= 4; k++) {
      const a = addDays(m0, 7 * k), b = addDays(a, 6);
      out.push({ key: a, label: k === 0 ? 'Esta semana' : k === -1 ? 'A passada' : k === 1 ? 'A próxima' : `${dm(a)}–${dm(b)}`, sub: monthKey(a) === monthKey(b) ? monthName(monthKey(a)).slice(0, 3) : `${monthName(monthKey(a)).slice(0, 3)}/${monthName(monthKey(b)).slice(0, 3)}`, spend: spendIn(a, b), items: itemsIn(a, b), ghosts: ghostsIn(a, b), now: k === 0, future: k > 0 });
    }
    return out;
  }
  let k0 = monthKey(today);
  for (let k = 0; k < 11; k++) k0 = prevMonth(k0);
  for (let k = -11, mk = k0; k <= 2; k++, mk = nextMonth(mk)) {
    const a = `${mk}-01`, b = `${mk}-31`;
    out.push({ key: mk, label: monthName(mk), sub: mk.slice(0, 4), spend: spendIn(a, b), items: itemsIn(a, b), ghosts: ghostsIn(a, b), now: k === 0, future: k > 0 });
  }
  return out;
}

/** O cartaz de um mês: o que se gastou em cada dia, por categoria (a tua parte), para desenhar em lâminas. */
export interface PrintDay { day: number; total: number; cats: [string, number][] }
export function monthPrint(expenses: Expense[], who: string, key: string): { days: PrintDay[]; max: number; total: number; top: string[] } {
  const days: PrintDay[] = [];
  const byCat = new Map<string, number>();
  const last = Number(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate());
  for (let d = 1; d <= last; d++) days.push({ day: d, total: 0, cats: [] });
  for (const e of expenses) {
    if (monthKey(e.spent_on) !== key) continue;
    const v = partOf(e, who);
    if (!v) continue;
    const p = days[Number(e.spent_on.slice(8, 10)) - 1];
    p.total += v;
    const c = p.cats.find((x) => x[0] === e.category);
    if (c) c[1] += v; else p.cats.push([e.category, v]);
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + v);
  }
  for (const p of days) p.cats.sort((a, b) => b[1] - a[1]);
  const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  return { days, max: Math.max(0, ...days.map((p) => p.total)), total: days.reduce((t, p) => t + p.total, 0), top };
}
