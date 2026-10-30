import { describe, expect, it } from 'vitest';
import { consumption, fixedIn, flags, forgotten, kmIn, nextYear, period, perKm, anniversary, iucDue, longRun, paymentKind, pricePerLitre, waitingFull, yearlyInsurance, type CarLog } from '../garage';

let n = 0;
const log = (d: string, odo: number | null, litres: number | null, full = true, kind: CarLog['kind'] = 'fuel'): CarLog =>
  ({ id: String(++n), car_id: 'c', logged_on: d, odometer: odo, litres, full_tank: full, kind, expense_id: null, amount: null, created_at: `${d}T10:00:00Z` });

describe('consumo de cheio a cheio', () => {
  it('soma os parciais e divide pelos km entre cheios', () => {
    const logs = [log('2026-07-01', 10000, 30), log('2026-07-10', 10300, 15, false), log('2026-07-20', 10600, 24), log('2026-08-05', 11100, 32)];
    const c = consumption(logs);
    expect(c.segments.map((s) => s.km)).toEqual([600, 500]);
    expect(c.segments[0].litres).toBe(39); // 15 do parcial + 24
    expect(c.avg).toBeCloseTo(((39 + 32) / 1100) * 100, 10);
    expect(c.last).toBeCloseTo(6.4, 10);
  });
  it('um troço sem litros ou sem odómetro fica de fora e conta-se', () => {
    const logs = [log('2026-07-01', 10000, 30), log('2026-07-10', 10300, null, false), log('2026-07-20', 10600, 24), log('2026-08-05', null, 30), log('2026-08-20', 11500, 35)];
    const c = consumption(logs);
    expect(c.segments).toEqual([]); // 1.º: parcial sem litros · 2.º: cheio sem odómetro · 3.º: começa num cheio sem odómetro
    expect(c.skipped).toBe(2);
  });
  it('só os troços que acabam no período; a oficina não entra', () => {
    const logs = [log('2026-06-28', 9400, 30), log('2026-07-01', 10000, 30), log('2026-07-15', 10200, null, true, 'service'), log('2026-08-05', 10600, 36)];
    expect(consumption(logs, { from: '2026-08-01', to: '2026-08-31', label: '' }).segments.map((s) => s.km)).toEqual([600]);
  });
});

describe('km, fixos e €/km', () => {
  const logs = [log('2026-03-02', 20000, 40), log('2026-05-10', 21500, null, true, 'service'), log('2026-09-30', 24800, 38)];
  it('km = último odómetro − primeiro, com todos os registos', () => {
    expect(kmIn(logs, { from: '2026-01-01', to: '2026-12-31', label: '' })).toBe(4800);
    expect(kmIn(logs, { from: '2026-05-01', to: '2026-05-31', label: '' })).toBe(0); // um só registo
  });
  it('fixos proporcionais aos dias em que o carro já era da casa', () => {
    const car = { id: 'c', created_at: '2026-07-01T09:00:00Z', annual_insurance: '365.00', annual_tax: 0, annual_other: 0 };
    expect(fixedIn(car, { from: '2026-01-01', to: '2026-12-31', label: '' }, '2026-07-10')).toBe(10 * 100_000); // 1 a 10 de julho
    expect(fixedIn(car, { from: '2026-01-01', to: '2026-06-30', label: '' }, '2026-10-28')).toBe(0);
    expect(perKm(1000, 0)).toBeNull();
    expect(perKm(30_000_000, 1500)).toBe(20_000); // 300 € / 1 500 km = 0,20 €/km
  });
  it('12 meses completos antes do mês corrente', () => {
    expect(period('12m', '2026-10-28')).toMatchObject({ from: '2025-10-01', to: '2026-09-30' });
    expect(period('year', '2026-10-28')).toMatchObject({ from: '2026-01-01', to: '2026-10-28' });
  });
});

describe('registos a rever e prazos', () => {
  it('sem litros, sem km, km a descer e duplicados', () => {
    const a = log('2026-04-15', 5000, 30), dup = { ...a, id: 'd', created_at: '2026-04-15T11:00:00Z' };
    const noL = log('2026-04-01', 5100, null), noKm = log('2026-04-20', null, 20);
    const f = flags([noL, a, dup, noKm]);
    const of = (id: string) => f.filter((x) => x.id === id).map((x) => x.why);
    expect(of(noL.id)).toEqual(['abastecimento sem litros']);
    expect(of(a.id)).toEqual(['quilómetros abaixo do registo anterior']); // 5 000 depois de 5 100
    expect(of('d')).toContain('possível duplicado');
    expect(of(noKm.id)).toEqual(['sem quilómetros']);
  });
  it('prazo anual: o mesmo dia no ano seguinte', () => {
    expect(nextYear('2026-11-03')).toBe('2027-11-03');
    expect(nextYear('2028-02-29')).toBe('2029-02-28');
  });
});


