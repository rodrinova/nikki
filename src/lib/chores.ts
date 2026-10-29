// Casa, fase 2: tarefas que se repetem, manutenção, a lista de hoje de cada pessoa e garantias.
// Regras em docs/CALCULOS.md (secção 6d) do repositório thenikki. Puro.

import { addDays, daysInMonth, parseDate } from './dates';
import { parseDateText, parseMoneyText } from './invoice';

export type Unit = 'day' | 'week' | 'month' | 'year';
export type Assign = 'fixed' | 'rotate' | 'anyone';

export interface Chore {
  id: string;
  kind: 'task' | 'maintenance';
  title: string;
  every_n: number;
  every_unit: Unit;
  next_on: string;
  assign: Assign;
  turn_id: string | null;
  archived: boolean;
  home_id?: string | null;
}
export interface Todo { id: string; title: string; owner_id: string | null; due_on: string | null; done_at: string | null; created_at: string }

const pad = (n: number) => String(n).padStart(2, '0');

/** Somar meses a uma data; no fim do mês fica no último dia (31 jan + 1 mês = 28/29 fev). */
export function addMonths(d: string, n: number): string {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1 + n, day = Number(d.slice(8, 10));
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1, key = `${yy}-${pad(mm)}`;
  return `${key}-${pad(Math.min(day, daysInMonth(key)))}`;
}

/** A data seguinte de uma tarefa: «a cada n dias, semanas, meses ou anos». */
export function addPeriod(d: string, n: number, unit: Unit): string {
  if (unit === 'day') return addDays(d, n);
  if (unit === 'week') return addDays(d, 7 * n);
  return addMonths(d, unit === 'year' ? 12 * n : n);
}

