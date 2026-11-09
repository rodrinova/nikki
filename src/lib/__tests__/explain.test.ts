import { describe, expect, it } from 'vitest';
import { explainCats, explainPace, explainYear } from '../explain';

const R = 'r';
let n = 0;
const e = (spent_on: string, amount: number, category: string, note: string | null = null) => ({ id: String(n++), paid_by: R, other_id: null, amount, split: 'mine' as const, payer_share: null, spent_on, category, note });
const u = (eur: number) => Math.round(eur * 100_000);

describe('explainPace', () => {
  it('perto do normal (menos de 5%): em linha', () => {
    expect(explainPace({ everyday: u(700), normal: u(1070), share: 0.64, forecast: u(1085), day: 9 }))
      .toBe('Até ao dia 9, o dia a dia vai em linha com um mês normal (700 €). A este ritmo, fecha perto do normal, em 1 085 €.');
  });
  it('bem abaixo', () => {
    expect(explainPace({ everyday: u(300), normal: u(1000), share: 0.5, forecast: u(800), day: 15 }))
      .toBe('Até ao dia 15, o dia a dia vai 200 € abaixo de um mês normal (300 € para 500 €). A este ritmo, fecha em 800 €, 20% abaixo do normal.');
  });
});

describe('explainCats', () => {
  const ex = [e('2026-11-02', 120, 'Restaurantes', 'Jantar de anos'), e('2026-11-05', 30, 'Restaurantes'), e('2026-11-03', 20, 'Carros')];
  it('no mês a decorrer: a que vai à frente, com o que pesou', () => {
    const r = explainCats({ byCat: [['Restaurantes', u(150)], ['Carros', u(20)]], normals: { Restaurantes: u(120), Carros: u(100) }, share: 0.6, current: true, expenses: ex, who: R, key: '2026-11' });
    expect(r.text).toBe('Restaurantes vai à frente: 150 € até hoje, quando num mês normal por esta altura são 72 € (pesou Jantar de anos, 120 €). Carros vai 67% abaixo.');
    expect(r.marks).toEqual(['Restaurantes', 'Carros']);
    // No início do mês, «abaixo» ainda não é notícia.
    expect(explainCats({ byCat: [['Restaurantes', u(150)], ['Carros', u(20)]], normals: { Restaurantes: u(120), Carros: u(100) }, share: 0.3, current: true, expenses: ex, who: R, key: '2026-11' }).marks).toEqual(['Restaurantes']);
  });
  it('a renda do dia 1 não faz a Casa ir «à frente»', () => {
    const ex2 = [e('2026-10-01', 900, 'Casa', 'Renda'), e('2026-11-01', 900, 'Casa', 'Renda'), e('2026-11-04', 60, 'Casa', 'Lâmpadas')];
    const r = explainCats({ byCat: [['Casa', u(960)]], normals: { Casa: u(1000) }, share: 0.3, current: true, expenses: ex2, who: R, key: '2026-11' });
    expect(r.text).toBe('Todas as categorias vão dentro do habitual para esta altura do mês.');
    expect(r.fixed).toBe('Casa (Renda): a maior parte é o que se paga todos os meses, logo no início.');
  });
  it('num mês fechado e sem surpresas', () => {
    expect(explainCats({ byCat: [['Restaurantes', u(118)]], normals: { Restaurantes: u(120) }, share: 1, current: false, expenses: [], who: R, key: '2026-10' }).text)
      .toBe('Todas as categorias ficaram perto do normal.');
  });
});

describe('explainYear', () => {
  it('o mês mais caro e porquê, o mais leve e o mês a decorrer', () => {
    const months = [{ key: '2026-08', total: u(900), current: false }, { key: '2026-09', total: u(878), current: false }, { key: '2026-10', total: u(1261), current: false }, { key: '2026-11', total: u(700), current: true }];
    const r = explainYear({ months, normal: u(1070), forecast: u(1085), expenses: [e('2026-09-01', 450, 'Casa', 'Renda'), e('2026-10-01', 450, 'Casa', 'Renda'), e('2026-10-03', 445, 'Casa', 'Sofá: o resto'), e('2026-10-10', 30, 'Supermercado')], who: R });
    expect(r.text).toBe('Outubro foi o mês mais caro (1 261 €, 18% acima do normal), sobretudo por Sofá: o resto (445 €). O mais leve foi setembro (878 €). Novembro vai a caminho do normal (1 085 €).');
    expect(r.marks).toEqual(['2026-10', '2026-09']);
  });
});
