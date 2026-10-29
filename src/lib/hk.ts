// Housekeeping: dias fixos de visita, a lista de cada visita e o pagamento mensal fixo.
// Regras em docs/CALCULOS.md (secção 9) do repositório thenikki. Puro.

import { addDays, daysInMonth, monthKey, nextMonth, parseDate } from './dates';
import { nthWeekday } from './agenda';

export type HkRepeat = 'visit' | 'week' | 'month' | 'once';
export interface HkTask { id: string; title: string; repeat: HkRepeat; due_on: string | null; archived: boolean; chore_id?: string | null }
export interface HkLog { id?: string; task_id: string; done_on: string; done_by?: string }
/**
 * Quando se paga: num dia do mês (pay_day: 28; 31 em fevereiro = último dia) ou num dia da semana do mês
 * (pay_nth 1–4 ou −1 = o último, e pay_weekday 1 = segunda … 7 = domingo: «a última sexta-feira»).
 * pay_remind: com quantos dias de antecedência a NIKKI avisa (para dar tempo de preparar o pagamento).
 */
export interface HkPay { monthly_pay: number | string | null; pay_day: number | null; pay_nth?: number | null; pay_weekday?: number | null; pay_remind?: number | null; created_at: string }

/** 1 = segunda … 7 = domingo (como na base de dados). */
const iso = (d: string) => ((parseDate(d).getDay() + 6) % 7) + 1;
const pad = (n: number) => String(n).padStart(2, '0');

/** É dia de visita? Sem dias marcados, qualquer dia serve (vem quando combinado). */
export const isVisitDay = (weekdays: number[], d: string) => weekdays.length === 0 || weekdays.includes(iso(d));

/** A próxima visita a contar de hoje (inclusive). */
export function nextVisit(weekdays: number[], from: string): string {
  for (let i = 0; i < 7; i++) { const d = addDays(from, i); if (isVisitDay(weekdays, d)) return d; }
  return from;
}

/** A visita anterior a um dia (exclusive), para o histórico. */
export function prevVisit(weekdays: number[], before: string): string {
  for (let i = 1; i <= 7; i++) { const d = addDays(before, -i); if (isVisitDay(weekdays, d)) return d; }
  return addDays(before, -1);
}

/** As visitas entre dois dias (inclusive). */
export function visitsBetween(weekdays: number[], from: string, to: string): string[] {
  const out: string[] = [];
  if (!weekdays.length) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isVisitDay(weekdays, d)) out.push(d);
  return out;
}

