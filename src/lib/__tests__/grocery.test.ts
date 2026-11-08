import { describe, expect, it } from 'vitest';
import { groceryReport, storeOf } from '../grocery';
import { toU } from '../money';

const e = (id: string, spent_on: string, amount: string, note = 'Pingo Doce') => ({ id, spent_on, amount, note, category: 'Supermercado' });

describe('relatório do supermercado', () => {
  // 3 meses: 6 compras grandes (2 por mês, 100 €) e 6 pequenas (10 €). Só 3 das grandes têm fatura lida.
  const ex = [
    e('a', '2026-08-03', '100.00'), e('b', '2026-08-17', '100.00', 'Lidl'), e('c', '2026-09-02', '100.00'), e('d', '2026-09-16', '100.00', 'Lidl'),
    e('f', '2026-10-01', '100.00'), e('g', '2026-10-15', '100.00', 'Lidl'),
    ...['08-05', '08-20', '09-05', '09-20', '10-05', '10-20'].map((d, k) => e(`p${k}`, `2026-${d}`, '10.00', 'Padaria')),
  ];
  const items = [
    { expense_id: 'a', product: 'Leite', qty: 6, unit: 'l' as const, price: '5.40', bought_on: '2026-08-03' },
    { expense_id: 'c', product: 'Leite', qty: 6, unit: 'l' as const, price: '5.40', bought_on: '2026-09-02' },
    { expense_id: 'f', product: 'Leite', qty: 6, unit: 'l' as const, price: '5.40', bought_on: '2026-10-01' },
    { expense_id: 'f', product: 'Bananas', qty: 1.5, unit: 'kg' as const, price: '1.80', bought_on: '2026-10-01' },
    { expense_id: 'zz', product: 'Vinho', qty: 1, unit: 'un' as const, price: '9.00', bought_on: '2026-10-01' }, // de uma despesa que não se vê
  ];
  const r = groceryReport(ex, items, '2026-10-31')!;
  it('cobertura: só uma parte do gasto tem fatura lida', () => {
    expect(r.total).toBe(toU('660'));
    expect(r.covered).toBe(toU('300'));
    expect(r.coverage).toBeCloseTo(300 / 660, 3);
    expect(r.receipts).toBe(3);
    expect(r.confidence).toBe('media');
  });
  it('consumo estimado: o que está nas faturas × o gasto todo ÷ o gasto com fatura, por mês', () => {
    const leite = r.products.find((p) => p.product === 'Leite')!;
    // 18 l em ~3 meses, × 2,2 → ~13 l/mês
    expect(leite.perMonth).toBeGreaterThan(12);
    expect(leite.perMonth).toBeLessThan(14);
    expect(r.products.some((p) => p.product === 'Vinho')).toBe(false);
  });
  it('por loja e por mês (todo o gasto)', () => {
    expect(r.byStore.map((s) => s.store)).toEqual(['Pingo Doce', 'Lidl', 'Padaria']);
    expect(r.byMonth.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(storeOf('Galp · Golf')).toBe('Galp');
  });
  it('sem faturas lidas: confiança baixa e sem produtos', () => {
    const z = groceryReport(ex, [], '2026-10-31')!;
    expect(z.confidence).toBe('baixa'); expect(z.products).toEqual([]);
  });
});
