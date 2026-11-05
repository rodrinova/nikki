import { describe, expect, it } from 'vitest';
import { carNumbers, totals, type SalvageCar } from '../salvage';
import { toU } from '../money';

const car = (p: Partial<SalvageCar>): SalvageCar => ({
  id: 'c', name: 'Golf', bought_on: '2026-01-01', price: '2000.00', price_paid_by: 'me', hour_rate: '40', status: 'repair',
  sold_on: null, sold_for: null, sale_to: 'me', logs: [], ...p,
});

describe('salvados', () => {
  // Compra 2000 (pagou o Rodrigo), peças 300 (pagou o Pedro) e 200 (Rodrigo), 10 h a 40 €/h, venda 3500.
  const golf = car({
    status: 'sold', sold_on: '2026-04-01', sold_for: '3500.00',
    logs: [
      { id: '1', kind: 'part', on_date: '2026-01-10', amount: '300.00', hours: null, note: 'Farol', paid_by: 'partner' },
      { id: '2', kind: 'part', on_date: '2026-01-12', amount: '200.00', hours: null, note: 'Pneus', paid_by: 'me' },
      { id: '3', kind: 'hours', on_date: '2026-01-15', amount: null, hours: '10', note: null, paid_by: 'partner' },
    ],
  });
  const x = carNumbers(golf, '2026-11-05');
  it('custo a 40 €/h e lucro', () => {
    expect(x.labor).toBe(toU('400'));
    expect(x.cost).toBe(toU('2900'));
    expect(x.profit).toBe(toU('600'));
    expect(x.roi).toBeCloseTo(600 / 2900, 6);
    expect(x.days).toBe(90);
  });
  it('acerto: cada um recupera, o lucro vai a meias, o Pedro recebe as horas', () => {
    // Pedro: 300 (peças) + 400 (horas: 200 dele em trabalho + 200 que o Rodrigo lhe paga) + 300 (metade do lucro)
    expect(x.partnerGets).toBe(toU('1000'));
    // Rodrigo: 2200 (compra e pneus) + 300 (metade do lucro)
    expect(x.meGets).toBe(toU('2500'));
    expect(x.settle).toEqual({ from: 'me', to: 'partner', amount: toU('1000') });
  });
  it('antes da venda: o meu dinheiro conta como investido', () => {
    const t = totals([golf, car({ id: 'd', price: '1000.00' })], '2026-11-05');
    expect(t.invested).toBe(toU('1000'));
    expect(t.myProfit).toBe(toU('300'));
    expect(t.sold).toBe(1);
  });
});
