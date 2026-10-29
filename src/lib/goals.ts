// Objetivos: limites por categoria (por mês), saúde financeira (os do Património) e hábitos da casa (baixar o
// consumo de uma conta, baixar os L/100 km de um carro). Cada um mede-se com os números que já estão na NIKKI.
// Regras em docs/CALCULOS.md, secção 13. Puro.

import { addDays, daysInMonth, monthKey, prevMonth } from './dates';
import { monthSpend, toU, type Expense } from './money';
import { spread, type BillPayment } from './home';
import { consumption, type CarLog } from './garage';

export type GoalKind = 'cap' | 'health' | 'usage' | 'car' | 'body';
export const goalKind = (metric: string): GoalKind =>
  metric.startsWith('category_cap:') ? 'cap' : metric.startsWith('usage:') ? 'usage' : metric.startsWith('car_l100:') ? 'car' : metric.startsWith('gym:') ? 'body' : 'health';
export const metricRef = (metric: string) => metric.slice(metric.indexOf(':') + 1);

export type GoalState = 'ok' | 'risk' | 'over' | 'done' | 'wait';
export interface Progress { pct: number; state: GoalState; label: string; detail: string }

const eur0 = (u: number) => `${Math.round(u / 100_000).toLocaleString('pt-PT').replace(/\s/g, ' ')} €`;
const dec1 = (v: number) => v.toFixed(1).replace('.', ',');

// ───────────── limite por categoria ─────────────

/** O que conta num limite: o meu é a minha parte nessa categoria; o da casa é o valor inteiro das partilhadas. */
export function capSpent(expenses: Expense[], cat: string, owner: string | null, me: string, key: string): number {
  if (owner) return monthSpend(expenses.filter((e) => e.category === cat), me, key).total;
  return expenses.filter((e) => e.category === cat && e.split === 'shared' && monthKey(e.spent_on) === key).reduce((t, e) => t + toU(e.amount), 0);
}

/** Como vai o mês: «risco» quando o gasto passa 10% do ritmo do limite (limite × dia ÷ dias do mês). */
export function capProgress(spent: number, cap: number, today: string): Progress {
  const key = monthKey(today), frac = Number(today.slice(8, 10)) / daysInMonth(key);
  const state: GoalState = spent > cap ? 'over' : spent > cap * frac * 1.1 && frac < 1 ? 'risk' : 'ok';
  const left = cap - spent;
  return {
    pct: cap > 0 ? Math.min(1, spent / cap) : 0, state,
    label: `${eur0(spent)} de ${eur0(cap)}`,
    detail: state === 'over' ? `Passou ${eur0(-left)} este mês.` : state === 'risk' ? `Acima do ritmo: ficam ${eur0(left)} para o resto do mês.` : `Ficam ${eur0(left)} este mês.`,
  };
}

/** Meses seguidos dentro do limite, a contar do mês passado para trás (desde que o objetivo existe). */
export function capStreak(expenses: Expense[], cat: string, owner: string | null, me: string, cap: number, today: string, since: string): number {
  let n = 0;
  for (let k = prevMonth(monthKey(today)); k >= monthKey(since); k = prevMonth(k)) {
    if (capSpent(expenses, cat, owner, me, k) > cap) break;
    n++;
  }
  return n;
}

// ───────────── consumo de uma conta (água, luz, gás) ─────────────

/** Consumo dos últimos 3 meses completos face aos mesmos meses do ano anterior (null sem faturas dos dois). */
export function usageChange(payments: BillPayment[], today: string): { recent: number; before: number; change: number } | null {
  const m = spread(payments);
  let k = prevMonth(monthKey(today)), recent = 0, before = 0;
  for (let j = 0; j < 3; j++) {
    const a = m.get(k), y = `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`, b = m.get(y);
    if (!a?.hasUsage || !b?.hasUsage) return null;
    recent += a.usage; before += b.usage; k = prevMonth(k);
  }
  return before > 0 ? { recent, before, change: recent / before - 1 } : null;
}

/** Baixar o consumo X%: quanto já baixou face ao ano anterior. */
export function usageProgress(payments: BillPayment[], targetPct: number, today: string): Progress {
  const u = usageChange(payments, today);
  if (!u) return { pct: 0, state: 'wait', label: '—', detail: 'Faltam faturas com consumo (destes 3 meses e dos mesmos do ano passado).' };
  const down = Math.round(-u.change * 1000) / 10; // em %, com uma casa (sem restos de vírgula flutuante)
  const state: GoalState = down >= targetPct ? 'done' : down <= 0 ? 'risk' : 'ok';
  return {
    pct: Math.max(0, Math.min(1, down / targetPct)), state,
    label: down >= 0 ? `−${Math.round(down)}% de ${targetPct}%` : `+${Math.round(-down)}%`,
    detail: down >= 0 ? `Últimos 3 meses: ${Math.round(down)}% abaixo do ano passado.` : `Últimos 3 meses: ${Math.round(-down)}% acima do ano passado.`,
  };
}

