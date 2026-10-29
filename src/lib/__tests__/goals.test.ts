import { describe, expect, it } from 'vitest';
import { capProgress, capSpent, capStreak, goalKind, mainGoal, suggestCaps, usageProgress, carProgress } from '../goals';
import type { Expense } from '../money';
import type { BillPayment } from '../home';
import type { CarLog } from '../garage';

const U = 100_000;
const e = (amount: number, category: string, spent_on: string, split: Expense['split'] = 'mine', paid_by = 'r'): Expense =>
  ({ id: Math.random().toString(36), amount: String(amount), category, spent_on, split, paid_by, other_id: split === 'mine' ? null : 'i', payer_share: split === 'shared' ? '0.5' : null } as Expense);

describe('tipo de objetivo', () => {
  it('pela métrica', () => {
    expect(goalKind('category_cap:Restaurantes')).toBe('cap');
    expect(goalKind('usage:abc')).toBe('usage');
    expect(goalKind('car_l100:abc')).toBe('car');
    expect(goalKind('fund:emergency')).toBe('health');
    expect(goalKind('gym:fat')).toBe('body');
  });
});

describe('limite por categoria', () => {
  const ex = [e(60, 'Restaurantes', '2026-10-03'), e(80, 'Restaurantes', '2026-10-20', 'shared'), e(30, 'Lazer', '2026-10-05'), e(250, 'Restaurantes', '2026-09-10')];
  it('o meu é a minha parte; o da casa, as partilhadas inteiras', () => {
    expect(capSpent(ex, 'Restaurantes', 'r', 'r', '2026-10')).toBe(100 * U);
    expect(capSpent(ex, 'Restaurantes', null, 'r', '2026-10')).toBe(80 * U);
  });
  it('ritmo do mês', () => {
    expect(capProgress(100 * U, 200 * U, '2026-10-29')).toMatchObject({ state: 'ok', label: '100 € de 200 €' });
    expect(capProgress(150 * U, 200 * U, '2026-10-10')).toMatchObject({ state: 'risk' });
    expect(capProgress(210 * U, 200 * U, '2026-10-29')).toMatchObject({ state: 'over', detail: 'Passou 10 € este mês.' });
  });
  it('meses seguidos dentro do limite', () => {
    expect(capStreak(ex, 'Restaurantes', 'r', 'r', 200 * U, '2026-10-29', '2026-08-01')).toBe(0);
    expect(capStreak(ex, 'Restaurantes', 'r', 'r', 300 * U, '2026-10-29', '2026-08-01')).toBe(2);
  });
  it('sugere as categorias que subiram', () => {
    const h = [...['2026-04', '2026-05', '2026-06'].map((m) => e(100, 'Restaurantes', `${m}-10`)), ...['2026-07', '2026-08', '2026-09'].map((m) => e(160, 'Restaurantes', `${m}-10`)),
      ...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => e(300, 'Supermercado', `${m}-10`))];
    expect(suggestCaps(h, 'r', '2026-10-29')).toEqual([{ title: 'Restaurantes: até 100 € por mês', metric: 'category_cap:Restaurantes', target: 100, why: 'Nos últimos 3 meses, 160 € por mês; antes, 100 €.' }]);
  });
});

describe('hábitos da casa', () => {
  const p = (from: string, to: string, usage: number): BillPayment => ({ id: from, bill_id: 'b', expense_id: null, amount: '50', period_from: from, period_to: to, usage: String(usage), adjustment: false } as BillPayment);
  it('consumo: quanto baixou face ao ano passado', () => {
    const pays = [p('2025-07-01', '2025-07-31', 300), p('2025-08-01', '2025-08-31', 300), p('2025-09-01', '2025-09-30', 300), p('2026-07-01', '2026-07-31', 270), p('2026-08-01', '2026-08-31', 270), p('2026-09-01', '2026-09-30', 270)];
    expect(usageProgress(pays, 10, '2026-10-29')).toMatchObject({ state: 'done', pct: 1, label: '−10% de 10%' });
    expect(usageProgress(pays.slice(3), 10, '2026-10-29').state).toBe('wait');
  });
  it('carro: do ponto de partida ao alvo', () => {
    const l = (d: string, odo: number, litres: number): CarLog => ({ id: d, car_id: 'c', logged_on: d, odometer: odo, litres: String(litres), full_tank: true, kind: 'fuel', expense_id: null, amount: '50', note: null, created_at: d } as CarLog);
    const logs = [l('2026-08-01', 10000, 40), l('2026-09-01', 10500, 35), l('2026-10-01', 11000, 32.5)];
    expect(carProgress(logs, 6, 7, '2026-10-29')).toMatchObject({ state: 'ok', label: '6,8 de 6,0' });
    expect(carProgress(logs, 7, 7.5, '2026-10-29').state).toBe('done');
  });
});

describe('o do início', () => {
  it('o pior primeiro, depois o prazo mais perto', () => {
    const mk = (id: string, state: 'ok' | 'risk' | 'over', due_on: string) => ({ g: { id, due_on }, p: { pct: 0, state, label: '', detail: '' } });
    expect(mainGoal([mk('a', 'ok', '2026-11-01'), mk('b', 'risk', '2027-01-01'), mk('c', 'risk', '2026-12-01')])!.g.id).toBe('c');
  });
});
