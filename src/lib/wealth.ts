// Património e saúde financeira da família (regras em docs/CALCULOS.md do repositório thenikki, secção 6).
// Valores em unidades de money.ts (1 u = 0,00001 €); arredonda-se só ao mostrar.
// A pergunta de fundo: quantos meses a família vive do que tem e do que os investimentos rendem.

import { daysInMonth, monthKey, nextMonth, prevMonth } from './dates';
import { U } from './money';

export type AssetKind = 'ordem' | 'remunerada' | 'prazo' | 'aforro' | 'monetario' | 'obrigacoes' | 'fundos' | 'etf' | 'acoes' | 'cripto' | 'ppr' | 'imovel' | 'outro' | 'casa' | 'carro';
/** now: no próprio dia, sem risco · days: em dias, sem risco de mercado · market: pode valer menos e demora a vender · locked: preso · out: fora das contas */
export type Liquidity = 'now' | 'days' | 'market' | 'locked' | 'out';
export type FundRole = 'emergency' | 'cushion';

export const KINDS: Record<AssetKind, { name: string; liq: Liquidity }> = {
  ordem: { name: 'Conta à ordem', liq: 'now' },
  remunerada: { name: 'Conta à ordem remunerada', liq: 'now' },
  prazo: { name: 'Depósito a prazo', liq: 'days' },
  aforro: { name: 'Certificados de Aforro', liq: 'days' },
  monetario: { name: 'Fundo monetário', liq: 'days' },
  obrigacoes: { name: 'Obrigações', liq: 'market' },
  fundos: { name: 'Fundos de investimento', liq: 'market' },
  etf: { name: 'ETF', liq: 'market' },
  acoes: { name: 'Ações', liq: 'market' },
  cripto: { name: 'Cripto', liq: 'market' },
  ppr: { name: 'PPR', liq: 'locked' },
  imovel: { name: 'Imóvel arrendado', liq: 'locked' },
  outro: { name: 'Outro', liq: 'locked' },
  casa: { name: 'Casa própria', liq: 'out' },
  carro: { name: 'Carro', liq: 'out' },
};
export const liqOf = (k: string): Liquidity => KINDS[k as AssetKind]?.liq ?? 'locked';

export const CUSHION_MIN = 2_000 * U; // fundo de maneio: pelo menos 2 000 € por adulto
export const CUSHION_PER_CHILD = 500 * U; // e mais 500 € por cada filho
/** Meta do fundo para imprevistos: 2 000 € por adulto + 500 € por filho (a parte `kidShare` dos filhos, na vista de uma pessoa). */
export const cushionMin = (children = 0, adults = 1, kidShare = 1) =>
  Math.round(Math.max(1, Math.floor(adults || 1)) * CUSHION_MIN + Math.max(0, Math.floor(children || 0)) * CUSHION_PER_CHILD * kidShare);
export const EMERGENCY_MONTHS = 12; // fundo de emergência: 12 meses da despesa média
export const INFLATION = 2; // % ao ano, para o retorno real

/**
 * Pode este ativo ser o fundo de emergência ou o de maneio? Decide-se pelo tipo, sem perguntar.
 * Maneio: só o que está disponível no próprio dia. Emergência: o que se resgata em dias sem risco de mercado.
 */
export function fundCheck(kind: string, role: FundRole): { ok: true } | { ok: false; why: string } {
  const liq = liqOf(kind);
  if (liq === 'now' || (liq === 'days' && role === 'emergency')) return { ok: true };
  if (liq === 'days') return { ok: false, why: 'demora dias a ficar disponível; um imprevisto paga-se no próprio dia' };
  if (liq === 'market') return { ok: false, why: role === 'cushion' ? 'pode valer menos no dia em que precisares e demora dias a vender' : 'pode valer menos precisamente quando for preciso (numa crise, por exemplo)' };
  return { ok: false, why: 'não se resgata depressa nem sem perdas' };
}

/** Onde guardar cada fundo (o que a NIKKI sugere). */
export const WHERE: Record<FundRole, string> = {
  emergency: 'numa conta à ordem remunerada ou em Certificados de Aforro',
  cushion: 'numa conta à ordem remunerada, disponível no próprio dia',
};

/** Retorno real anual (fração) a partir do retorno estimado em %, descontada a inflação. */
export const realReturn = (pct: number, inflation = INFLATION) => (1 + pct / 100) / (1 + inflation / 100) - 1;

/**
 * Despesa média mensal: média dos meses completos (até `max`) desde o primeiro mês com despesas; o mês corrente
 * nunca conta e um mês sem nada no meio conta como 0. Null sem nenhum mês completo.
 */
