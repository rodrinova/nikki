// Contas da NIKKI (regras em docs/CALCULOS.md do repositório thenikki).
// Aritmética exata em inteiros: 1 unidade = 0,00001 € (cêntimos × milésimos da taxa de partilha).
// Arredonda-se só ao mostrar, a 2 casas, meio-par.

import { daysInMonth, monthKey, prevMonth } from './dates';

export type Split = 'mine' | 'shared' | 'other';

export interface Expense {
  id: string;
  paid_by: string;
  other_id: string | null;
  amount: number | string; // numeric(12,2) vem como string ou number do PostgREST
  split: Split;
  payer_share: number | string | null; // parte de quem pagou numa partilhada (0,1 a 0,9)
  spent_on: string; // YYYY-MM-DD
  category: string;
}

export interface Transfer {
  from_id: string;
  to_id: string;
  amount: number | string;
  made_on: string;
}

export const U = 100_000; // unidades por euro

/** Euros (numeric) → unidades inteiras, sem erro de float. */
export const toU = (v: number | string): number => {
  const [i, f = ''] = String(v).trim().split('.');
  const neg = i.startsWith('-');
  const cents = Math.abs(Number(i)) * 100 + Number((f + '00').slice(0, 2));
  return (neg ? -cents : cents) * 1000;
};

const shareM = (s: number | string | null): number => Math.round(Number(s ?? 0) * 1000);

/** Parte de uma despesa que é consumo de `who` (o que gastou, não o que pagou). */
export function partOf(e: Expense, who: string): number {
  const a = toU(e.amount) / 1000; // cêntimos
  if (e.split === 'mine') return e.paid_by === who ? a * 1000 : 0;
  if (e.split === 'other') return e.other_id === who ? a * 1000 : 0;
  const s = shareM(e.payer_share);
  if (e.paid_by === who) return a * s;
  if (e.other_id === who) return a * (1000 - s);
  return 0;
}

/** O que `who` adiantou ao outro com esta despesa (positivo) ou o outro lhe adiantou (negativo). */
export function owedTo(e: Expense, who: string): number {
  if (e.split === 'mine') return 0;
  const a = toU(e.amount) / 1000;
  const owed = e.split === 'other' ? a * 1000 : a * (1000 - shareM(e.payer_share));
  if (e.paid_by === who) return owed;
  if (e.other_id === who) return -owed;
  return 0;
}

/**
 * Contas a dois: quanto `a` adiantou a mais face ao combinado com `b` (positivo = a adiantou mais).
 * Mesmo resultado que a função SQL nikki.pair_balance.
 */
export function pairBalance(expenses: Expense[], transfers: Transfer[], a: string, b: string, opening = { amountA: 0, since: '' }): number {
  let v = toU(opening.amountA);
  for (const e of expenses) {
    if (e.split === 'mine' || e.spent_on < opening.since) continue;
    const pair = (e.paid_by === a && e.other_id === b) || (e.paid_by === b && e.other_id === a);
    if (pair) v += owedTo(e, a);
  }
  for (const t of transfers) {
    if (t.made_on < opening.since) continue;
    if (t.from_id === a && t.to_id === b) v += toU(t.amount);
    else if (t.from_id === b && t.to_id === a) v -= toU(t.amount);
  }
  return v;
}

/** O saldo de abertura do par `a`/`b`, do ponto de vista de `a` (as linhas guardam-se com profile_a < profile_b). */
export function openingOf(rows: { profile_a: string; profile_b: string; cutover: string; amount_a: number | string }[], a: string, b: string) {
  const o = rows.find((r) => (r.profile_a === a && r.profile_b === b) || (r.profile_a === b && r.profile_b === a));
  if (!o) return { amountA: 0, since: '' };
  const v = Number(o.amount_a);
  return { amountA: o.profile_a === a ? v : -v, since: o.cutover };
}

/** Parte de `who` num mês ("YYYY-MM"), total e por categoria. */
export function monthSpend(expenses: Expense[], who: string, key: string) {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    if (monthKey(e.spent_on) !== key) continue;
    const p = partOf(e, who);
    if (!p) continue;
    total += p;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + p);
  }
  return { total, byCat: [...byCat.entries()].sort((x, y) => y[1] - x[1]) };
}

/**
 * Normal de `who`: média dos últimos meses completos (até 6) com dados, desde o primeiro registo.
 * O mês corrente nunca conta. Sem nenhum mês completo, devolve null (a app diz "primeiro mês").
 */
export function normalMonth(expenses: Expense[], who: string, today: string, max = 6): number | null {
  const mine = expenses.filter((e) => partOf(e, who) > 0);
  if (!mine.length) return null;
  const first = mine.reduce((m, e) => (e.spent_on < m ? e.spent_on : m), mine[0].spent_on);
  const months: string[] = [];
  for (let k = prevMonth(monthKey(today)); k >= monthKey(first) && months.length < max; k = prevMonth(k)) months.push(k);
  if (!months.length) return null;
  const sum = months.reduce((t, k) => t + monthSpend(expenses, who, k).total, 0);
  return Math.round(sum / months.length);
}

