import { describe, expect, it } from 'vitest';
import { bodyProgress, fmt, nextCheck, series, summary, trend, type Assessment } from '../gym';

const A = (on: string, values: Assessment['values']): Assessment => ({ id: on, measured_on: on, values });
const list = [A('2026-08-01', { weight: 82, fat: 22.4, meta_age: 38 }), A('2026-10-01', { weight: 79.6, fat: 20.1 }), A('2026-09-01', { weight: '80,5', fat: 21, meta_age: 35 })];
const fat = { key: 'fat', label: 'Gordura', unit: '%', lower_is_better: true };
const muscle = { key: 'muscle', label: 'Massa muscular', unit: 'kg', lower_is_better: false };

describe('medidas', () => {
  it('pontos por ordem, só onde há valor', () => {
    expect(series(list, 'meta_age')).toEqual([{ on: '2026-08-01', v: 38 }, { on: '2026-09-01', v: 35 }]);
    expect(series(list, 'weight').map((p) => p.v)).toEqual([82, 80.5, 79.6]);
  });
  it('último, desde a anterior e desde o início', () => {
    const s = summary(list, 'weight')!;
    expect([s.last, Math.round(s.sincePrev! * 10) / 10, Math.round(s.sinceFirst * 10) / 10]).toEqual([79.6, -0.9, -2.4]);
    expect(summary(list, 'rhr')).toBeNull();
  });
  it('melhor ou pior conforme a medida', () => {
    expect(trend(-1, fat)).toBe('better');
    expect(trend(-1, muscle)).toBe('worse');
    expect(trend(0, fat)).toBe('same');
    expect(trend(-2, { key: 'weight', label: 'Peso', unit: 'kg', lower_is_better: false })).toBeNull();
  });
  it('números à portuguesa', () => {
    expect(fmt(79.6, 'kg')).toBe('79,6 kg');
    expect(fmt(-2.4, 'kg', true)).toBe('−2,4 kg');
    expect(fmt(20.1, '%')).toBe('20,1%');
    expect(fmt(35, 'anos')).toBe('35 anos');
    expect(fmt(-1, 'anos', true)).toBe('−1 ano');
  });
});

describe('lembrete e objetivos', () => {
  it('próxima avaliação 4 semanas depois da última', () => {
    expect(nextCheck(list, 4, '2026-10-29')).toEqual({ due: '2026-10-29', late: 0 });
    expect(nextCheck([], 4, '2026-10-29')).toBeNull();
  });
  it('do ponto de partida ao alvo, no sentido certo', () => {
    expect(bodyProgress(list, fat, 18, 22.4)).toMatchObject({ done: false, last: 20.1 });
    expect(Math.round(bodyProgress(list, fat, 18, 22.4).pct * 100)).toBe(52);
    expect(bodyProgress(list, fat, 20.5, null).done).toBe(true);
    expect(bodyProgress([], fat, 18, null)).toEqual({ pct: 0, done: false, last: null });
  });
});
