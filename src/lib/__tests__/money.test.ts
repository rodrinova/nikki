import { describe, expect, it } from 'vitest';
import { arcT, eur, monthClose, monthSpend, normalMonth, pace, pairBalance, parseAmount, partOf, toU, yearFill, type Expense, type Transfer } from '../money';
import { addDays, daysInMonth, prevMonth, toDateStr } from '../dates';

const R = 'rodrigo', I = 'ines';
let n = 0;
const ex = (p: Partial<Expense>): Expense => ({ id: String(++n), paid_by: R, other_id: null, amount: '10.00', split: 'mine', payer_share: null, spent_on: '2026-10-10', category: 'Supermercado', ...p });

// Os mesmos números do teste SQL (supabase/tests/rls_test.sql)
const sample: Expense[] = [
  ex({ paid_by: R, other_id: I, amount: '100.00', split: 'shared', payer_share: '0.500' }),
  ex({ paid_by: R, other_id: I, amount: '24.00', split: 'other', category: 'Saúde' }),
  ex({ paid_by: R, other_id: I, amount: '12.35', split: 'shared', payer_share: 0.5 }),
  ex({ paid_by: I, other_id: R, amount: 46.8, split: 'shared', payer_share: '0.5', category: 'Restaurantes' }),
  ex({ paid_by: I, amount: '30.00', category: 'Lazer' }),
];

describe('toU', () => {
  it('converte sem erro de float', () => {
    expect(toU('12.35')).toBe(1_235_000);
    expect(toU(0.1)).toBe(10_000);
    expect(toU('-274.70')).toBe(-27_470_000);
    expect(toU(46.8)).toBe(4_680_000);
  });
});

describe('consumo', () => {
  it('a parte de cada um soma o total da casa', () => {
    const total = sample.reduce((t, e) => t + toU(e.amount), 0);
    const r = sample.reduce((t, e) => t + partOf(e, R), 0), i = sample.reduce((t, e) => t + partOf(e, I), 0);
    expect(r + i).toBe(total);
  });
  it('60/40: quem pagou fica com a sua parte', () => {
    const e = ex({ paid_by: R, other_id: I, amount: '100.00', split: 'shared', payer_share: 0.6 });
    expect(partOf(e, R)).toBe(toU(60));
    expect(partOf(e, I)).toBe(toU(40));
  });
  it('"do outro" conta toda para o outro', () => {
    const e = ex({ paid_by: R, other_id: I, amount: '24.00', split: 'other' });
    expect(partOf(e, R)).toBe(0);
    expect(partOf(e, I)).toBe(toU(24));
  });
});

describe('contas a dois', () => {
  it('bate certo com a função SQL, meio cêntimo incluído', () => {
    expect(pairBalance(sample, [], R, I)).toBe(5_677_500); // 56,775 €
    expect(pairBalance(sample, [], I, R)).toBe(-5_677_500);
  });
  it('transferências e saldo de abertura', () => {
    const t: Transfer[] = [{ from_id: I, to_id: R, amount: '56.78', made_on: '2026-10-20' }];
    expect(pairBalance(sample, t, R, I)).toBe(-500); // −0,005 €
    expect(pairBalance(sample, t, R, I, { amountA: -274.7, since: '2026-10-01' })).toBe(-27_470_500);
    expect(pairBalance(sample, [], R, I, { amountA: 0, since: '2026-11-01' })).toBe(0); // antes do corte não conta
  });
});

describe('mês, normal e ritmo', () => {
  const hist = [
    ex({ spent_on: '2026-08-05', amount: '300.00' }),
    ex({ spent_on: '2026-09-12', amount: '500.00' }),
    ex({ spent_on: '2026-10-03', amount: '200.00' }),
  ];
  it('normal = meses completos desde o primeiro registo; o mês corrente não conta', () => {
    expect(normalMonth(hist, R, '2026-10-27')).toBe(toU(400));
    expect(normalMonth([hist[2]], R, '2026-10-27')).toBeNull(); // só o mês corrente: primeiro mês
  });
  it('ritmo e fecho previsto', () => {
    const p = pace(toU(200), toU(310), '2026-10-27');
    expect(p.fresh).toBe(false);
    if (!p.fresh) {
      expect(p.pct).toBe(-26); // 200 vs 270 esperados
      expect(Math.round(p.forecast / 1000)).toBe(24_000); // 200 + 10 × 4 dias
    }
  });
  it('total por categoria', () => {
    const m = monthSpend(sample, I, '2026-10');
    expect(m.total).toBe(toU(30) + 5_000_000 + 2_400_000 + 617_500 + 2_340_000);
    expect(m.byCat[0][0]).toBe('Supermercado');
  });
});

