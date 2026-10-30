import { describe, expect, it } from 'vitest';
import { U } from '../money';
import { avgMonthly, badges, celebrate, nextBadge, freeMonths, fundCheck, healthScore, monthPlan, monthlyIncome, monthsAhead, realReturn, savings, suggestGoal, vacationUntil, sourceMonthly, entriesByMonth, splitFunds, cushionMin, netSeries } from '../wealth';

const e = (v: number) => v * U;

describe('fundos: quem pode ser o quê, sem perguntar', () => {
  it('maneio só com dinheiro disponível no próprio dia', () => {
    expect(fundCheck('remunerada', 'cushion').ok).toBe(true);
    expect(fundCheck('ordem', 'cushion').ok).toBe(true);
    expect(fundCheck('aforro', 'cushion').ok).toBe(false);
    expect(fundCheck('etf', 'cushion').ok).toBe(false);
    expect(fundCheck('ppr', 'cushion').ok).toBe(false);
  });
  it('emergência também aceita o que se resgata em dias sem risco de mercado', () => {
    expect(fundCheck('aforro', 'emergency').ok).toBe(true);
    expect(fundCheck('prazo', 'emergency').ok).toBe(true);
    expect(fundCheck('acoes', 'emergency').ok).toBe(false);
    expect(fundCheck('imovel', 'emergency').ok).toBe(false);
    expect(fundCheck('desconhecido', 'emergency').ok).toBe(false); // na dúvida, não conta
  });
});

describe('despesa média', () => {
  const t = [{ month: '2026-07', total: e(2000) }, { month: '2026-08', total: e(2400) }, { month: '2026-10', total: e(900) }];
  it('meses completos desde o primeiro; um mês vazio no meio conta 0; o corrente não conta', () => {
    expect(avgMonthly(t, '2026-10-28')).toEqual({ avg: Math.round(e(4400) / 3), months: 3 }); // jul, ago, set (0)
    expect(avgMonthly(t, '2026-08-15')).toEqual({ avg: e(2000), months: 1 });
    expect(avgMonthly([t[2]], '2026-10-28')).toBeNull(); // só o mês corrente
    expect(avgMonthly([], '2026-10-28')).toBeNull();
  });
  it('no máximo 12 meses', () => {
    const many = Array.from({ length: 20 }, (_, j) => ({ month: `${2025 + Math.floor(j / 12)}-${String((j % 12) + 1).padStart(2, '0')}`, total: e(j < 8 ? 9000 : 1000) }));
    expect(avgMonthly(many, '2026-09-10')).toEqual({ avg: e(1000), months: 12 }); // set 2025 a ago 2026
  });
});

describe('rendimentos e poupança', () => {
  it('o salário paga-se 14 vezes; o subsídio de alimentação 11', () => {
    expect(monthlyIncome([{ amount: e(1500), times_per_year: 14 }, { amount: e(165), times_per_year: 11 }])).toBe(e(1750) + e(151.25));
  });
  it('taxa de poupança e sobra', () => {
    expect(savings(e(4000), e(3000))).toEqual({ surplus: e(1000), rate: 0.25 });
    expect(savings(0, e(100)).rate).toBeNull();
  });
});

describe('plano do mês', () => {
  it('emergência primeiro, depois maneio, depois investir', () => {
    expect(monthPlan(e(1500), e(1000), e(800))).toEqual({ emergency: e(1000), cushion: e(500), invest: 0 });
    expect(monthPlan(e(1500), 0, e(300))).toEqual({ emergency: 0, cushion: e(300), invest: e(1200) });
    expect(monthPlan(e(-200), e(1000), e(800))).toEqual({ emergency: 0, cushion: 0, invest: 0 });
  });
});

