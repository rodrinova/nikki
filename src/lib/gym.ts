// Ginásio: avaliações com as medidas que cada um escolhe (peso, gordura, massa muscular, idade metabólica…).
// De cada medida: o último valor, a diferença para a anterior e para a primeira, e a linha ao longo do tempo.
// Só o próprio vê. Regras em docs/CALCULOS.md, secção 14. Puro.

import { addDays, parseDate } from './dates';

export interface GymField { key: string; label: string; unit: string; lower_is_better: boolean; sort?: number }
export interface Assessment { id: string; measured_on: string; values: Record<string, number | string | null> }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));

/** Os pontos de uma medida, do mais antigo ao mais recente (só as avaliações que a têm). */
export function series(list: Assessment[], key: string): { on: string; v: number }[] {
  return [...list].sort((a, b) => a.measured_on.localeCompare(b.measured_on)).map((a) => ({ on: a.measured_on, v: num(a.values[key]) })).filter((p): p is { on: string; v: number } => p.v !== null && !Number.isNaN(p.v));
}

export type Trend = 'better' | 'worse' | 'same' | null;
/**
 * Medidas sem «melhor» ou «pior»: o peso e o IMC dependem do objetivo de cada um (perder, manter ou ganhar); a
 * avaliação física é um tipo de corpo (1–9), não uma nota; a massa óssea quase não muda.
 */
export const NEUTRAL = ['weight', 'bmi', 'physique', 'bone'];

/** Os grupos, pela ordem (sort) das medidas. */
export const groupOf = (sort = 50) => (sort < 20 ? 'Balança' : sort < 30 ? 'Fita métrica' : sort < 40 ? 'Por segmento' : 'Coração');
/** Se uma mudança é para melhor: na gordura, cintura ou idade metabólica, descer é melhor; no músculo, subir. */
export const trend = (d: number, f: GymField): Trend => (NEUTRAL.includes(f.key) ? null : Math.abs(d) < 1e-9 ? 'same' : (d < 0) === f.lower_is_better ? 'better' : 'worse');

export interface FieldSummary { last: number; on: string; prev: number | null; first: number; sincePrev: number | null; sinceFirst: number; points: { on: string; v: number }[] }
export function summary(list: Assessment[], key: string): FieldSummary | null {
  const pts = series(list, key);
  if (!pts.length) return null;
  const last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : null;
  return { last: last.v, on: last.on, prev: prev?.v ?? null, first: pts[0].v, sincePrev: prev ? last.v - prev.v : null, sinceFirst: last.v - pts[0].v, points: pts };
}

/** «78,4 kg», «18,2 %», «31 anos»: até uma casa decimal, sem zeros a mais. */
export function fmt(v: number, unit = '', signed = false): string {
  const r = Math.round(v * 10) / 10, s = (Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1)).replace('.', ',');
  const sign = signed ? (r > 0 ? '+' : r < 0 ? '−' : '') : r < 0 ? '−' : '';
  const u = unit === 'anos' && Math.abs(r) === 1 ? 'ano' : unit === '1–9' ? '' : unit === 'nível' ? '' : unit;
  return `${sign}${s}${u ? (u === '%' ? '%' : ` ${u}`) : ''}`;
}

/** Quando é a próxima avaliação (a última + n semanas) e se já passou. */
export function nextCheck(list: Assessment[], weeks: number, today: string): { due: string; late: number } | null {
  const last = [...list].sort((a, b) => b.measured_on.localeCompare(a.measured_on))[0];
  if (!last) return null;
  const due = addDays(last.measured_on, weeks * 7);
  return { due, late: Math.round((parseDate(today).getTime() - parseDate(due).getTime()) / 86_400_000) };
}

/** Objetivo do corpo: do valor de partida até ao alvo, no sentido certo da medida. */
export function bodyProgress(list: Assessment[], f: GymField, target: number, start: number | null): { pct: number; done: boolean; last: number | null } {
  const s = summary(list, f.key);
  if (!s) return { pct: 0, done: false, last: null };
  const from = start ?? s.first, down = target < from;
  const done = down ? s.last <= target : s.last >= target;
  const pct = from === target ? (done ? 1 : 0) : Math.max(0, Math.min(1, (s.last - from) / (target - from)));
  return { pct: done ? 1 : pct, done, last: s.last };
}
