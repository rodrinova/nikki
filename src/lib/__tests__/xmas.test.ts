import { describe, expect, it } from 'vitest';
import { festive, inSeason, matchExpense, pastFor, publicTotal, soundsXmas, xmasYear, type XGift } from '../xmas';

const g = (o: Partial<XGift>): XGift => ({ id: 'g', occasion_id: 'n26', to_name: 'Mãe', item: null, price: null, bought: false, expense_id: null, secret_for: null, created_by: 'r', created_at: '2026-11-01', ...o });

describe('Natal', () => {
  it('a época e o ano', () => {
    expect(inSeason('2026-11-01')).toBe(true); expect(inSeason('2027-01-06')).toBe(true); expect(inSeason('2026-10-31')).toBe(false);
    expect(festive('2026-11-22')).toBe(true); expect(festive('2026-11-21')).toBe(false);
    expect(xmasYear('2027-01-03')).toBe(2026); expect(xmasYear('2026-12-20')).toBe(2026);
  });
  it('reconhece despesas de Natal', () => {
    expect(soundsXmas('45 prenda da mãe')).toBe(true); expect(soundsXmas('presente Inês')).toBe(true); expect(soundsXmas('Árvore de Natal')).toBe(true);
    expect(soundsXmas('pingo doce')).toBe(false);
  });
  it('encontra a despesa que bate certo com a prenda', () => {
    const ex = [
      { id: 'a', amount: '45.00', spent_on: '2026-11-20', note: 'Perfumes & Companhia' },
      { id: 'b', amount: '45.30', spent_on: '2026-12-02', note: 'prenda mãe' },
      { id: 'c', amount: '45.00', spent_on: '2026-08-02', note: 'prenda mãe' },
    ];
    expect(matchExpense(g({ price: 45 }), ex, 2026, new Set())?.id).toBe('b');
    expect(matchExpense(g({ price: 45 }), ex, 2026, new Set(['b']))?.id).toBe('a');
    expect(matchExpense(g({ price: 60 }), ex, 2026, new Set())).toBeNull();
  });
  it('o que se deu antes e o total sem as secretas', () => {
    const all = [g({ id: '1', occasion_id: 'n25', item: 'Perfume', price: 40 }), g({ id: '2', occasion_id: 'n26', item: 'Livro', price: 20 })];
    const yearOf = (o: string) => (o === 'n25' ? 2025 : 2026);
    expect(pastFor('mãe ', all, yearOf, 2026)).toEqual([{ year: 2025, item: 'Perfume', price: 40 }]);
    expect(publicTotal([g({ price: 20 }), g({ price: 99, secret_for: 'i' })])).toBe(20);
  });
});