describe('meses livres e fôlego', () => {
  const r6 = realReturn(6); // 6% com 2% de inflação ≈ 3,92% real
  it('retorno real', () => {
    expect(r6).toBeCloseTo(0.0392157, 6);
    expect(realReturn(2)).toBeCloseTo(0, 10);
  });
  it('meses livres = rendimento real por ano ÷ despesa do mês; a casa própria não entra', () => {
    const pools = [{ value: e(100_000), real: r6, liq: 'market' as const }, { value: e(300_000), real: 0.05, liq: 'out' as const }];
    expect(freeMonths(pools, e(2000))).toBeCloseTo(1.96, 2);
    expect(freeMonths(pools, 0)).toBe(0);
  });
  it('férias pagas: os meses livres a contar de 1 de janeiro, pelo calendário', () => {
    expect(vacationUntil(5, 2026)).toEqual({ until: '2026-05-31', monthEnd: true, whole: false }); // de janeiro a maio
    expect(vacationUntil(1.4, 2026).until).toBe('2026-02-11'); // 0,4 × 28 dias de fevereiro
    expect(vacationUntil(1.5, 2028).until).toBe('2028-02-14'); // ano bissexto: 0,5 × 29
    expect(vacationUntil(0.5, 2026).until).toBe('2026-01-15');
    expect(vacationUntil(1, 2026)).toEqual({ until: '2026-01-31', monthEnd: true, whole: false });
    expect(vacationUntil(0.02, 2026).until).toBeNull(); // menos de um dia
    expect(vacationUntil(13, 2026)).toEqual({ until: '2026-12-31', monthEnd: true, whole: true });
  });
});

describe('saúde financeira', () => {
  const base = { emergency: e(13_200), emergencyTarget: e(26_400), cushion: e(1_300), savingsRate: 0.1, freeMonths: 1.2 };
  it('35 + 15 + 20 + 30, e o total é a soma das partes arredondadas', () => {
    const s = healthScore(base);
    expect(s.parts.map((p) => p.pts)).toEqual([18, 10, 10, 9]); // 17,5→18 · 9,75→10 · 10 · 30×√0,1=9,49→9
    expect(s.total).toBe(47);
    expect(s.level).toBe('A construir');
    expect(s.next).toEqual({ name: 'Sólida', need: 23 });
  });
  it('o que falta indicar conta 0; tudo completo e 12 meses livres dá 100', () => {
    expect(healthScore({ ...base, savingsRate: null, emergencyTarget: null }).parts.filter((p) => !p.known).map((p) => p.pts)).toEqual([0, 0]);
    const top = healthScore({ emergency: e(30_000), emergencyTarget: e(26_400), cushion: e(5000), savingsRate: 0.35, freeMonths: 14 });
    expect(top.total).toBe(100);
    expect(top.level).toBe('Folgada');
    expect(top.next).toBeNull();
  });
  it('conquistas', () => {
    const b = badges(base);
    expect(b.map((x) => x.k)).toEqual(['cushion', 'emergency', 'save20', 'free12']); // só objetivos inteiros
    expect(b.filter((x) => x.got)).toEqual([]); // meio fundo de emergência não é uma conquista
    expect(b.find((x) => x.k === 'cushion')!.p).toBeCloseTo(0.65, 10); // 1 300 de 2 000 €
    expect(b.find((x) => x.k === 'free12')!.p).toBeCloseTo(0.1, 10);
    expect(b.every((x) => x.p >= 0 && x.p <= 1)).toBe(true);
    expect(nextBadge(b)!.k).toBe('cushion'); // a mais perto de ganhar
  });
  it('celebrar: a conquista inteira, e os marcos só quando ainda falta mais de um mês', () => {
    const at = (p: Record<string, number>) => Object.entries(p).map(([k, v]) => ({ k, p: v, got: v >= 1 }));
    expect(celebrate(null, at({ emergency: 0.6 }))).toEqual({ won: [], milestone: null }); // primeira visita
    expect(celebrate({ emergency: 0.2 }, at({ emergency: 0.6 }), { emergency: 3 }).milestone?.label).toBe('meio fundo de emergência');
    expect(celebrate({ emergency: 0.2 }, at({ emergency: 1 }))).toEqual({ won: ['emergency'], milestone: null }); // de 0 a 100: só a conquista
    expect(celebrate({ emergency: 0.4 }, at({ emergency: 0.55 }), { emergency: 0.8 }).milestone).toBeNull(); // fica completo no mês a seguir
    expect(celebrate({ free12: 0.05 }, at({ free12: 0.27 })).milestone?.label).toBe('três meses livres'); // passou dois: o mais alto
    expect(celebrate({ emergency: 1 }, at({ emergency: 1 })).won).toEqual([]); // já estava ganha
    expect(celebrate({}, at({ save20: 1 })).won).toEqual([]); // conquista que ainda não se via
    expect(celebrate({ emergency: 0.3, free12: 0.05 }, at({ emergency: 0.6, free12: 0.1 }), { emergency: 4 }).milestone?.k).toBe('emergency'); // um de cada vez
  });
  it('objetivo sugerido: o primeiro passo que falta, com prazo pela sobra', () => {
    const plan = monthPlan(e(1500), e(13_200), e(700));
    const g = suggestGoal({ ...base, plan }, 47, '2026-10-28')!;
    expect(g.metric).toBe('fund:emergency');
    expect(g.due).toBe('2027-07-31'); // 13 200 € a 1 500 €/mês: 9 meses
    expect(suggestGoal({ ...base, plan }, 75, '2026-10-28')).toBeNull();
    const g2 = suggestGoal({ ...base, emergency: e(30_000), plan: monthPlan(e(400), 0, e(700)) }, 50, '2026-10-28')!;
    expect(g2.metric).toBe('fund:cushion');
    expect(g2.due).toBe('2026-12-31'); // 700 € a 400 €/mês: 2 meses
    expect(monthsAhead('2026-12-15', 2)).toBe('2027-02-28');
  });
});

