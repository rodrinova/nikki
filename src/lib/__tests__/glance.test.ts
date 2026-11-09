import { describe, expect, it } from 'vitest';
import { glance } from '../glance';

const R = 'r';
let n = 0;
const e = (spent_on: string, amount: number, note: string | null = null, category = 'Supermercado') => ({ id: String(n++), paid_by: R, other_id: null, amount, split: 'mine' as const, payer_share: null, spent_on, category, note });

describe('glance', () => {
  it('o mês dia a dia, os dias fora do normal e a frase', () => {
    const g = glance([e('2026-11-01', 907.2, 'Renda', 'Casa'), e('2026-11-03', 30, 'Pingo Doce'), e('2026-11-03', 20), e('2026-11-05', 12), e('2026-10-31', 500)], R, '2026-11', '2026-11-09', 31_000_000);
    expect(g.days).toHaveLength(30);
    expect(g.lead).toBe(6); // 1 de novembro de 2026 é domingo
    expect(g.days[2]).toMatchObject({ total: 5_000_000, note: 'Pingo Doce' });
    expect(g.days[8].today).toBe(true);
    expect(g.days[9].future).toBe(true);
    expect(g.outliers.map((d) => d.day)).toEqual([1, 3]); // normal: 310 €/30 ≈ 10,33 € por dia
    expect(g.sentence).toBe('O dia mais pesado foi o 1 (Renda, 907 €). Mais 1 fora do normal. 6 dias sem gastar nada.');
  });
  it('sem gastos', () => {
    expect(glance([], R, '2026-11', '2026-11-09', null).sentence).toBe('Ainda sem gastos este mês.');
  });
});
