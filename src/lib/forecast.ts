// Um passo à frente: o que costuma aparecer e ainda não apareceu.
//   · Mensais: a mesma despesa em pelo menos 3 dos últimos 4 meses completos e nada este mês, já passado o dia
//     habitual (+2 dias). Ex.: «Apple One ainda não apareceu: costuma ser a 5, 30,95 €».
//   · Anuais: uma despesa de 40 € ou mais há cerca de um ano e nada parecido desde então, com o aniversário entre
//     10 dias atrás e 3 semanas à frente. Ex.: «Seguro da casa: no ano passado foram 412 €».
// Só para quem costuma pagar (a última vez), para não aparecer aos dois. Valores em unidades (1 u = 0,00001 €).
import { daysInMonth, monthKey, prevMonth } from './dates';
import { toU, type Expense } from './money';

export interface Past extends Expense { note: string | null }
export interface Expected {
  key: string; kind: 'monthly' | 'yearly'; note: string; category: string; amount: number; day: string; split: Expense['split']; lastOn: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** A «mesma» despesa: as duas primeiras palavras da nota, sem números nem pontuação. */
export const keyOf = (note: string | null) => {
  const w = fold(note ?? '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length > 1);
  return w.slice(0, 2).join(' ');
};
const DAY = 86_400_000;
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export function expected(rows: Past[], who: string, today: string): Expected[] {
  const by = new Map<string, Past[]>();
  for (const e of rows) {
    const k = keyOf(e.note);
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  const cur = monthKey(today), d0 = Number(today.slice(8, 10));
  const last4: string[] = []; for (let k = prevMonth(cur); last4.length < 4; k = prevMonth(k)) last4.push(k);
  const out: Expected[] = [];
  for (const [key, list] of by) {
    const xs = [...list].sort((a, b) => (a.spent_on < b.spent_on ? -1 : 1));
    const last = xs[xs.length - 1];
    if (last.paid_by !== who) continue;
    const months = new Set(xs.map((e) => monthKey(e.spent_on)));
    const monthly = last4.filter((m) => months.has(m)).length >= 3;
    if (monthly) {
      if (months.has(cur)) continue;
      const dim = daysInMonth(cur);
      const typical = Math.min(dim, median(xs.filter((e) => last4.includes(monthKey(e.spent_on))).map((e) => Number(e.spent_on.slice(8, 10)))));
      if (d0 < typical + 2) continue;
      out.push({ key, kind: 'monthly', note: last.note!.trim(), category: last.category, amount: toU(last.amount), day: `${cur}-${String(typical).padStart(2, '0')}`, split: last.split, lastOn: last.spent_on });
      continue;
    }
    // Anual: a última vez foi há 11 a 13 meses e o aniversário cai entre 10 dias atrás e 21 dias à frente.
    if (toU(last.amount) < 4_000_000) continue;
    const ago = diff(last.spent_on, today);
    if (ago < 300) continue;
    const next = `${Number(last.spent_on.slice(0, 4)) + 1}${last.spent_on.slice(4)}`;
    const until = diff(today, next);
    if (until < -10 || until > 21) continue;
    out.push({ key, kind: 'yearly', note: last.note!.trim(), category: last.category, amount: toU(last.amount), day: next, split: last.split, lastOn: last.spent_on });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Quanto costuma estar gasto em cada categoria até hoje (o normal da categoria × a fração do mês). */
export function driver(byCat: [string, number][], normal: Record<string, number>, share: number): string | null {
  let best: string | null = null, top = 0;
  for (const [c, v] of byCat) {
    const over = v - (normal[c] ?? 0) * share;
    if (over > top) { top = over; best = c; }
  }
  const total = byCat.reduce((t, [, v]) => t + v, 0);
  return best && top > total * 0.1 ? best : null;
}