const PLURAL = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
/** «Terças e sextas, às 9h», «Dias úteis», «Quando combinado». */
export function daysLabel(weekdays: number[], start?: string | null): string {
  const w = [...new Set(weekdays)].sort((a, b) => a - b);
  let t = !w.length ? 'Quando combinado'
    : w.length === 7 ? 'Todos os dias'
    : w.join() === '1,2,3,4,5' ? 'Dias úteis'
    : w.map((d) => PLURAL[d - 1]).reduce((a, b, i, all) => (i === 0 ? b : i === all.length - 1 ? `${a} e ${b}` : `${a}, ${b}`), '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (start) { const [h, m] = start.split(':'); t += `, às ${Number(h)}h${m && m !== '00' ? m : ''}`; }
  return t;
}

/** «Em cada visita», «Uma vez por semana», «Uma vez por mês», «Só uma vez». */
export const repeatLabel = (r: HkRepeat) => ({ visit: 'Em cada visita', week: 'Uma vez por semana', month: 'Uma vez por mês', once: 'Só uma vez' })[r];

export interface VisitItem { task: HkTask; done: boolean; log: HkLog | null }

const weekKey = (d: string) => addDays(d, -(iso(d) - 1));

/**
 * A lista de uma visita (dia V):
 * - «em cada visita»: sempre; feita se ficou marcada nesse dia;
 * - «uma vez por semana / por mês»: entra até ser feita nessa semana (de segunda a domingo) ou nesse mês;
 * - «só uma vez»: entra a partir do dia pedido (ou já, sem dia) até ser feita; depois desaparece.
 * Fica marcada a feita no próprio dia, para se poder desfazer.
 */
export function visitList(tasks: HkTask[], log: HkLog[], visit: string): VisitItem[] {
  const out: VisitItem[] = [];
  for (const t of tasks) {
    if (t.archived) continue;
    const mine = log.filter((l) => l.task_id === t.id);
    const today = mine.find((l) => l.done_on === visit) ?? null;
    if (today) { out.push({ task: t, done: true, log: today }); continue; }
    const before = mine.filter((l) => l.done_on < visit);
    if (t.repeat === 'week' && before.some((l) => weekKey(l.done_on) === weekKey(visit))) continue;
    if (t.repeat === 'month' && before.some((l) => monthKey(l.done_on) === monthKey(visit))) continue;
    if (t.repeat === 'once' && (mine.length > 0 || (t.due_on && t.due_on > visit))) continue;
    out.push({ task: t, done: false, log: null });
  }
  const order: Record<HkRepeat, number> = { once: 0, visit: 1, week: 2, month: 3 };
  return out.sort((a, b) => Number(a.done) - Number(b.done) || order[a.task.repeat] - order[b.task.repeat] || a.task.title.localeCompare(b.task.title, 'pt'));
}

/** O que ficou feito por dia (para o histórico), do mais recente para o mais antigo. */
export function history(tasks: HkTask[], log: HkLog[], limit = 8): { day: string; titles: string[] }[] {
  const name = new Map(tasks.map((t) => [t.id, t.title]));
  const by = new Map<string, string[]>();
  for (const l of log) { const t = name.get(l.task_id); if (t) by.set(l.done_on, [...(by.get(l.done_on) ?? []), t]); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, limit).map(([day, titles]) => ({ day, titles }));
}

/** O dia de pagar num mês (31 em fevereiro = último dia). */
export const payDate = (month: string, payDay: number) => `${month}-${pad(Math.min(payDay, daysInMonth(month)))}`;

const byWeekday = (hk: HkPay) => !!hk.pay_nth && !!hk.pay_weekday;
/** Há regra de pagamento? (um dia do mês, ou um dia da semana do mês) */
export const hasPayRule = (hk: HkPay) => byWeekday(hk) || !!hk.pay_day;

/** O dia de pagar de um mês, pela regra da ficha. */
export function payDateOf(month: string, hk: HkPay): string | null {
  if (byWeekday(hk)) return nthWeekday(month, hk.pay_nth!, hk.pay_weekday!);
  return hk.pay_day ? payDate(month, hk.pay_day) : null;
}

const WD = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
/** «dia 28», «última sexta-feira do mês», «1.º sábado do mês» (o sábado e o domingo são masculinos). */
export function payRuleLabel(hk: HkPay): string {
  if (byWeekday(hk)) {
    const masc = hk.pay_weekday! >= 6;
    const nth = hk.pay_nth === -1 ? (masc ? 'último' : 'última') : `${hk.pay_nth}.${masc ? 'º' : 'ª'}`;
    return `${nth} ${WD[hk.pay_weekday! - 1]} do mês`;
  }
  return hk.pay_day ? `dia ${hk.pay_day}` : '';
}

export interface PayDue { month: string; due: string; late: number }

/**
 * Meses por pagar: desde o mês em que se começou, os que já chegaram ao dia de pagar (ou chegam nos próximos dias do aviso, 3 por defeito)
 * e não estão pagos. Sem valor ou sem dia de pagar, não há aviso.
 */
export function payDue(hk: HkPay, paid: string[], today: string, ahead = hk.pay_remind ?? 3): PayDue[] {
  if (!hk.monthly_pay || !hasPayRule(hk)) return [];
  const out: PayDue[] = [];
  const done = new Set(paid);
  const until = addDays(today, ahead);
  for (let m = monthKey(hk.created_at.slice(0, 10)); m <= monthKey(until); m = nextMonth(m)) {
    const due = payDateOf(m, hk);
    if (!due || due > until || done.has(m)) continue;
    out.push({ month: m, due, late: Math.round((parseDate(today).getTime() - parseDate(due).getTime()) / 86_400_000) });
  }
  return out;
}