export function avgMonthly(totals: { month: string; total: number }[], today: string, max = 12): { avg: number; months: number } | null {
  const by = new Map(totals.filter((t) => t.total > 0).map((t) => [t.month, t.total]));
  if (!by.size) return null;
  const first = [...by.keys()].sort()[0];
  let sum = 0, n = 0;
  for (let k = prevMonth(monthKey(today)); k >= first && n < max; k = prevMonth(k)) { sum += by.get(k) ?? 0; n++; }
  return n ? { avg: Math.round(sum / n), months: n } : null;
}

/** Rendimento médio por mês: cada pagamento × vezes por ano ÷ 12 (o salário em Portugal paga-se 14 vezes). */
export const monthlyIncome = (rows: { amount: number; times_per_year: number }[]) =>
  Math.round(rows.reduce((t, r) => t + (r.amount * r.times_per_year) / 12, 0));

/**
 * Cada fonte de rendimento é «fixa» (valor × vezes por ano ÷ 12) ou «pelos registos» (as entradas que se vão
 * registando). Pelos registos, o habitual é a média dos últimos 12 meses completos (o mês corrente não conta), a
 * contar só desde o mês da primeira entrada; com entradas só no mês corrente, conta o que já entrou.
 */
export interface IncomeSrc { id: string; mode: 'fixed' | 'log'; amount: number | null; times_per_year: number }
export interface IncomeEntry { id?: string; income_id: string; received_on: string; amount: number }
export function sourceMonthly(src: IncomeSrc, entries: IncomeEntry[], today: string): number {
  if (src.mode === 'fixed') return Math.round(((src.amount ?? 0) * src.times_per_year) / 12);
  const mine = entries.filter((e) => e.income_id === src.id);
  if (!mine.length) return 0;
  const by = new Map<string, number>();
  for (const e of mine) by.set(monthKey(e.received_on), (by.get(monthKey(e.received_on)) ?? 0) + e.amount);
  const first = [...by.keys()].sort()[0], cur = monthKey(today);
  let sum = 0, n = 0;
  for (let k = prevMonth(cur); k >= first && n < 12; k = prevMonth(k)) { sum += by.get(k) ?? 0; n++; }
  return n ? Math.round(sum / n) : by.get(cur) ?? 0;
}
export const incomeMonthly = (srcs: IncomeSrc[], entries: IncomeEntry[], today: string) => srcs.reduce((t, s) => t + sourceMonthly(s, entries, today), 0);

/** As entradas por mês, do mais recente para o mais antigo, com o total de cada mês. */
export function entriesByMonth<T extends IncomeEntry>(entries: T[]): { month: string; total: number; items: T[] }[] {
  const by = new Map<string, T[]>();
  for (const e of entries) { const k = monthKey(e.received_on); by.set(k, [...(by.get(k) ?? []), e]); }
  return [...by].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, total: items.reduce((t, e) => t + e.amount, 0), items: items.sort((a, b) => b.received_on.localeCompare(a.received_on)) }));
}

/**
 * Os dois fundos, com o excedente do de emergência a passar para o de imprevistos (o fundo de maneio): o fundo de
 * emergência enche primeiro com o que demora dias a levantar (Certificados de Aforro, prazos), depois com o que está
 * disponível no próprio dia; o que passar da meta e estiver disponível no próprio dia conta no fundo de maneio.
 * Sem meta (ainda sem despesa média), não há excedente.
 */
export function splitFunds(em: { value: number; liq: Liquidity }[], cu: { value: number }[], target: number | null) {
  const days = em.filter((a) => a.liq !== 'now').reduce((t, a) => t + a.value, 0);
  const now = em.filter((a) => a.liq === 'now').reduce((t, a) => t + a.value, 0);
  const total = days + now, own = cu.reduce((t, a) => t + a.value, 0);
  if (target === null) return { emergency: total, cushion: own, overflow: 0 };
  const overflow = Math.max(0, now - Math.max(0, target - days));
  return { emergency: Math.min(total, target), cushion: own + overflow, overflow };
}

/** Meses livres: quantos meses do ano o rendimento real dos investimentos paga a despesa média. */
export function freeMonths(pools: { value: number; real: number; liq: Liquidity }[], spend: number): number {
  if (spend <= 0) return 0;
  const yearly = pools.filter((p) => p.liq !== 'out').reduce((t, p) => t + p.value * p.real, 0);
  return Math.max(0, yearly / spend);
}

/**
 * Férias pagas: os meses livres contados como férias a partir de 1 de janeiro, mês a mês do calendário
 * (5 meses livres = de janeiro a maio; 1,4 = até 11 de fevereiro). until: o último dia de férias desse ano,
 * null se não chega a um dia; monthEnd: acaba no fim de um mês; whole: o ano inteiro.
 */
