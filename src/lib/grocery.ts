// O relatório do supermercado da casa: quanto vai por mês e para onde, e o que se consome de cada produto.
// As faturas lidas são só uma parte das compras (as pequenas quase nunca se juntam), por isso o consumo estima-se:
// o que está nas faturas lidas × (todo o gasto em Supermercado ÷ o gasto com fatura lida), no mesmo período.
// Sem dependências da app: usam-no o ecrã e os testes.
import { addDays, monthKey, parseDate } from './dates';
import { toU } from './money';
import type { Unit } from './pantry';

export interface GExpense { id: string; amount: number | string; spent_on: string; note: string | null; category: string; receipt_read_at?: string | null }
export interface GItem { expense_id: string; product: string; qty: number | string | null; unit: Unit | null; price?: number | string | null; bought_on: string }

export interface GroceryReport {
  from: string; to: string; months: number;
  total: number; perMonth: number; // todo o gasto em Supermercado (unidades) e a média por mês
  covered: number; coverage: number; receipts: number; // o gasto com fatura lida, a fração e quantas faturas
  confidence: 'baixa' | 'media' | 'boa';
  byMonth: { month: string; total: number }[];
  byStore: { store: string; total: number; share: number; visits: number }[];
  products: { product: string; unit: Unit; perMonth: number; spendMonth: number; buys: number }[]; // estimados por mês
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DAY = 86_400_000;
const span = (a: string, b: string) => Math.max(1, Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY) + 1);
/** «Pingo Doce · Golf» → «Pingo Doce»; vazio → «Sem nome». */
export const storeOf = (note: string | null) => {
  const s = (note ?? '').split(' · ')[0].replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sem nome';
};

export function groceryReport(expenses: GExpense[], items: GItem[], today: string, monthsBack = 6): GroceryReport | null {
  const sup = expenses.filter((e) => e.category === 'Supermercado' && e.spent_on <= today && e.spent_on > addDays(today, -Math.round(monthsBack * 30.44)));
  if (!sup.length) return null;
  const from = sup.reduce((m, e) => (e.spent_on < m ? e.spent_on : m), sup[0].spent_on);
  const days = span(from, today), months = Math.max(days / 30.44, 1);
  const total = sup.reduce((t, e) => t + toU(e.amount), 0);
  const ids = new Set(sup.map((e) => e.id));
  const its = items.filter((i) => ids.has(i.expense_id));
  const withItems = new Set(its.map((i) => i.expense_id));
  const read = sup.filter((e) => withItems.has(e.id));
  const covered = read.reduce((t, e) => t + toU(e.amount), 0);
  const coverage = total ? covered / total : 0;
  const factor = covered ? Math.min(total / covered, 5) : 0;
  const confidence: GroceryReport['confidence'] = read.length < 3 || coverage < 0.25 || days < 30 ? 'baixa' : coverage < 0.6 ? 'media' : 'boa';
  // Por mês e por loja (todo o gasto, com ou sem fatura).
  const bm = new Map<string, number>();
  for (const e of sup) bm.set(monthKey(e.spent_on), (bm.get(monthKey(e.spent_on)) ?? 0) + toU(e.amount));
  const bs = new Map<string, { store: string; total: number; visits: number }>();
  for (const e of sup) { const st = storeOf(e.note), k = fold(st); const g = bs.get(k) ?? { store: st, total: 0, visits: 0 }; g.total += toU(e.amount); g.visits++; bs.set(k, g); }
  // Por produto (só o que tem a mesma unidade soma), estimado por mês.
  const bp = new Map<string, { product: string; unit: Unit; qty: number; spend: number; buys: Set<string> }>();
  for (const i of its) {
    if (!i.product?.trim()) continue;
    const k = fold(i.product), unit = (i.unit ?? 'un') as Unit;
    const g = bp.get(k) ?? { product: i.product.trim(), unit, qty: 0, spend: 0, buys: new Set<string>() };
    if (g.unit !== unit) continue;
    g.qty += Number(i.qty) || 1; g.spend += i.price === null || i.price === undefined ? 0 : toU(i.price); g.buys.add(i.expense_id);
    bp.set(k, g);
  }
  const products = [...bp.values()].map((g) => ({
    product: g.product, unit: g.unit, buys: g.buys.size,
    perMonth: Math.round((g.qty * factor / months) * 10) / 10, spendMonth: Math.round(g.spend * factor / months),
  })).sort((a, b) => b.spendMonth - a.spendMonth || b.perMonth - a.perMonth);
  return {
    from, to: today, months: Math.round(months * 10) / 10, total, perMonth: Math.round(total / months), covered, coverage, receipts: read.length, confidence,
    byMonth: [...bm].sort(([a], [b]) => a.localeCompare(b)).map(([month, t]) => ({ month, total: t })),
    byStore: [...bs.values()].sort((a, b) => b.total - a.total).map((g) => ({ ...g, share: total ? g.total / total : 0 })),
    products,
  };
}
