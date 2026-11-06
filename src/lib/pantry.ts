// O que se compra e quando: das linhas das faturas do supermercado (nikki.receipt_items) às sugestões das Compras.
// Para cada produto com pelo menos duas compras em dias diferentes: o intervalo habitual entre compras, o consumo por
// dia e a última compra. Quando já passou quase um intervalo e o produto não está na lista, sugere-se, com a
// quantidade de uma compra habitual (o consumo × o intervalo), arredondada a algo que se compre.
import { parseDate } from './dates';

export type Unit = 'kg' | 'l' | 'un';
export interface Bought { product: string; qty: number | string | null; unit: Unit | null; bought_on: string }
export interface Suggestion { product: string; unit: Unit; qty: number; perMonth: number; lastOn: string; daysSince: number; every: number; due: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);

/** Arredonda a algo que se compre: 0,5 kg ou 0,5 l (até 0,25 abaixo de 1), unidades inteiras. */
export function niceQty(q: number, unit: Unit): number {
  if (unit === 'un') return Math.max(1, Math.round(q));
  if (q < 1) return Math.max(0.25, Math.round(q * 4) / 4);
  return Math.max(0.5, Math.round(q * 2) / 2);
}

export function suggestions(items: Bought[], onList: string[], today: string): Suggestion[] {
  const list = onList.map(fold);
  const by = new Map<string, { name: string; unit: Unit; d: Map<string, number> }>();
  for (const it of items) {
    if (!it.product?.trim()) continue;
    const k = fold(it.product), unit = (it.unit ?? 'un') as Unit;
    const g = by.get(k) ?? { name: it.product.trim(), unit, d: new Map<string, number>() };
    if (g.unit !== unit) continue; // a mesma coisa em unidades diferentes não se soma
    g.d.set(it.bought_on, (g.d.get(it.bought_on) ?? 0) + (Number(it.qty) || 1));
    by.set(k, g);
  }
  const out: Suggestion[] = [];
  for (const [k, g] of by) {
    if (list.some((l) => l.includes(k) || k.includes(l))) continue;
    const ds = [...g.d.keys()].sort();
    if (ds.length < 2) continue;
    const span = days(ds[0], ds[ds.length - 1]);
    if (span < 3) continue;
    const every = span / (ds.length - 1);
    // Consumo: tudo o que se comprou até à última compra (exclusive), espalhado pelo tempo entre a primeira e a última.
    const used = ds.slice(0, -1).reduce((t, d) => t + g.d.get(d)!, 0);
    const perDay = used / span, last = ds[ds.length - 1], since = days(last, today);
    const due = since / every;
    if (due < 0.85) continue;
    out.push({ product: g.name, unit: g.unit, qty: niceQty(perDay * every, g.unit), perMonth: Math.round(perDay * 30 * 10) / 10, lastOn: last, daysSince: since, every: Math.round(every), due });
  }
  return out.sort((a, b) => b.due - a.due);
}

export const qtyText = (q: number, unit: Unit) => (unit === 'un' ? `${q} ${q === 1 ? 'unidade' : 'unidades'}` : `${String(q).replace('.', ',')} ${unit}`);