export function vacationUntil(fm: number, year: number): { until: string | null; monthEnd: boolean; whole: boolean } {
  if (fm >= 12) return { until: `${year}-12-31`, monthEnd: true, whole: true };
  const n = Math.floor(Math.max(0, fm) + 1e-9), r = Math.max(0, fm) - n;
  const key = (m: number) => `${year}-${String(m).padStart(2, '0')}`;
  const d = Math.floor(r * daysInMonth(key(n + 1)) + 1e-9);
  if (d >= 1) return { until: `${key(n + 1)}-${String(d).padStart(2, '0')}`, monthEnd: false, whole: false };
  if (n >= 1) return { until: `${key(n)}-${daysInMonth(key(n))}`, monthEnd: true, whole: false };
  return { until: null, monthEnd: false, whole: false };
}

/** O que sobra num mês: rendimento médio − despesa média. Taxa de poupança: a parte do rendimento que fica. */
export function savings(income: number, spend: number) {
  return { surplus: income - spend, rate: income > 0 ? (income - spend) / income : null };
}

/**
 * Plano do mês: o que sobra vai primeiro para o fundo de emergência até ficar completo; o excedente para o fundo
 * de maneio; com os dois completos, investe-se.
 */
export function monthPlan(surplus: number, emergencyGap: number, cushionGap: number) {
  let s = Math.max(0, surplus);
  const emergency = Math.min(s, Math.max(0, emergencyGap)); s -= emergency;
  const cushion = Math.min(s, Math.max(0, cushionGap)); s -= cushion;
  return { emergency, cushion, invest: s };
}

/** cushionTarget: 2 000 € para a casa; na vista de uma pessoa, a parte dela. */
export interface ScoreIn { emergency: number; emergencyTarget: number | null; cushion: number; cushionTarget?: number; savingsRate: number | null; freeMonths: number }
export const LEVELS: [number, string][] = [[0, 'Frágil'], [40, 'A construir'], [70, 'Sólida'], [90, 'Folgada']];

/**
 * Saúde financeira, 0 a 100: fundo de emergência 35, fundo de maneio 15, poupança 20 (cheia a partir de 20% do que
 * entra) e meses livres 30 (raiz de meses/12: o primeiro mês livre conta mais do que o décimo). O que falta
 * indicar conta 0. O total é a soma das partes arredondadas, para a conta bater no ecrã.
 */
export function healthScore(x: ScoreIn) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const parts = [
    { k: 'emergency', label: 'Fundo de emergência', max: 35, f: x.emergencyTarget ? clamp(x.emergency / x.emergencyTarget) : 0, known: x.emergencyTarget !== null },
    { k: 'cushion', label: 'Fundo para imprevistos', max: 15, f: clamp(x.cushion / (x.cushionTarget ?? CUSHION_MIN)), known: true },
    { k: 'savings', label: 'Poupança', max: 20, f: x.savingsRate === null ? 0 : clamp(x.savingsRate / 0.2), known: x.savingsRate !== null },
    { k: 'free', label: 'Meses livres', max: 30, f: Math.sqrt(clamp(x.freeMonths / 12)), known: true },
  ].map((p) => ({ ...p, pts: Math.round(p.max * p.f) }));
  const total = parts.reduce((t, p) => t + p.pts, 0);
  const li = LEVELS.reduce((a, [min], j) => (total >= min ? j : a), 0);
  const next = LEVELS[li + 1] ? { name: LEVELS[li + 1][1], need: LEVELS[li + 1][0] - total } : null;
  return { total, parts, level: LEVELS[li][1], levelIndex: li, next };
}

/**
 * Conquistas: só objetivos inteiros (o fundo de emergência completo, não meio fundo), cada um com o caminho já
 * feito (p, de 0 a 1). As etapas pelo caminho são marcos: dão os parabéns, mas não são conquistas.
 */
export function badges(x: ScoreIn) {
  const e = x.emergencyTarget ? x.emergency / x.emergencyTarget : 0;
  const c = x.cushion / (x.cushionTarget ?? CUSHION_MIN), s = (x.savingsRate ?? 0) / 0.2;
  const list = [
    { k: 'cushion', label: 'Fundo para imprevistos', p: c },
    { k: 'emergency', label: 'Fundo de emergência', p: e },
    { k: 'save20', label: 'Poupar 20%', p: s },
    { k: 'free12', label: 'Um ano livre', p: x.freeMonths / 12 },
  ];
  return list.map((b) => ({ ...b, p: Math.max(0, Math.min(1, b.p)), got: b.p >= 1 }));
}

/** Marcos a caminho de uma conquista (fração do caminho). */
export const MILESTONES: Record<string, { at: number; label: string }[]> = {
  emergency: [{ at: 0.5, label: 'meio fundo de emergência' }],
  free12: [{ at: 1 / 12, label: 'o primeiro mês livre' }, { at: 3 / 12, label: 'três meses livres' }, { at: 6 / 12, label: 'meio ano livre' }],
};

