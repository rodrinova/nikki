import { describe, expect, it } from 'vitest';
import { countdown, sortOccasions, summary, type Gift, type Guest, type Occasion, type OccItem, type Vendor } from '../occasions';

const U = 100_000;
const o: Occasion = { id: 'b', name: 'Batizado', kind: 'batizado', on_date: '2026-11-20', place: null, budget: '1500', archived: false, created_at: '2026-10-01T10:00:00Z' };

describe('resumo de um evento', () => {
  const ex = [{ amount: '400', occasion_id: 'b' }, { amount: '120.50', occasion_id: 'b' }, { amount: '99', occasion_id: null }, { amount: '50', occasion_id: 'x' }];
  const gs: Guest[] = [
    { id: '1', occasion_id: 'b', name: 'Avós', people: 2, rsvp: 'yes', grp: 'Família', note: null },
    { id: '2', occasion_id: 'b', name: 'Tios', people: 3, rsvp: 'pending', grp: 'Família', note: null },
    { id: '3', occasion_id: 'b', name: 'Rui', people: 1, rsvp: 'no', grp: null, note: null },
    { id: '4', occasion_id: 'x', name: 'Outro', people: 9, rsvp: 'yes', grp: null, note: null },
  ];
  const its: OccItem[] = [
    { id: 'a', occasion_id: 'b', kind: 'todo', title: 'Reservar restaurante', due_on: '2026-10-20', done: false },
    { id: 'c', occasion_id: 'b', kind: 'buy', title: 'Velas', due_on: null, done: false },
    { id: 'd', occasion_id: 'b', kind: 'todo', title: 'Padrinhos', due_on: '2026-10-01', done: true },
  ];
  const vs: Vendor[] = [{ id: 'v', occasion_id: 'b', name: 'Quinta', service: 'Almoço', contact: null, total: '900', paid: '300' }];
  const gf: Gift[] = [{ id: 'g', occasion_id: 'b', from_name: 'Avós', amount: '200', item: null, thanked: false }, { id: 'h', occasion_id: 'b', from_name: 'Rui', amount: null, item: 'Fio de ouro', thanked: true }];
  const s = summary(o, ex, gs, its, vs, gf, '2026-10-29');
  it('gasto, orçamento e o que falta pagar', () => {
    expect(s.spent).toBe(520.5 * U);
    expect(s.left).toBe(979.5 * U);
    expect(s.committed).toBe(600 * U);
    expect(s.forecast).toBe(1120.5 * U);
  });
  it('presentes em dinheiro descontam no custo final', () => {
    expect(s.gifts).toBe(200 * U);
    expect(s.net).toBe(320.5 * U);
    expect(s.thanks).toBe(1);
  });
  it('pessoas: confirmadas, convidadas (sem os «não») e convites à espera', () => {
    expect([s.people, s.invited, s.waiting]).toEqual([2, 5, 1]);
  });
  it('por fazer e atrasadas; dias até ao evento', () => {
    expect([s.todo, s.late, s.days]).toEqual([2, 1, 22]);
  });
  it('sem orçamento, sem «left»', () => {
    expect(summary({ ...o, budget: null }, ex, [], [], [], [], '2026-10-29').left).toBeNull();
  });
});

describe('contagem e ordem', () => {
  it('diz quanto falta ou há quanto foi', () => {
    expect([countdown(0), countdown(1), countdown(12), countdown(-1), countdown(-30), countdown(null)]).toEqual(['hoje', 'amanhã', 'daqui a 12 dias', 'foi ontem', 'foi há 30 dias', 'sem data']);
  });
  it('ativos pelo mais próximo (sem data no fim); arquivados do mais recente', () => {
    const xs = [{ ...o, id: '1', on_date: '2027-01-01' }, { ...o, id: '2', on_date: null }, { ...o, id: '3', on_date: '2026-11-01' }, { ...o, id: '4', archived: true, on_date: '2025-06-01' }, { ...o, id: '5', archived: true, on_date: '2026-06-01' }];
    const r = sortOccasions(xs);
    expect(r.active.map((x) => x.id)).toEqual(['3', '1', '2']);
    expect(r.archived.map((x) => x.id)).toEqual(['5', '4']);
  });
});
