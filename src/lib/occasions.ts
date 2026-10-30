// Eventos (casamento, batizado, bodas, festas…): um centro de custos com data. Valores em unidades de money.ts.
// As despesas ligadas (expenses.occasion_id) contam no mês, mas ficam fora das médias (um casamento não é um mês normal).

import { toU } from './money';

export type OccasionKind = 'casamento' | 'batizado' | 'aniversario' | 'bodas' | 'festa' | 'viagem' | 'outro';
export interface Occasion { id: string; name: string; kind: OccasionKind; on_date: string | null; place: string | null; budget: number | string | null; archived: boolean; created_at: string }
export interface Guest { id: string; occasion_id: string; name: string; people: number; rsvp: 'pending' | 'yes' | 'no' | 'maybe'; grp: string | null; note: string | null }
export interface OccItem { id: string; occasion_id: string; kind: 'buy' | 'todo'; title: string; due_on: string | null; done: boolean }
export interface Vendor { id: string; occasion_id: string; name: string; service: string | null; contact: string | null; total: number | string | null; paid: number | string }
export interface Gift { id: string; occasion_id: string; from_name: string; amount: number | string | null; item: string | null; thanked: boolean }

export const KINDS: { k: OccasionKind; name: string }[] = [
  { k: 'casamento', name: 'Casamento' }, { k: 'batizado', name: 'Batizado' }, { k: 'aniversario', name: 'Aniversário' },
  { k: 'bodas', name: 'Bodas' }, { k: 'festa', name: 'Festa' }, { k: 'viagem', name: 'Viagem' }, { k: 'outro', name: 'Outro' },
];
export const kindName = (k: string) => KINDS.find((x) => x.k === k)?.name ?? 'Evento';

const u = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? 0 : toU(v));

/**
 * Resumo de um evento:
 * - spent: todas as despesas ligadas (pague quem pagar); left: orçamento − gasto (null sem orçamento).
 * - committed: o que falta pagar aos fornecedores (combinado − pago); forecast: gasto + o que falta.
 * - gifts: dinheiro recebido; net: gasto − dinheiro recebido.
 * - people: pessoas confirmadas; invited: pessoas convidadas (sem os «não»); waiting: convites sem resposta.
 * - todo: compras e tarefas por fazer; late: por fazer com a data já passada; thanks: presentes por agradecer.
 */
export function summary(o: Occasion, expenses: { amount: number | string; occasion_id?: string | null }[], guests: Guest[], items: OccItem[], vendors: Vendor[], gifts: Gift[], today: string, total?: number) {
  const mine = <T extends { occasion_id?: string | null }>(xs: T[]) => xs.filter((x) => x.occasion_id === o.id);
  // total: o gasto da casa (nikki.occasion_totals, com as «só minhas» de cada um); sem ele, as despesas que se veem.
  const spent = total ?? mine(expenses).reduce((t, e) => t + u(e.amount), 0);
  const budget = o.budget === null || o.budget === '' ? null : u(o.budget);
  const vs = mine(vendors), gs = mine(guests), its = mine(items), gf = mine(gifts);
  const committed = vs.reduce((t, v) => t + Math.max(0, u(v.total) - u(v.paid)), 0);
  const money = gf.reduce((t, g) => t + u(g.amount), 0);
  const open = its.filter((i) => !i.done);
  return {
    spent, budget, left: budget === null ? null : budget - spent, committed, forecast: spent + committed,
    gifts: money, net: spent - money,
    people: gs.filter((g) => g.rsvp === 'yes').reduce((t, g) => t + g.people, 0),
    invited: gs.filter((g) => g.rsvp !== 'no').reduce((t, g) => t + g.people, 0),
    waiting: gs.filter((g) => g.rsvp === 'pending').length,
    todo: open.length, late: open.filter((i) => i.due_on !== null && i.due_on < today).length,
    thanks: gf.filter((g) => !g.thanked).length,
    days: o.on_date ? Math.round((Date.parse(o.on_date + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 86_400_000) : null,
  };
}

/** «daqui a 12 dias», «amanhã», «hoje», «foi há 3 dias». */
export function countdown(days: number | null): string {
  if (days === null) return 'sem data';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days > 1) return `daqui a ${days} dias`;
  return days === -1 ? 'foi ontem' : `foi há ${-days} dias`;
}

/** Ativos primeiro (o mais próximo à frente, sem data no fim), arquivados à parte. */
export function sortOccasions<T extends Occasion>(xs: T[]): { active: T[]; archived: T[] } {
  const by = (a: T, b: T) => (a.on_date ?? '9999').localeCompare(b.on_date ?? '9999') || a.created_at.localeCompare(b.created_at);
  return { active: xs.filter((x) => !x.archived).sort(by), archived: xs.filter((x) => x.archived).sort((a, b) => by(b, a)) };
}