describe('exatidão quando não se atesta ou se esquece um registo', () => {
  const seq = (pairs: [string, number, number, boolean?][]) => pairs.map(([d, o, l, f]) => log(d, o, l, f ?? true));
  it('troço com abastecimento esquecido fica de fora e a rever', () => {
    const logs = seq([['2026-01-01', 10000, 40], ['2026-02-01', 10600, 38], ['2026-03-01', 11200, 39], ['2026-04-01', 11800, 37], ['2026-05-01', 12900, 40]]); // o último: 1 100 km com 40 L
    const c = consumption(logs);
    expect(c.suspects.map((s) => s.to)).toEqual(['2026-05-01']);
    expect(c.segments).toHaveLength(3);
    expect(c.avg).toBeCloseTo((38 + 39 + 37) / 1800 * 100, 10);
  });
  it('com a capacidade do depósito: mais km do que cabem num depósito', () => {
    const logs = seq([['2026-01-01', 10000, 40], ['2026-02-01', 11300, 80]]); // 1 300 km, 6,2 L/100, depósito de 50 L dá ~800 km
    expect(consumption(logs, undefined, 50).suspects[0].why).toMatch(/não cabem num depósito de 50 L/);
    expect(consumption(logs).suspects).toEqual([]); // sem capacidade, só a mediana (e com 1 troço não há mediana)
  });
  it('longo prazo sem atestar: todos os litros ÷ todos os km, com erro de um depósito', () => {
    const logs = seq([['2026-01-01', 10000, 40], ['2026-01-15', 10400, 20, false], ['2026-02-01', 10900, 25, false], ['2026-02-20', 11500, 30, false]]);
    expect(consumption(logs).segments).toEqual([]); // nunca mais atestou
    const r = longRun(logs, 50)!;
    expect(r.km).toBe(1500);
    expect(r.l100).toBeCloseTo(75 / 1500 * 100, 10);
    expect(r.error).toBeCloseTo(50 / 1500 * 100, 10);
    expect(waitingFull(logs, '2026-03-01')).toBe('nunca');
    expect(waitingFull(seq([['2026-01-01', 10000, 40], ['2026-02-01', 10600, 38]]), '2026-02-10')).toBeNull();
  });
  it('litros estimados pelo preço quando só há o valor', () => {
    const a = { ...log('2026-01-01', 10000, 40), amount: '70.00' }, b = { ...log('2026-02-01', 10600, 38), amount: '68.40' };
    const c = { ...log('2026-03-01', 11200, null), amount: '72.00' };
    expect(pricePerLitre([a, b])).toBeCloseTo((1.75 + 1.8) / 2, 10);
    expect(flags([a, b, c]).find((f) => f.id === c.id)!.why).toMatch(/≈ 40,6 L estimados/);
  });
});

describe('IUC e seguro', () => {
  it('IUC até ao fim do mês da matrícula, todos os anos', () => {
    expect(iucDue('2019-11-12', '2026-10-28')).toBe('2026-11-30');
    expect(iucDue('2019-03-12', '2026-10-28')).toBe('2027-03-31');
  });
  it('renovação do seguro no aniversário', () => {
    expect(anniversary('2024-12-12', '2026-10-28')).toBe('2026-12-12');
    expect(anniversary('2024-02-29', '2026-10-28')).toBe('2027-02-28');
  });
  it('perceber pela nota se um pagamento é do IUC ou do seguro', () => {
    expect(paymentKind('IUC do Golf')).toBe('iuc');
    expect(paymentKind('Imposto Único de Circulação')).toBe('iuc');
    expect(paymentKind('Fidelidade - seguro auto')).toBe('insurance');
    expect(paymentKind('Tranquilidade')).toBe('insurance');
    expect(paymentKind('Galp')).toBeNull();
    expect(yearlyInsurance(32_000_000)).toBe(32_000_000); // 320 €: anual
    expect(yearlyInsurance(2_800_000)).toBe(33_600_000); // 28 €: mensal × 12
  });
});

import { yearFigures } from '../garage';

