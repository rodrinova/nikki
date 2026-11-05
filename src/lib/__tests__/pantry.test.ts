import { describe, expect, it } from 'vitest';
import { niceQty, suggestions } from '../pantry';

describe('sugestões das compras', () => {
  // Limões: 4 kg a cada ~30 dias; a última foi há 45 dias.
  const lim = [
    { product: 'Limões', qty: '4', unit: 'kg' as const, bought_on: '2026-07-01' },
    { product: 'Limões', qty: '4', unit: 'kg' as const, bought_on: '2026-07-31' },
    { product: 'limoes', qty: '4', unit: 'kg' as const, bought_on: '2026-08-30' },
  ];
  it('sugere o que já devia ter acabado, com a quantidade de uma compra', () => {
    const s = suggestions(lim, ['Pão'], '2026-10-14');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ product: 'Limões', unit: 'kg', qty: 4, every: 30, daysSince: 45 });
    expect(s[0].perMonth).toBeCloseTo(4, 1);
  });
  it('não sugere o que ainda não faz falta nem o que já está na lista', () => {
    expect(suggestions(lim, [], '2026-09-10')).toHaveLength(0);
    expect(suggestions(lim, ['limões'], '2026-10-14')).toHaveLength(0);
  });
  it('precisa de duas compras em dias diferentes', () => {
    expect(suggestions([lim[0]], [], '2026-10-14')).toHaveLength(0);
  });
  it('arredonda a quantidades que se compram', () => {
    expect(niceQty(3.7, 'kg')).toBe(3.5);
    expect(niceQty(0.6, 'kg')).toBe(0.5);
    expect(niceQty(5.4, 'un')).toBe(5);
    expect(niceQty(0.2, 'un')).toBe(1);
  });
});