// ───────────── consumo do carro ─────────────

/** L/100 km dos últimos 3 meses (troços de cheio a cheio que acabam neste período). */
export const carRecent = (logs: CarLog[], today: string) => consumption(logs, { from: addDays(today, -91), to: today, label: '3 meses' }).avg;

/** Baixar para X L/100 km: do ponto de partida até ao alvo. */
export function carProgress(logs: CarLog[], target: number, start: number | null, today: string): Progress {
  const now = carRecent(logs, today);
  if (now === null) return { pct: 0, state: 'wait', label: '—', detail: 'Faltam abastecimentos de cheio a cheio com km nos últimos 3 meses.' };
  const from = start ?? now;
  const pct = now <= target ? 1 : from > target ? Math.max(0, Math.min(1, (from - now) / (from - target))) : 0;
  return { pct, state: now <= target ? 'done' : now > from ? 'risk' : 'ok', label: `${dec1(now)} de ${dec1(target)}`, detail: `Últimos 3 meses: ${dec1(now)} L/100 km${start ? ` (começou em ${dec1(start)})` : ''}.` };
}

// ───────────── sugestões ─────────────

export interface Suggestion { title: string; metric: string; target: number; start?: number | null; why: string }

/** Categorias que subiram: os últimos 3 meses completos mais de 20% acima dos 3 anteriores (e mais de 30 €/mês). */
export function suggestCaps(expenses: Expense[], me: string, today: string, skip: string[] = []): Suggestion[] {
  const months: string[] = [];
  for (let k = prevMonth(monthKey(today)), j = 0; j < 6; j++, k = prevMonth(k)) months.push(k);
  const cats = [...new Set(expenses.map((e) => e.category))].filter((c) => !skip.includes(c));
  const out: (Suggestion & { up: number })[] = [];
  for (const c of cats) {
    const avg = (ks: string[]) => ks.reduce((t, k) => t + capSpent(expenses, c, me, me, k), 0) / ks.length;
    const recent = avg(months.slice(0, 3)), before = avg(months.slice(3));
    if (before > 0 && recent > before * 1.2 && recent > 30 * 100_000) {
      const target = Math.round(before / 100_000 / 10) * 10;
      out.push({ title: `${c}: até ${target} € por mês`, metric: `category_cap:${c}`, target, why: `Nos últimos 3 meses, ${eur0(recent)} por mês; antes, ${eur0(before)}.`, up: recent / before });
    }
  }
  return out.sort((a, b) => b.up - a.up).slice(0, 2).map(({ up: _u, ...s }) => s);
}

/** Uma conta com consumo a subir mais de 10% face ao ano passado: baixar 10%. */
export function suggestUsage(bill: { id: string; name: string }, payments: BillPayment[], today: string): Suggestion | null {
  const u = usageChange(payments, today);
  return u && u.change > 0.1 ? { title: `${bill.name}: gastar 10% menos`, metric: `usage:${bill.id}`, target: 10, why: `Os últimos 3 meses consumiram ${Math.round(u.change * 100)}% mais do que há um ano.` } : null;
}

/** Um carro a gastar mais 8% do que o costume: voltar ao costume. */
export function suggestCar(car: { id: string; name: string }, logs: CarLog[], today: string): Suggestion | null {
  const now = carRecent(logs, today), all = consumption(logs).avg;
  if (now === null || all === null || now < all * 1.08) return null;
  const target = Math.round(all * 10) / 10;
  return { title: `${car.name}: voltar a ${dec1(target)} L/100 km`, metric: `car_l100:${car.id}`, target, start: Math.round(now * 10) / 10, why: `Nos últimos 3 meses, ${dec1(now)} L/100 km; o costume é ${dec1(all)}.` };
}

/** Qual mostrar no início: o que está pior (passou, depois em risco), depois o de prazo mais perto. */
export function mainGoal<G extends { due_on: string }>(list: { g: G; p: Progress }[]): { g: G; p: Progress } | null {
  const rank: Record<GoalState, number> = { over: 0, risk: 1, ok: 2, wait: 3, done: 4 };
  return [...list].sort((a, b) => rank[a.p.state] - rank[b.p.state] || a.g.due_on.localeCompare(b.g.due_on))[0] ?? null;
}