/**
 * O que celebrar desde a última visita. Uma conquista acabada de ganhar celebra-se, e só ela: os marcos passados
 * no mesmo salto não. Um marco celebra-se se a conquista não ficar feita no mês a seguir (monthsLeft ≤ 1: se o
 * fundo vai de 0 a 100 num mês, não se festeja o meio); se passou vários, só o mais alto, e só um de cada vez
 * (o da primeira conquista da lista). Na primeira visita, ou para uma conquista que ainda não se via, não se
 * celebra nada.
 */
export function celebrate(prev: Record<string, number> | null, cur: { k: string; p: number; got: boolean }[], monthsLeft: Record<string, number | null> = {}) {
  const none = { won: [] as string[], milestone: null as { k: string; at: number; label: string } | null };
  if (!prev) return none;
  for (const b of cur) {
    const was = prev[b.k];
    if (was === undefined) continue;
    if (b.got) { if (was < 1) none.won.push(b.k); continue; }
    const left = monthsLeft[b.k];
    if (left != null && left <= 1) continue;
    if (none.milestone) continue;
    for (const m of MILESTONES[b.k] ?? []) if (was < m.at && b.p >= m.at) none.milestone = { k: b.k, ...m };
  }
  return none;
}

/** A próxima conquista: a que está mais perto, das que faltam. */
export const nextBadge = (list: ReturnType<typeof badges>) =>
  list.filter((b) => !b.got).reduce<ReturnType<typeof badges>[number] | null>((a, b) => (!a || b.p > a.p ? b : a), null);

/** Último dia do mês daqui a n meses ("YYYY-MM-DD"). */
export function monthsAhead(today: string, n: number): string {
  let k = monthKey(today);
  for (let j = 0; j < n; j++) k = nextMonth(k);
  return `${k}-${String(daysInMonth(k)).padStart(2, '0')}`;
}

export interface GoalSuggestion { title: string; metric: string; target: number; due: string }

/**
 * Objetivo sugerido quando a saúde financeira ainda não é Sólida: o primeiro passo que falta, com um prazo
 * feito com a sobra do mês (sem sobra conhecida: 24 meses para a emergência, 6 para o resto).
 */
export function suggestGoal(x: ScoreIn & { plan: ReturnType<typeof monthPlan> }, score: number, today: string): GoalSuggestion | null {
  if (score >= 70) return null;
  const by = (gap: number, perMonth: number, fallback: number) => monthsAhead(today, perMonth > 0 ? Math.max(1, Math.ceil(gap / perMonth)) : fallback);
  if (x.emergencyTarget && x.emergency < x.emergencyTarget)
    return { title: 'Fundo de emergência completo', metric: 'fund:emergency', target: x.emergencyTarget, due: by(x.emergencyTarget - x.emergency, x.plan.emergency, 24) };
  const ct = x.cushionTarget ?? CUSHION_MIN;
  if (x.cushion < ct)
    return { title: 'Fundo para imprevistos completo', metric: 'fund:cushion', target: ct, due: by(ct - x.cushion, x.plan.cushion, 6) };
  if (x.savingsRate !== null && x.savingsRate < 0.2) return { title: 'Poupar 20% do que entra', metric: 'savings_rate', target: 20, due: monthsAhead(today, 6) };
  return { title: `Chegar a ${Math.floor(x.freeMonths) + 1} meses livres`, metric: 'free_months', target: Math.floor(x.freeMonths) + 1, due: monthsAhead(today, 24) };
}

export interface SeriesAsset { id: string; part: number; archived: boolean }
export interface SeriesSnap { asset_id: string; on_date: string; value: number }

/**
 * Evolução do património: um ponto por cada dia com um valor registado. Em cada dia, cada ativo vale o último valor
 * registado até aí (vezes a parte de quem vê). Um ativo retirado do património conta até ao último valor registado.
 */
export function netSeries(assets: SeriesAsset[], snaps: SeriesSnap[]): { on: string; v: number }[] {
  const by = new Map(assets.filter((a) => a.part > 0).map((a) => [a.id, a]));
  const rows = snaps.filter((s) => by.has(s.asset_id)).sort((a, b) => (a.on_date < b.on_date ? -1 : a.on_date > b.on_date ? 1 : 0));
  const lastOn = new Map<string, string>();
  for (const s of rows) lastOn.set(s.asset_id, s.on_date);
  const cur = new Map<string, number>();
  const out: { on: string; v: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    cur.set(s.asset_id, s.value);
    if (rows[i + 1]?.on_date === s.on_date) continue;
    let v = 0;
    for (const [id, val] of cur) {
      const a = by.get(id)!;
      if (a.archived && lastOn.get(id)! < s.on_date) continue;
      v += val * a.part;
    }
    out.push({ on: s.on_date, v: Math.round(v) });
  }
  return out;
}
