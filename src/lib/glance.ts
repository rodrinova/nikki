// O mês num relance (NIKKI 2): um calendário com o valor escrito em cada dia (a tua parte, dia a dia) e os dias fora
// do normal anotados com o que os pesou («1 · Renda · 907 €»). E uma frase que explica o mês, escrita dos dados.
// Valores em unidades (1 u = 0,00001 €).
import { addDays, monthKey, parseDate } from './dates';
import { eur, partOf, type Expense } from './money';

export interface GDay { date: string; day: number; total: number; note: string | null; future: boolean; today: boolean }
export interface Glance { lead: number; days: GDay[]; max: number; outliers: GDay[]; sentence: string }

type Exp = Expense & { note: string | null };

export function glance(expenses: Exp[], who: string, key: string, today: string, normalMonth: number | null): Glance {
  const first = `${key}-01`, n = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  const days: GDay[] = [];
  for (let i = 0; i < n; i++) { const d = addDays(first, i); days.push({ date: d, day: i + 1, total: 0, note: null, future: d > today, today: d === today }); }
  const big = new Map<number, number>(); // o maior movimento de cada dia (para a anotação)
  for (const e of expenses) {
    if (monthKey(e.spent_on) !== key) continue;
    const v = partOf(e, who);
    if (!v) continue;
    const g = days[Number(e.spent_on.slice(8, 10)) - 1];
    g.total += v;
    if (v > (big.get(g.day) ?? 0)) { big.set(g.day, v); g.note = (e.note?.trim() || e.category); }
  }
  const max = Math.max(0, ...days.map((d) => d.total));
  const typical = normalMonth ? normalMonth / n : null;
  // Fora do normal: pelo menos 3 vezes um dia típico (ou, sem normal, 3 vezes a média dos dias com gastos) e 20 €.
  const spent = days.filter((d) => d.total > 0);
  const base = typical ?? (spent.length ? spent.reduce((t, d) => t + d.total, 0) / spent.length : 0);
  const outliers = spent.filter((d) => d.total >= 3 * base && d.total >= 2_000_000).sort((a, b) => b.total - a.total).slice(0, 3);
  const past = days.filter((d) => !d.future);
  const zero = past.filter((d) => d.total === 0).length;
  const top = outliers[0] ?? [...spent].sort((a, b) => b.total - a.total)[0];
  const sentence = !spent.length ? 'Ainda sem gastos este mês.'
    : `${top ? `O dia mais pesado foi o ${top.day}${top.note ? ` (${top.note}, ${eur(top.total, 0)} €)` : ` (${eur(top.total, 0)} €)`}.` : ''}${outliers.length > 1 ? ` Mais ${outliers.length - 1} fora do normal.` : ''}${zero ? ` ${zero === 1 ? 'Um dia' : `${zero} dias`} sem gastar nada.` : ''}`;
  const lead = (parseDate(first).getDay() + 6) % 7; // segunda = 0: as casas vazias antes do dia 1
  return { lead, days, max, outliers, sentence };
}