/** Ritmo do mês: gasto até hoje vs. o habitual até este dia; e o fecho previsto. */
export function pace(spent: number, normal: number | null, today: string) {
  const days = daysInMonth(monthKey(today)), day = Number(today.slice(8, 10));
  if (!normal) return { fresh: true as const, days, day };
  const daily = normal / days;
  return {
    fresh: false as const, days, day,
    pct: Math.round((spent / (daily * day) - 1) * 100), // % acima (+) ou abaixo (−) do ritmo habitual
    forecast: spent + daily * (days - day),
    blocks: Math.round(spent / daily), // dias de um mês normal já gastos
  };
}

/**
 * Fecho do mês anterior: a parte da pessoa, o normal dela até esse mês (sem o contar) e a diferença.
 * Null quando o mês anterior não tem nada dela. O investimento já vem filtrado por quem chama.
 */
export function monthClose(expenses: Expense[], who: string, today: string) {
  const key = prevMonth(monthKey(today));
  const total = monthSpend(expenses, who, key).total;
  if (!total) return null;
  const normal = normalMonth(expenses, who, `${key}-01`);
  return { key, total, normal, pct: normal ? Math.round((total / normal - 1) * 100) : null };
}

/**
 * Contas a dois na cara da NIKKI: quanto crescem os bigodes de quem vê (e encolhem os do outro).
 * Os bigodes de cada lado ficam com o fator 1 + lean (quem vê) e 1 − lean (o outro); 0 = iguais, como no
 * logótipo. Positivo quando quem vê adiantou mais. Cresce depressa no início e cada vez mais devagar:
 * a 150 € já fez 63% do caminho até ao limite de ±0,5, que nunca chega a tocar.
 */
export const WHISKER_SCALE = 15_000_000; // 150 € em unidades
export function whiskerLean(balance: number): number {
  if (Math.abs(balance) < 500) return 0; // menos de meio cêntimo: em equilíbrio
  return Math.sign(balance) * 0.5 * (1 - Math.exp(-Math.abs(balance) / WHISKER_SCALE));
}

/**
 * Quanto está aceso um lado dos bigodes (0 a 1) a meio da animação de a até z, sendo v o valor atual;
 * side +1 é a esquerda (quem vê) e −1 a direita. Ao crescer de 0 até z acende ao mesmo ritmo; ao voltar de
 * a até 0 apaga-se; se fica do mesmo lado, continua aceso.
 */
export function lit(v: number, a: number, z: number, side: 1 | -1): number {
  const sv = v * side, sa = a * side, sz = z * side;
  if (sv <= 0) return 0;
  if (sa > 0 && sz > 0) return 1;
  return Math.min(1, sv / Math.max(sa, sz));
}

/** Meses livres desenhados: 12 meses, cheios até à parte inteira e o seguinte com a fração. */
export const yearFill = (free: number) => Array.from({ length: 12 }, (_, j) => Math.max(0, Math.min(1, free - j)));

/** Arredondamento meio-par a cêntimos, para mostrar. */
export function toCents(u: number): number {
  const sg = u < 0 ? -1 : 1, a = Math.abs(u);
  let c = Math.floor(a / 1000);
  const r = a - c * 1000;
  if (r > 500 || (r === 500 && c % 2 === 1)) c++;
  return sg * c;
}

const grp = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** 1234567 u → "12,35"; com d=0 → "12". */
export function eur(u: number, d: 0 | 2 = 2): string {
  const c = toCents(u), a = Math.abs(c);
  const s = d === 0 ? grp(String(Math.round(a / 100))) : `${grp(String(Math.floor(a / 100)))},${String(a % 100).padStart(2, '0')}`;
  return (c < 0 ? '−' : '') + s;
}

/** "12,35" ou "12.35" → "12.35" (para numeric); null se inválido ou ≤ 0. */
export function parseAmount(s: string): string | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) <= 0) return null;
  const [i, f = ''] = t.split('.');
  return `${Number(i)}.${(f + '00').slice(0, 2)}`;
}

/**
 * A parte de `who` mês a mês nos últimos `n` meses (do mais antigo ao corrente, que vem marcado como em curso) e a média
 * dos meses completos dessa janela, desde o primeiro registo (o mês corrente nunca conta). Sem nenhum mês completo: null.
 */
export function monthlySeries(expenses: Expense[], who: string, today: string, n = 12) {
  const cur = monthKey(today);
  const keys: string[] = [cur];
  while (keys.length < n) keys.unshift(prevMonth(keys[0]));
  const by = new Map<string, number>();
  let first: string | null = null;
  for (const e of expenses) {
    const p = partOf(e, who);
    if (!p) continue;
    const k = monthKey(e.spent_on);
    by.set(k, (by.get(k) ?? 0) + p);
    if (!first || k < first) first = k;
  }
  const months = keys.map((key) => ({ key, total: by.get(key) ?? 0, current: key === cur }));
  const done = months.filter((m) => !m.current && first !== null && m.key >= first);
  return { months, first, avg: done.length ? Math.round(done.reduce((t, m) => t + m.total, 0) / done.length) : null };
}