describe('fecho do mês', () => {
  const hist = [
    ex({ spent_on: '2026-07-10', amount: '300.00' }),
    ex({ spent_on: '2026-08-05', amount: '500.00' }),
    ex({ spent_on: '2026-09-12', amount: '352.00' }),
    ex({ spent_on: '2026-10-03', amount: '999.00' }),
  ];
  it('compara o mês anterior com o normal até aí, sem o contar', () => {
    const c = monthClose(hist, R, '2026-10-28')!;
    expect(c.key).toBe('2026-09');
    expect(c.total).toBe(toU(352));
    expect(c.normal).toBe(toU(400)); // julho e agosto
    expect(c.pct).toBe(-12);
  });
  it('primeiro mês completo: sem normal para comparar', () => {
    const c = monthClose([hist[2]], R, '2026-10-02')!;
    expect(c.normal).toBeNull();
    expect(c.pct).toBeNull();
  });
  it('sem nada no mês anterior não há fecho', () => {
    expect(monthClose([hist[3]], R, '2026-10-28')).toBeNull();
    expect(monthClose(hist, I, '2026-10-28')).toBeNull();
  });
});

describe('arco das contas a dois', () => {
  it('meio em equilíbrio, para o lado de quem adiantou mais, com limite', () => {
    expect(arcT(0)).toBe(0.5);
    expect(arcT(400)).toBe(0.5); // menos de meio cêntimo
    expect(arcT(toU(150))).toBeCloseTo(0.5 - 0.42 * (1 - Math.exp(-1)), 10); // 63% do caminho
    expect(arcT(-toU(150))).toBeCloseTo(0.5 + 0.42 * (1 - Math.exp(-1)), 10);
    expect(arcT(toU(10)) < 0.5 && arcT(toU(10)) > arcT(toU(100))).toBe(true); // sempre a afastar-se
    expect(arcT(toU(100000))).toBeGreaterThan(0.08); // nunca chega à ponta
    expect(arcT(toU(100000))).toBeCloseTo(0.08, 6);
  });
});

describe('meses livres', () => {
  it('cheios até à parte inteira e o seguinte com a fração', () => {
    const y = yearFill(3.4);
    expect(y.slice(0, 5).map((v) => +v.toFixed(2))).toEqual([1, 1, 1, 0.4, 0]);
    expect(y).toHaveLength(12);
    expect(yearFill(14).every((v) => v === 1)).toBe(true);
    expect(yearFill(0).every((v) => v === 0)).toBe(true);
  });
});

describe('formatos', () => {
  it('meio-par só ao mostrar', () => {
    expect(eur(617_500)).toBe('6,18'); // 6,175 → 6,18 (8 é par)
    expect(eur(612_500)).toBe('6,12'); // 6,125 → 6,12
    expect(eur(-5_677_500)).toBe('−56,78');
    expect(eur(123_456_700_000, 0)).toBe('1 234 567');
  });
  it('valores escritos à mão', () => {
    expect(parseAmount('12,35')).toBe('12.35');
    expect(parseAmount(' 7 ')).toBe('7.00');
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
  });
});

describe('datas locais', () => {
  it('mudança de hora não salta nem repete dias', () => {
    let d = '2026-03-28';
    const seen = new Set<string>();
    for (let k = 0; k < 4; k++) { seen.add(d); d = addDays(d, 1); }
    expect([...seen]).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(toDateStr(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
    expect(daysInMonth('2028-02')).toBe(29);
    expect(prevMonth('2026-01')).toBe('2025-12');
  });
});

describe('etiquetas de dias', () => {
  it('passado e futuro próximos', async () => {
    const { dayLabel } = await import('../dates');
    expect(dayLabel('2026-10-28', '2026-10-28')).toBe('hoje');
    expect(dayLabel('2026-10-27', '2026-10-28')).toBe('ontem');
    expect(dayLabel('2026-10-29', '2026-10-28')).toBe('amanhã');
    expect(dayLabel('2026-10-30', '2026-10-28')).toBe('daqui a 2 dias');
    expect(dayLabel('2026-11-15', '2026-10-28')).toBe('15 nov');
  });
});
