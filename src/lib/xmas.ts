// Natal: a época (perguntar se uma despesa é de Natal), a cara natalícia, e a ligação entre prendas e despesas.
// Puro (sem React nem Supabase), para se poder testar.

export interface XGift {
  id: string; occasion_id: string; to_name: string; item: string | null; price: number | string | null;
  bought: boolean; expense_id: string | null; secret_for: string | null; created_by: string; created_at: string;
}
export interface XExpense { id: string; amount: number | string; spent_on: string; note: string | null; occasion_id?: string | null }

/** O ano do Natal a que um dia pertence (até 6 de janeiro ainda conta o Natal anterior). */
export const xmasYear = (day: string) => (day.slice(5) <= '01-06' ? Number(day.slice(0, 4)) - 1 : Number(day.slice(0, 4)));

/** A época em que a NIKKI pergunta se uma despesa é de Natal e mostra o cartão: 1 de novembro a 6 de janeiro. */
export const inSeason = (day: string) => day.slice(5) >= '11-01' || day.slice(5) <= '01-06';

/** A cara natalícia (gorro e neve): de 22 de novembro a 6 de janeiro. */
export const festive = (day: string) => day.slice(5) >= '11-22' || day.slice(5) <= '01-06';

const GIFT = /\b(prendas?|presentes?|natal|oferta|ofertas|pai natal|amigo secreto|bolo[- ]rei|presépio|árvore de natal|arvore de natal)\b/i;
/** Uma despesa que soa a Natal («prenda da mãe», «presente Inês», «árvore de Natal»…). */
export const soundsXmas = (text: string) => GIFT.test(text);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cents = (v: number | string) => Math.round(Number(v) * 100);

/**
 * A despesa (já registada) que bate certo com uma prenda comprada: o mesmo valor (até 50 cêntimos), na época do
 * Natal desse ano, ainda sem prenda ligada. Primeiro as que já são de Natal ou falam da pessoa ou da prenda.
 */
export function matchExpense(g: Pick<XGift, 'to_name' | 'item' | 'price'>, expenses: XExpense[], year: number, linked: Set<string>): XExpense | null {
  if (g.price === null || g.price === '' || !Number(g.price)) return null;
  const from = `${year}-10-01`, to = `${year + 1}-01-06`;
  const words = [g.to_name, g.item ?? ''].flatMap((t) => norm(t).split(/\s+/)).filter((w) => w.length >= 3);
  const score = (e: XExpense) => (e.occasion_id ? 2 : 0) + (words.some((w) => norm(e.note ?? '').includes(w)) ? 2 : 0) + (soundsXmas(e.note ?? '') ? 1 : 0);
  const c = expenses
    .filter((e) => !linked.has(e.id) && e.spent_on >= from && e.spent_on <= to && Math.abs(cents(e.amount) - cents(g.price!)) <= 50)
    .sort((a, b) => score(b) - score(a) || (a.spent_on < b.spent_on ? 1 : -1));
  return c[0] ?? null;
}

/** As prendas dos anos anteriores para a mesma pessoa (pelo nome), da mais recente para a mais antiga. */
export function pastFor(name: string, gifts: XGift[], yearOf: (occ: string) => number | null, year: number) {
  const n = norm(name.trim());
  return gifts
    .filter((g) => norm(g.to_name.trim()) === n && (yearOf(g.occasion_id) ?? year) < year && (g.item || g.price))
    .map((g) => ({ year: yearOf(g.occasion_id)!, item: g.item, price: g.price === null ? null : Number(g.price) }))
    .sort((a, b) => b.year - a.year);
}

/** O total de Natal visível para toda a casa: as prendas que não são secretas (as secretas nunca entram). */
export function publicTotal(gifts: XGift[]) {
  return gifts.filter((g) => !g.secret_for && g.price !== null).reduce((t, g) => t + Number(g.price), 0);
}

/**
 * Inflação em Portugal (IPC, taxa de variação média anual, INE), em %. O ano corrente usa a do último ano
 * conhecido até sair a oficial. Atualiza-se uma vez por ano.
 */
export const CPI: Record<number, number> = { 2015: 0.5, 2016: 0.6, 2017: 1.4, 2018: 1.0, 2019: 0.3, 2020: 0, 2021: 1.3, 2022: 7.8, 2023: 4.3, 2024: 2.4, 2025: 2.3 };
const lastCpi = () => CPI[Math.max(...Object.keys(CPI).map(Number))];

/** Um valor de um Natal passado em preços de outro ano (multiplica pela inflação de cada ano pelo meio). */
export function inflate(v: number, from: number, to: number) {
  let x = v;
  for (let y = from + 1; y <= to; y++) x *= 1 + (CPI[y] ?? lastCpi()) / 100;
  return x;
}

/**
 * Por pessoa: a média do que se gastou por prenda nos anos anteriores (já em preços de hoje) e a deste ano, só com as
 * prendas compradas e com preço. As secretas (entre os da casa) nunca entram.
 */
export function perPerson(gifts: XGift[], yearOf: (occ: string) => number | null, year: number) {
  const priced = gifts.filter((g) => !g.secret_for && g.price !== null && Number(g.price) > 0);
  const past = priced.filter((g) => (yearOf(g.occasion_id) ?? year) < year);
  const now = priced.filter((g) => yearOf(g.occasion_id) === year && g.bought);
  const years = [...new Set(past.map((g) => yearOf(g.occasion_id)!))].sort();
  const byYear = years.map((y) => { const l = past.filter((g) => yearOf(g.occasion_id) === y); const t = l.reduce((s, g) => s + Number(g.price), 0); return { year: y, n: l.length, total: t, avg: t / l.length }; });
  const ref = past.length ? past.reduce((s, g) => s + inflate(Number(g.price), yearOf(g.occasion_id)!, year), 0) / past.length : null;
  const cur = now.length ? now.reduce((s, g) => s + Number(g.price), 0) / now.length : null;
  return { ref, cur, n: now.length, byYear, diff: ref && cur ? Math.round((cur / ref - 1) * 100) : null };
}