/** «Todas as semanas», «a cada 2 semanas», «todos os meses», «a cada 3 meses», «uma vez por ano»… */
export function everyLabel(n: number, unit: Unit): string {
  const one: Record<Unit, string> = { day: 'todos os dias', week: 'todas as semanas', month: 'todos os meses', year: 'uma vez por ano' };
  const many: Record<Unit, string> = { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' };
  return n === 1 ? one[unit] : `a cada ${n} ${many[unit]}`;
}

/**
 * Depois de feita: a próxima data conta a partir do dia em que se fez (se se atrasou, não se acumulam vezes em falta),
 * e a vez passa: à vez → a outra pessoa da casa (a que não fez); fixa → a mesma; de quem pegar → ninguém.
 */
export function afterDone(c: Chore, doneOn: string, doneBy: string, people: string[]): { next_on: string; turn_id: string | null } {
  const next_on = addPeriod(doneOn, c.every_n, c.every_unit);
  if (c.assign === 'rotate') return { next_on, turn_id: people.find((p) => p !== doneBy) ?? doneBy };
  return { next_on, turn_id: c.assign === 'fixed' ? c.turn_id : null };
}

/** De quem é a próxima vez de uma tarefa (null = de quem pegar). */
export const whose = (c: Chore) => (c.assign === 'anyone' ? null : c.turn_id);

export interface TodayItem {
  kind: 'chore' | 'todo';
  id: string;
  title: string;
  late: number; // dias de atraso (0 = hoje)
  mine: boolean; // é desta pessoa (ou de quem pegar)
  owner: string | null;
  chore?: Chore;
  todo?: Todo;
}

/**
 * A lista de hoje de uma pessoa: as tarefas e manutenção com data até hoje que são dela ou de quem pegar, e as coisas
 * a fazer (de hoje, atrasadas ou sem dia) dela ou de quem puder. Atrasadas primeiro. Também diz quantas tem o outro.
 */
export function todayList(chores: Chore[], todos: Todo[], me: string, today: string): { mine: TodayItem[]; others: number } {
  const days = (d: string) => Math.round((parseDate(today).getTime() - parseDate(d).getTime()) / 86_400_000);
  const all: TodayItem[] = [];
  for (const c of chores) {
    if (c.archived || c.next_on > today) continue;
    const o = whose(c);
    all.push({ kind: 'chore', id: c.id, title: c.title, late: days(c.next_on), mine: o === null || o === me, owner: o, chore: c });
  }
  for (const t of todos) {
    if (t.done_at || (t.due_on && t.due_on > today)) continue;
    all.push({ kind: 'todo', id: t.id, title: t.title, late: t.due_on ? days(t.due_on) : 0, mine: t.owner_id === null || t.owner_id === me, owner: t.owner_id, todo: t });
  }
  const mine = all.filter((i) => i.mine).sort((a, b) => b.late - a.late || a.title.localeCompare(b.title));
  return { mine, others: all.filter((i) => !i.mine).length };
}

// ───────────── manutenção: sugestões ─────────────

export interface Suggestion { key: string; title: string; every_n: number; every_unit: Unit; why: string }

/** Manutenção habitual numa casa, com a frequência costumada (escolhem-se as que se aplicam). */
export const MAINTENANCE: Suggestion[] = [
  { key: 'caldeira', title: 'Revisão da caldeira ou esquentador', every_n: 1, every_unit: 'year', why: 'Segurança e consumo; melhor antes do inverno.' },
  { key: 'ac', title: 'Limpar os filtros do ar condicionado', every_n: 6, every_unit: 'month', why: 'Antes do verão e antes do inverno.' },
  { key: 'ac-rev', title: 'Revisão do ar condicionado', every_n: 1, every_unit: 'year', why: 'Gás, drenos e rendimento.' },
  { key: 'exaustor', title: 'Lavar o filtro do exaustor', every_n: 3, every_unit: 'month', why: 'A gordura acumulada é risco de incêndio.' },
  { key: 'fumo', title: 'Testar os detetores de fumo', every_n: 6, every_unit: 'month', why: 'Carregar no botão; trocar a pilha uma vez por ano.' },
  { key: 'mlr', title: 'Limpar a máquina de lavar roupa', every_n: 1, every_unit: 'month', why: 'Programa a quente vazio, filtro e borracha.' },
  { key: 'mll', title: 'Limpar o filtro da máquina da loiça', every_n: 1, every_unit: 'month', why: 'Lava melhor e não cheira.' },
  { key: 'calcario', title: 'Descalcificar chaleira, máquina de café e chuveiros', every_n: 3, every_unit: 'month', why: 'Com água dura, o calcário estraga.' },
  { key: 'frigorifico', title: 'Limpar o frigorífico e a grelha de trás', every_n: 6, every_unit: 'month', why: 'Gasta menos e dura mais.' },
  { key: 'radiadores', title: 'Purgar os radiadores', every_n: 1, every_unit: 'year', why: 'No início do inverno.' },
  { key: 'chamine', title: 'Limpar a chaminé ou a salamandra', every_n: 1, every_unit: 'year', why: 'Antes de começar a usar.' },
  { key: 'caleiras', title: 'Limpar caleiras e ralos exteriores', every_n: 1, every_unit: 'year', why: 'No outono, depois das folhas.' },
  { key: 'agua', title: 'Trocar o filtro da água', every_n: 6, every_unit: 'month', why: 'Se tiverem filtro na torneira ou no frigorífico.' },
];

// ───────────── garantias ─────────────

/** Fim da garantia: data de compra + anos (os meio-anos contam como 6 meses). */
export const warrantyEnd = (bought: string, years: number) => addMonths(bought, Math.round(years * 12));

/** Estado de uma garantia: a decorrer, a acabar (90 dias ou menos) ou acabada. */
export function warrantyState(bought: string, years: number, today: string): { end: string; state: 'ok' | 'soon' | 'ended'; days: number } {
  const end = warrantyEnd(bought, years), days = Math.round((parseDate(end).getTime() - parseDate(today).getTime()) / 86_400_000);
  return { end, days, state: days < 0 ? 'ended' : days <= 90 ? 'soon' : 'ok' };
}

/** Do texto de um talão: a loja (a primeira linha com letras), a data e o total. */
export function readReceipt(text: string): { store: string | null; date: string | null; total: number | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const store = lines.find((l) => /[a-zA-ZÀ-ú]{3}/.test(l) && !/fatura|recibo|nif|contribuinte|data|total/i.test(l))?.slice(0, 60) ?? null;
  const dm = text.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/);
  const tm = text.match(/total[^\n\d-]{0,20}(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+[.,]\d{2})/i);
  return { store, date: dm ? parseDateText(dm[1]) : null, total: tm ? parseMoneyText(tm[1]) : null };
}