describe('rendimentos: fixos ou pelos registos', () => {
  const E = (income_id: string, received_on: string, eur: number) => ({ income_id, received_on, amount: eur * U });
  it('fixo: valor × vezes por ano ÷ 12', () => {
    expect(sourceMonthly({ id: 's', mode: 'fixed', amount: 1400 * U, times_per_year: 14 }, [], '2026-10-29')).toBe(Math.round((1400 * U * 14) / 12));
  });
  it('pelos registos: média dos meses completos desde a primeira entrada (o mês corrente não conta)', () => {
    const es = [E('r', '2026-07-25', 1500), E('r', '2026-08-25', 1500), E('r', '2026-09-25', 1500), E('r', '2026-09-30', 300), E('r', '2026-10-25', 9999), E('x', '2026-09-01', 50)];
    expect(sourceMonthly({ id: 'r', mode: 'log', amount: null, times_per_year: 12 }, es, '2026-10-29')).toBe(1600 * U); // (1500+1500+1800)/3
  });
  it('no máximo 12 meses; meses sem entradas contam como zero', () => {
    const es = [E('r', '2025-01-10', 12000), E('r', '2026-06-10', 1200)];
    expect(sourceMonthly({ id: 'r', mode: 'log', amount: null, times_per_year: 12 }, es, '2026-10-29')).toBe(100 * U); // out/25 → set/26: só os 1200
  });
  it('só entradas no mês corrente: conta o que já entrou', () => {
    expect(sourceMonthly({ id: 'r', mode: 'log', amount: null, times_per_year: 12 }, [E('r', '2026-10-02', 900)], '2026-10-29')).toBe(900 * U);
  });
  it('entradas por mês, do mais recente', () => {
    const m = entriesByMonth([E('r', '2026-09-25', 1500), E('r', '2026-10-25', 1500), E('r', '2026-09-30', 300)]);
    expect(m.map((x) => [x.month, x.total / U, x.items.length])).toEqual([['2026-10', 1500, 1], ['2026-09', 1800, 2]]);
  });
});

