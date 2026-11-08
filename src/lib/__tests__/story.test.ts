import { describe, expect, it } from 'vitest';
import { rangeLabel, weekRange, weekStory, yearStory } from '../story';

const R = 'r', I = 'i';
let n = 0;
const e = (spent_on: string, amount: number, category = 'Supermercado', note = 'Continente', split: 'mine' | 'shared' = 'mine') =>
  ({ id: String(n++), paid_by: R, other_id: split === 'shared' ? I : null, amount, split, payer_share: split === 'shared' ? 0.5 : null, spent_on, category, note });

describe('weekRange', () => {
  it('ao domingo, a semana que acaba; noutros dias, a anterior', () => {
    expect(weekRange('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // domingo
    expect(weekRange('2026-11-09')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // segunda
    expect(weekRange('2026-11-12')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // quinta
  });
  it('a etiqueta', () => {
    expect(rangeLabel('2026-11-02', '2026-11-08')).toBe('2 a 8 de novembro');
    expect(rangeLabel('2026-10-26', '2026-11-01')).toBe('26 de outubro a 1 de novembro');
  });
});

describe('weekStory', () => {
  const base = { today: '2026-11-08', me: R, meName: 'Tiago', partner: { id: I, name: 'Marta' }, todosDone: [], next: [], items: [] };
  it('dinheiro face a uma semana normal e onde mais', () => {
    const s = weekStory({ ...base, expenses: [e('2026-11-03', 50), e('2026-11-05', 40, 'Restaurantes', 'Jantar', 'shared'), e('2026-10-30', 999)], normalMonth: 30_400_000 });
    const m = s.cards.find((c) => c.k === 'money')!;
    expect(m.big).toBe('70'); // 50 + metade de 40
    expect(m.line).toBe('Uma semana normal. Nada a apontar.'); // 304 € × 7 / 30,4 = 70 €
    expect(m.foot).toBe('Onde mais: Supermercado (50 €)');
  });
  it('agenda, feito e a seguir', () => {
    const s = weekStory({ ...base, expenses: [], normalMonth: null,
      items: [{ day: '2026-11-05', title: 'Treino', kind: 'event' }, { day: '2026-11-05', title: 'Jantar', kind: 'event' }, { day: '2026-11-06', title: 'Pilates', kind: 'event' }],
      todosDone: [{ done_at: '2026-11-04T10:00:00Z', done_by: R }, { done_at: '2026-11-07T10:00:00Z', done_by: I }, { done_at: '2026-10-01T10:00:00Z', done_by: I }],
      next: [{ day: '2026-11-12', title: 'Dentista', kind: 'event' }] });
    expect(s.cards.find((c) => c.k === 'agenda')).toMatchObject({ big: '3', line: 'Quinta foi o dia mais cheio (2).' });
    expect(s.cards.find((c) => c.k === 'done')).toMatchObject({ big: '2', line: 'Tu 1, Marta 1. Equipa.' });
    expect(s.cards.find((c) => c.k === 'next')).toMatchObject({ big: '1', line: 'Dentista (quinta).' });
    expect(s.cards.at(-1)!.big).toBe('Boa semana.');
  });
});

describe('yearStory', () => {
  it('os números do ano', () => {
    const ex = [e('2026-01-10', 100), e('2026-02-10', 300), e('2026-03-05', 30, 'Restaurantes', 'Tasca'), e('2026-04-05', 80, 'Restaurantes', 'Sushi'), e('2026-05-05', 20, 'Restaurantes', 'Café'), e('2025-12-31', 5000)];
    const c = yearStory({ year: 2026, me: R, meName: 'Tiago', partner: { id: I, name: 'Marta' }, expenses: ex, items: [], products: [], transfers: [{ from_id: R, to_id: I, amount: 200, made_on: '2026-06-01' }], occasions: [{ name: 'Batizado', on_date: '2026-06-20' }], lead: 'Adiantaste mais' });
    expect(c.find((x) => x.k === 'money')).toMatchObject({ big: '530', line: 'O mês mais leve foi maio (20 €). O mais pesado, fevereiro (300 €).' });
    expect(c.find((x) => x.k === 'cat')).toMatchObject({ big: 'Supermercado' });
    expect(c.find((x) => x.k === 'out')).toMatchObject({ big: '3', line: 'A mais cara: Sushi (80 €).' });
    expect(c.find((x) => x.k === 'occ')).toMatchObject({ big: '1', line: 'Batizado.' });
    expect(c.find((x) => x.k === 'us')).toMatchObject({ big: '200', line: '1 transferência. A balança acaba o ano assim: adiantaste mais.' });
    expect(c.at(-1)!.big).toBe('Venha 2027.');
    // Com o mês a decorrer (maio), o mais leve é só entre os que acabaram.
    const c2 = yearStory({ year: 2026, today: '2026-05-20', me: R, meName: 'Tiago', expenses: ex, items: [], products: [], transfers: [], occasions: [] });
    expect(c2.find((x) => x.k === 'money')!.line).toBe('O mês mais leve foi março (30 €). O mais pesado, fevereiro (300 €).');
  });
});
