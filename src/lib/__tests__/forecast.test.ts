import { describe, expect, it } from 'vitest';
import { driver, expected, keyOf, type Past } from '../forecast';

const R = 'r', I = 'i';
let n = 0;
const e = (spent_on: string, note: string, amount: number, paid_by = R, split: Past['split'] = 'mine'): Past =>
  ({ id: String(n++), paid_by, other_id: null, amount, split, payer_share: null, spent_on, category: 'Contas', note });

describe('keyOf', () => {
  it('as duas primeiras palavras, sem números', () => {
    expect(keyOf('Apple One 11/2026')).toBe('apple one');
    expect(keyOf('Seguro da casa')).toBe('seguro da');
    expect(keyOf(null)).toBe('');
  });
});

describe('expected', () => {
  const apple = ['2026-07-05', '2026-08-05', '2026-09-06', '2026-10-05'].map((d) => e(d, 'Apple One', 30.95));
  it('mensal: ainda não apareceu, passado o dia habitual', () => {
    const x = expected(apple, R, '2026-11-08');
    expect(x).toHaveLength(1);
    expect(x[0]).toMatchObject({ kind: 'monthly', note: 'Apple One', amount: 3_095_000, day: '2026-11-05' });
  });
  it('mensal: antes do dia (+2) ou já pago, nada', () => {
    expect(expected(apple, R, '2026-11-06')).toHaveLength(0);
    expect(expected([...apple, e('2026-11-04', 'Apple One', 30.95)], R, '2026-11-08')).toHaveLength(0);
  });
  it('só para quem pagou a última vez', () => {
    expect(expected(apple, I, '2026-11-08')).toHaveLength(0);
  });
  it('anual: há um ano, com o aniversário perto', () => {
    const ins = [e('2025-11-20', 'Seguro da casa', 412)];
    expect(expected(ins, R, '2026-11-08')[0]).toMatchObject({ kind: 'yearly', day: '2026-11-20', amount: 41_200_000 });
    expect(expected(ins, R, '2026-10-01')).toHaveLength(0); // ainda longe
    expect(expected([e('2025-11-20', 'Pastelaria', 4)], R, '2026-11-08')).toHaveLength(0); // pequeno demais
  });
});

describe('driver', () => {
  it('a categoria que mais passa do seu normal', () => {
    expect(driver([['Casa', 900], ['Restaurantes', 300]], { Casa: 900, Restaurantes: 150 }, 0.9)).toBe('Restaurantes');
    expect(driver([['Casa', 900]], { Casa: 1000 }, 0.9)).toBe(null);
  });
});