describe('os números principais do carro', () => {
  const car = { id: 'c', created_at: '2024-01-01T00:00:00Z', annual_insurance: '360.00', annual_tax: '120.00', annual_other: '0' };
  const L = (d: string, odo: number | null, kind: CarLog['kind'], amount: number) => ({ ...log(d, odo, kind === 'fuel' ? 40 : null, true, kind), amount: amount.toFixed(2) });
  it('km do ano reais, com o odómetro de há um ano interpolado', () => {
    const logs = [L('2025-09-28', 30000, 'fuel', 70), L('2025-11-27', 31200, 'fuel', 70), L('2026-10-20', 43000, 'fuel', 70)];
    const f = yearFigures(car, logs, '2026-10-28'); // há 365 dias: 2025-10-28, a meio dos dois primeiros → 30 600
    expect(f.kmYear).toEqual({ km: 12400, estimated: false });
  });
  it('estimados pelo ritmo quando ainda não há um ano de registos', () => {
    const logs = [L('2026-08-01', 10000, 'fuel', 60), L('2026-10-01', 12000, 'fuel', 60)]; // 2 000 km em 61 dias
    const f = yearFigures({ ...car, created_at: '2026-08-01T00:00:00Z' }, logs, '2026-10-28');
    expect(f.kmYear).toEqual({ km: Math.round((2000 / 61) * 365), estimated: true });
  });
  it('fixos por mês: seguro e IUC ÷ 12, mais oficina e outras; sem combustível nem portagens', () => {
    const logs = [L('2026-08-01', 10000, 'fuel', 60), L('2026-08-15', null, 'toll', 12), L('2026-09-10', 10800, 'service', 240), L('2026-10-01', 12000, 'other', 30)];
    const f = yearFigures({ ...car, created_at: '2026-08-01T00:00:00Z' }, logs, '2026-10-28');
    const months = (88 / 30.44); // 1 ago a 28 out
    expect(f.fixedMonth).toBe(Math.round(40 * 100_000 + (270 * 100_000) / months)); // 480 €/ano = 40 €/mês
    expect(f.perKm).not.toBeNull();
  });
});

describe('esqueci-me: abastecimento que faltou, pelas medianas', () => {
  const priced = (d: string, odo: number | null, litres: number, eur: number, full = true): CarLog => ({ ...log(d, odo, litres, full), amount: eur });
  // Três troços normais a 6 L/100 km e um que salta um depósito (1200 km com 36 L = 3 L/100 km).
  const base = [priced('2026-01-01', 10000, 30, 51), priced('2026-01-20', 10500, 30, 51), priced('2026-02-10', 11000, 30, 52.5),
    priced('2026-03-01', 11500, 30, 54), priced('2026-04-02', 12700, 36, 63)];
  it('o troço com um depósito a menos fica a rever', () => {
    const c = consumption(base);
    expect(c.suspects.map((x) => x.km)).toEqual([1200]);
    expect(c.ref).toBe(6);
  });
  it('estima os litros pela mediana do consumo e o valor pelo preço mediano desse intervalo', () => {
    const c = consumption(base), seg = c.suspects[0];
    const f = forgotten(base, seg, c.ref)!;
    expect(f.litres).toBe(36); // 1200 km × 6 L/100 km = 72 L; registados 36
    expect(f.ppl).toBeCloseTo((54 / 30 + 63 / 36) / 2, 10); // os dois abastecimentos do intervalo
    expect(f.amount).toBeCloseTo(36 * f.ppl!, 2);
    expect(f.logged_on).toBe('2026-03-17'); // o meio de 1 mar → 2 abr
  });
  it('com o estimado, o troço conta (à mediana) e sai da revisão; não é marcado por não ter km', () => {
    const c = consumption(base), f = forgotten(base, c.suspects[0], c.ref)!;
    const est: CarLog = { ...log(f.logged_on, null, f.litres, false), amount: f.amount, estimated: true };
    const after = consumption([...base, est]);
    expect(after.suspects).toEqual([]);
    expect(after.segments.at(-1)!.l100).toBeCloseTo(6, 10);
    expect(flags([...base, est])).toEqual([]);
  });
  it('não estima quando não falta nada ou não há referência', () => {
    expect(forgotten(base, { from: '2026-01-01', to: '2026-01-20', km: 500, litres: 40 }, 6)).toBeNull();
    expect(forgotten(base, { from: '2026-01-01', to: '2026-01-20', km: 500, litres: 10 }, null)).toBeNull();
  });
});