describe('o excedente do fundo de emergência passa para o fundo de maneio', () => {
  it('enche primeiro com o que demora dias; o excedente disponível já passa', () => {
    const r = splitFunds([{ value: 8000 * U, liq: 'days' }, { value: 10000 * U, liq: 'now' }], [{ value: 500 * U }], 15000 * U);
    expect([r.emergency, r.cushion, r.overflow].map((v) => v / U)).toEqual([15000, 3500, 3000]);
  });
  it('excedente em Certificados de Aforro não passa (não está disponível no próprio dia)', () => {
    const r = splitFunds([{ value: 20000 * U, liq: 'days' }], [], 15000 * U);
    expect([r.emergency, r.cushion, r.overflow].map((v) => v / U)).toEqual([15000, 0, 0]);
  });
  it('abaixo da meta, nada passa; sem meta, nada passa', () => {
    expect(splitFunds([{ value: 5000 * U, liq: 'now' }], [{ value: 1 * U }], 15000 * U).overflow).toBe(0);
    expect(splitFunds([{ value: 5000 * U, liq: 'now' }], [], null)).toEqual({ emergency: 5000 * U, cushion: 0, overflow: 0 });
  });
});

describe('cushionMin', () => {
  it('2 000 € por adulto e mais 500 € por cada filho', () => {
    expect(cushionMin()).toBe(2_000 * U);
    expect(cushionMin(0, 2)).toBe(4_000 * U);
    expect(cushionMin(1, 2)).toBe(4_500 * U);
    expect(cushionMin(3, 1)).toBe(3_500 * U);
  });
  it('na vista de uma pessoa: os seus 2 000 € e a sua parte dos filhos', () => {
    expect(cushionMin(2, 1, 0.5)).toBe(2_500 * U);
    expect(cushionMin(0, 1, 0.5)).toBe(2_000 * U);
  });
  it('ignora valores sem sentido', () => {
    expect(cushionMin(-2)).toBe(2_000 * U);
    expect(cushionMin(NaN)).toBe(2_000 * U);
  });
});

describe('netSeries', () => {
  const A = [{ id: 'a', part: 1, archived: false }, { id: 'b', part: 0.5, archived: false }, { id: 'c', part: 0, archived: false }];
  it('em cada dia soma o último valor de cada ativo, pela parte de quem vê', () => {
    const s = netSeries(A, [
      { asset_id: 'a', on_date: '2026-01-10', value: 100 },
      { asset_id: 'b', on_date: '2026-02-01', value: 200 },
      { asset_id: 'c', on_date: '2026-02-01', value: 999 },
      { asset_id: 'a', on_date: '2026-03-05', value: 150 },
    ]);
    expect(s).toEqual([{ on: '2026-01-10', v: 100 }, { on: '2026-02-01', v: 200 }, { on: '2026-03-05', v: 250 }]);
  });
  it('vários valores no mesmo dia dão um ponto só', () => {
    expect(netSeries(A, [{ asset_id: 'b', on_date: '2026-01-01', value: 40 }, { asset_id: 'a', on_date: '2026-01-01', value: 10 }])).toEqual([{ on: '2026-01-01', v: 30 }]);
  });
  it('um ativo retirado conta só até ao último valor registado', () => {
    const s = netSeries([{ id: 'a', part: 1, archived: true }, { id: 'b', part: 1, archived: false }], [
      { asset_id: 'a', on_date: '2026-01-01', value: 100 },
      { asset_id: 'b', on_date: '2026-02-01', value: 50 },
    ]);
    expect(s).toEqual([{ on: '2026-01-01', v: 100 }, { on: '2026-02-01', v: 50 }]);
  });
  it('sem valores, sem pontos', () => expect(netSeries(A, [])).toEqual([]));
});
