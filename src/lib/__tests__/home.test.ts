import { describe, expect, it } from 'vitest';
import { annualOf, billStats, defaultPeriod, imiNext, imiPlan, invoiceToLink, looksLikeAdjustment, matchBill, nextDue, partOfBill, spread, typical, unpaidInvoice, type Bill, type BillPayment } from '../home';

const U = 100_000;
const bill = (o: Partial<Bill>): Bill => ({ id: 'b', kind: 'luz', name: 'Luz', provider: null, keywords: null, every_months: 1, due_day: null, expected: null, unit: null, contract_ends_on: null, archived: false, ...o });
let n = 0;
const pay = (bill_id: string, amount: number, from: string, to: string, o: Partial<BillPayment> = {}): BillPayment =>
  ({ id: `p${n++}`, bill_id, expense_id: null, amount, period_from: from, period_to: to, usage: null, adjustment: false, created_at: `${to}T12:00:00Z`, ...o });

describe('reconhecer uma conta fixa', () => {
  const luz = bill({ id: 'luz', provider: 'EDP', keywords: 'e-redes', expected: 60, due_day: 12 });
  const agua = bill({ id: 'agua', kind: 'agua', name: 'Água', provider: 'EPAL', expected: 25 });
  const net = bill({ id: 'net', kind: 'internet', name: 'Internet', provider: 'MEO', expected: 45 });
  const tlm = bill({ id: 'tlm', kind: 'telemovel', name: 'Telemóveis', provider: 'MEO', expected: 20 });

  it('pelo fornecedor, com o valor a variar', () => {
    expect(matchBill({ note: 'EDP outubro', amount: 74 * U, spent_on: '2026-10-11', category: 'Contas' }, [luz, agua], []).sure?.id).toBe('luz');
  });
  it('pelas palavras do tipo, sem acentos', () => {
    expect(matchBill({ note: 'Água', amount: 22 * U, spent_on: '2026-10-03', category: 'Contas' }, [luz, agua], []).sure?.id).toBe('agua');
  });
  it('só nas categorias das contas', () => {
    expect(matchBill({ note: 'EDP', amount: 60 * U, spent_on: '2026-10-12', category: 'Lazer' }, [luz], [])).toEqual({ sure: null, ask: [] });
  });
  it('duas do mesmo fornecedor: o valor desempata', () => {
    expect(matchBill({ note: 'MEO', amount: 46 * U, spent_on: '2026-10-05', category: 'Contas' }, [net, tlm], []).sure?.id).toBe('net');
  });
  it('duas do mesmo fornecedor: cada uma pelo seu valor', () => {
    expect(matchBill({ note: 'MEO', amount: 24 * U, spent_on: '2026-10-05', category: 'Contas' }, [net, tlm], []).sure?.id).toBe('tlm');
  });
  it('só uma com palavras: é essa, mesmo muito acima (um acerto)', () => {
    expect(matchBill({ note: 'EDP acerto', amount: 230 * U, spent_on: '2026-10-05', category: 'Contas' }, [luz, agua, bill({ id: 's', kind: 'seguro', name: 'Seguro', expected: 210 })], []).sure?.id).toBe('luz');
  });
  it('duas do mesmo fornecedor com valores parecidos: pergunta', () => {
    const casa = bill({ id: 'a', provider: 'EDP', expected: 60 }), praia = bill({ id: 'b', name: 'Luz da praia', provider: 'EDP', expected: 55 });
    const r = matchBill({ note: 'EDP', amount: 58 * U, spent_on: '2026-10-05', category: 'Contas' }, [casa, praia], []);
    expect(r.sure).toBeNull();
    expect(r.ask.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });
  it('sem nota, pelo valor: pergunta', () => {
    const r = matchBill({ note: '', amount: 61 * U, spent_on: '2026-10-12', category: 'Contas' }, [luz, agua], []);
    expect(r.sure).toBeNull();
    expect(r.ask[0].id).toBe('luz');
  });
  it('o normal aprende com as faturas (mediana, sem acertos)', () => {
    const ps = [pay('luz', 50, '2026-06-01', '2026-06-30'), pay('luz', 70, '2026-07-01', '2026-07-31'), pay('luz', 64, '2026-08-01', '2026-08-31'), pay('luz', 300, '2026-01-01', '2026-06-30', { adjustment: true })];
    expect(typical(luz, ps)).toBe(64 * U);
    expect(looksLikeAdjustment(140 * U, 64 * U)).toBe(true);
    expect(looksLikeAdjustment(80 * U, 64 * U)).toBe(false);
  });
});

describe('período de uma fatura', () => {
  it('luz paga em outubro é de setembro; água bimestral, de agosto e setembro', () => {
    expect(defaultPeriod('luz', 1, '2026-10-12')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(defaultPeriod('agua', 2, '2026-10-05')).toEqual({ from: '2026-08-01', to: '2026-09-30' });
  });
  it('renda paga adiantada: o próprio mês', () => {
    expect(defaultPeriod('renda', 1, '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('repartir e médias', () => {
  it('uma fatura de 2 meses reparte pelos dias', () => {
    const m = spread([pay('a', 61, '2026-08-01', '2026-09-30', { usage: 12.2 })]);
    expect(Math.round(m.get('2026-08')!.amount)).toBe(31 * U);
    expect(Math.round(m.get('2026-09')!.amount)).toBe(30 * U);
    expect(m.get('2026-09')!.usage).toBeCloseTo(6, 5);
  });
  it('€ por mês, consumo, preço por kWh e o ano anterior; o mês corrente fica de fora', () => {
    const b = bill({ id: 'l', unit: 'kWh' }), ps: BillPayment[] = [];
    for (let m = 1; m <= 12; m++) {
      const k = (y: number) => `${y}-${String(m).padStart(2, '0')}`, end = (y: number) => `${k(y)}-${new Date(y, m, 0).getDate()}`;
      ps.push(pay('l', 50, `${k(2024)}-01`, end(2024), { usage: 250 }), pay('l', 60, `${k(2025)}-01`, end(2025), { usage: 250 }));
    }
    ps.push(pay('l', 999, '2026-01-01', '2026-01-31', { usage: 1 }));
    const s = billStats(b, ps, '2026-01-20');
    expect(s.perMonth).toBe(60 * U);
    expect(s.months).toBe(12);
    expect(s.usageMonth).toBeCloseTo(250, 5);
    expect(s.unitPrice! / U).toBeCloseTo(0.24, 5);
    expect(s.priceChange).toBeCloseTo(0.2, 5);
    expect(s.yoy).toBeCloseTo(0.2, 5);
  });
  it('um acerto entra no período que corrige', () => {
    const b = bill({ id: 'l' });
    const s = billStats(b, [pay('l', 40, '2026-07-01', '2026-07-31'), pay('l', 40, '2026-08-01', '2026-08-31'), pay('l', 30, '2026-07-01', '2026-08-31', { adjustment: true })], '2026-09-10');
    expect(s.perMonth! / U).toBeCloseTo(55, 0);
  });
  it('o preço por kWh ignora acertos sem consumo', () => {
    const b = bill({ id: 'l', unit: 'kWh' });
    const s = billStats(b, [pay('l', 40, '2026-07-01', '2026-07-31', { usage: 200 }), pay('l', 40, '2026-08-01', '2026-08-31', { usage: 200 }), pay('l', 30, '2026-07-01', '2026-08-31', { adjustment: true })], '2026-09-10');
    expect(s.unitPrice! / U).toBeCloseTo(0.2, 5);
  });
});

describe('próximo pagamento', () => {
  const b = bill({ due_day: 31 });
  it('no dia certo (ou no último dia do mês)', () => {
    expect(nextDue(b, null, '2026-02-03')).toBe('2026-02-28');
    expect(nextDue(bill({ due_day: 5 }), null, '2026-10-20')).toBe('2026-11-05');
    expect(nextDue(bill({ due_day: 25 }), '2026-10-24', '2026-10-24')).toBe('2026-11-25');
  });
  it('bimestral: dois meses depois do último', () => {
    expect(nextDue(bill({ due_day: 10, every_months: 2 }), '2026-09-10', '2026-10-01')).toBe('2026-11-10');
  });
});

describe('IMI', () => {
  it('uma, duas ou três prestações', () => {
    expect(imiPlan(90 * U, 2027)).toEqual([{ due_on: '2027-05-31', amount: 90 * U }]);
    expect(imiPlan(320 * U, 2027)).toEqual([{ due_on: '2027-05-31', amount: 160 * U }, { due_on: '2027-11-30', amount: 160 * U }]);
    const three = imiPlan(700 * U, 2027);
    expect(three.map((p) => p.due_on)).toEqual(['2027-05-31', '2027-08-31', '2027-11-30']);
    expect(three.reduce((t, p) => t + p.amount, 0)).toBe(700 * U);
  });
  it('cada prestação: a deste ano se ainda vier, senão a do próximo', () => {
    expect(imiNext(320 * U, '2026-10-29').map((p) => p.due_on)).toEqual(['2026-11-30', '2027-05-31']);
    expect(imiNext(700 * U, '2026-06-10').map((p) => p.due_on)).toEqual(['2026-08-31', '2026-11-30', '2027-05-31']);
    expect(imiNext(90 * U, '2026-10-29').map((p) => p.due_on)).toEqual(['2027-05-31']);
  });
});

describe('faturas lidas e custo por ano', () => {
  it('uma fatura lida por pagar liga-se à despesa com o mesmo valor', () => {
    const lida = pay('l', 58.1, '2026-10-01', '2026-10-31', { source: 'pdf', due_on: '2026-11-20', created_at: '2026-11-03T10:00:00Z' });
    const outra = pay('l', 61.4, '2026-09-01', '2026-09-30', { source: 'pdf', expense_id: 'e1' });
    expect(unpaidInvoice('l', [lida, outra])?.id).toBe(lida.id);
    expect(invoiceToLink('l', 58.1 * U, '2026-11-20', [lida, outra])?.id).toBe(lida.id);
    expect(invoiceToLink('l', 60 * U, '2026-11-20', [lida, outra])).toBeNull();
    expect(invoiceToLink('l', 58.1 * U, '2026-11-20', [pay('l', 58.1, '2026-10-01', '2026-10-31', { source: 'pdf', amount: -58.1 })])).toBeNull();
  });
  it('um ano completo soma os meses; com menos, estima', () => {
    const b = bill({ id: 'r', kind: 'renda', expected: 800 }), ps: BillPayment[] = [];
    for (let m = 1; m <= 12; m++) ps.push(pay('r', 840, `2025-${String(m).padStart(2, '0')}-01`, `2025-${String(m).padStart(2, '0')}-${new Date(2025, m, 0).getDate()}`));
    expect(annualOf(b, ps, '2026-01-15')).toEqual({ year: 10080 * U, prev: null, estimated: false });
    expect(annualOf(b, ps.slice(9), '2026-01-15')).toEqual({ year: 10080 * U, prev: null, estimated: true });
    expect(annualOf(bill({ id: 'x', expected: 40, every_months: 2 }), [], '2026-01-15')).toEqual({ year: 240 * U, prev: null, estimated: true });
  });
  it('a parte de cada um', () => {
    expect(partOfBill(null, 'r', 0.6)).toBe(0.6);
    expect(partOfBill('r', 'r', 0.6)).toBe(1);
    expect(partOfBill('i', 'r', 0.6)).toBe(0);
  });
});
