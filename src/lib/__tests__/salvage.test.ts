import { describe, expect, it } from 'vitest';
import { carNumbers, flipCar, flipPatch, totals, type SalvageCar } from '../salvage';
import { toU } from '../money';

const car = (p: Partial<SalvageCar>): SalvageCar => ({
  id: 'c', name: 'Golf', bought_on: '2026-01-01', price: '2000.00', price_me: null, price_paid_by: 'me', hour_rate: '40', status: 'repair',
  sold_on: null, sold_for: null, sale_to: 'me', logs: [], ...p,
});

describe('salvados: a conta corrente', () => {
  // Compra 2000 a meias; peças 300 (Pedro) e 200 (Rodrigo); o Rodrigo transfere 100; 10 h a 40 €/h; venda 3500 (recebe o Rodrigo).
  const golf = car({
    status: 'sold', sold_on: '2026-04-01', sold_for: '3500.00',
    logs: [
      { id: '1', kind: 'part', on_date: '2026-01-10', amount: '300.00', hours: null, note: 'Farol', paid_by: 'partner' },
      { id: '2', kind: 'part', on_date: '2026-01-12', amount: '200.00', hours: null, note: 'Pneus', paid_by: 'me' },
      { id: '3', kind: 'transfer', on_date: '2026-01-13', amount: '100.00', hours: null, note: null, paid_by: 'me' },
      { id: '4', kind: 'hours', on_date: '2026-01-15', amount: null, hours: '10', note: null, paid_by: 'partner' },
    ],
  });
  const x = carNumbers(golf, '2026-11-05');
  it('custo a 40 €/h e lucro', () => {
    expect(x.cost).toBe(toU('2900'));
    expect(x.profit).toBe(toU('600'));
    expect(x.days).toBe(90);
  });
  it('a conta corrente: metade das peças, menos o transferido, mais 20 €/h, mais metade da venda', () => {
    expect(x.parts).toEqual({ fromPrice: 0, fromReg: 0, fromParts: toU('50'), fromTransfers: toU('-100'), fromHours: toU('200'), fromSale: toU('1750') });
    expect(x.owe).toBe(toU('1900'));
  });
  it('no fim, cada um fica com metade do lucro (o Pedro também com as horas)', () => {
    const rodrigo = 3500 - (1000 + 200 + 100) - 1900, pedro = 100 + 1900 - (1000 + 300);
    expect(rodrigo).toBe(300);
    expect(pedro - 400).toBe(300);
  });
  it('a compra: quem pagou mais do que metade fica a haver', () => {
    expect(carNumbers(car({ price_me: '1500.00' }), '2026-02-01').parts.fromPrice).toBe(toU('-500'));
    expect(carNumbers(car({ price_me: '0' }), '2026-02-01').owe).toBe(toU('1000'));
  });
  it('antes da venda: o meu dinheiro conta como investido', () => {
    const t = totals([golf, car({ id: 'd', price: '1000.00' })], '2026-11-05');
    expect(t.invested).toBe(toU('500'));
    expect(t.myProfit).toBe(toU('300'));
    expect(t.owe).toBe(toU('1900'));
  });
});

describe('salvados: registo e a vista do sócio', () => {
  const kia = car({
    price: '3000.00', price_me: '1000.00', reg_cost: '200.00', reg_paid_by: 'me',
    logs: [
      { id: '1', kind: 'part', on_date: '2026-01-10', amount: '1150.00', hours: null, note: 'Airbags', paid_by: 'partner' },
      { id: '2', kind: 'transfer', on_date: '2026-01-13', amount: '575.00', hours: null, note: null, paid_by: 'me' },
      { id: '3', kind: 'hours', on_date: '2026-01-15', amount: null, hours: '5', note: null, paid_by: 'partner' },
    ],
  });
  const x = carNumbers(kia, '2026-02-01');
  it('o registo entra no custo e na conta corrente', () => {
    expect(x.cost).toBe(toU('4550'));
    expect(x.parts.fromReg).toBe(toU('-100'));
    // compra: pagou 1000 de 3000 → +500; registo −100; peças +575; transf. −575; horas +100
    expect(x.owe).toBe(toU('500'));
    expect(x.moneyMe).toBe(toU('1000') + toU('200') + toU('575'));
  });
  it('do lado do sócio, a conta é a mesma ao contrário', () => {
    const y = carNumbers(flipCar(kia), '2026-02-01');
    expect(y.owe).toBe(-x.owe);
    expect(y.cost).toBe(x.cost);
    expect(y.priceMe).toBe(toU('2000'));
    expect(y.hours).toBe(5);
  });
  it('vendido: a conta inverte também com a venda', () => {
    const s = { ...kia, status: 'sold' as const, sold_on: '2026-03-01', sold_for: '6000.00', sale_to: 'partner' as const };
    expect(carNumbers(flipCar(s), '2026-11-05').owe).toBe(-carNumbers(s, '2026-11-05').owe);
  });
  it('o que o sócio grava volta ao lado do dono', () => {
    expect(flipPatch({ paid_by: 'me', kind: 'part' })).toEqual({ paid_by: 'partner', kind: 'part' });
    expect(flipPatch({ price_me: '2000.00' }, '3000.00')).toEqual({ price_me: '1000' });
    expect(flipPatch({ reg_paid_by: 'half' })).toEqual({ reg_paid_by: 'half' });
  });
});
