import { describe, expect, it } from 'vitest';
import { parseDateText, parseMoneyText, readInvoice } from '../invoice';

const U = 100_000;

describe('números e datas à portuguesa', () => {
  it('valores', () => {
    expect(parseMoneyText('61,40 €')).toBe(61.4 * U);
    expect(parseMoneyText('1.234,56')).toBe(123456 * 1000);
    expect(parseMoneyText('€ 840.00')).toBe(840 * U);
    expect(parseMoneyText('-12,30')).toBe(-12.3 * U);
  });
  it('datas', () => {
    expect(parseDateText('05/10/2026')).toBe('2026-10-05');
    expect(parseDateText('5-10-26')).toBe('2026-10-05');
    expect(parseDateText('2026-10-05')).toBe('2026-10-05');
    expect(parseDateText('5 out 2026')).toBe('2026-10-05');
    expect(parseDateText('5 de outubro de 2026')).toBe('2026-10-05');
    expect(parseDateText('31/02/2026')).toBe('2026-02-31'); // o calendário confirma-se ao gravar
  });
});

describe('ler uma fatura', () => {
  it('luz bi-horário (PDF da EDP)', () => {
    const r = readInvoice(`EDP Comercial - Comercialização de Energia, S.A.
Fatura n.º FT 2026/123456   Data de emissão: 05/10/2026
Período de faturação: 01/09/2026 a 30/09/2026
Eletricidade  Leitura real
Consumo Vazio        102 kWh
Consumo Fora de Vazio 146 kWh
Consumo total         248 kWh
Potência contratada 6,90 kVA
IVA 23%   9,12 €
Total a pagar   61,40 €
Data limite de pagamento: 20/10/2026  Débito direto`);
    expect(r).toMatchObject({ provider: 'EDP', kind: 'luz', total: 61.4 * U, from: '2026-09-01', to: '2026-09-30', usage: 248, unit: 'kWh', dueOn: '2026-10-20', issuedOn: '2026-10-05', adjustment: false, estimated: false, found: 5 });
  });
  it('água de dois meses (EPAL), em m³', () => {
    const r = readInvoice(`EPAL - Empresa Portuguesa das Águas Livres
Período de consumo de 01-07-2026 a 31-08-2026
Consumo de água: 14 m3 (leitura estimada)
Saneamento  6,20 €
Valor a pagar: 40,10 €
Pagar até 15-09-2026`);
    expect(r).toMatchObject({ provider: 'EPAL', kind: 'agua', total: 40.1 * U, from: '2026-07-01', to: '2026-08-31', usage: 14, unit: 'm3', dueOn: '2026-09-15', estimated: true });
  });
  it('acerto a favor do cliente (Goldenergy)', () => {
    const r = readInvoice(`Goldenergy
Fatura de acerto - regularização de consumos estimados
Período 1 mar 2026 a 31 ago 2026
Energia consumida 1.420 kWh
Valor a devolver 23,15 €`);
    expect(r).toMatchObject({ provider: 'Goldenergy', kind: 'luz', total: -23.15 * U, from: '2026-03-01', to: '2026-08-31', usage: 1420, adjustment: true });
  });
  it('internet (MEO), sem consumo', () => {
    const r = readInvoice(`MEO - Serviços de Comunicações e Multimédia, S.A.
Período de faturação 01/10/2026 a 31/10/2026
Total da fatura 41,90 EUR
Data de vencimento: 14/10/2026`);
    expect(r).toMatchObject({ provider: 'MEO', kind: 'internet', total: 41.9 * U, usage: null, dueOn: '2026-10-14' });
  });
  it('foto com ruído (texto reconhecido, acentos perdidos)', () => {
    const r = readInvoice(`edp
Periodo de faturacao  01/09/2026  a 30/09/2026 ;
| Consumo total  248 kWh |
TOTAL A PAGAR . 61,40€
Data limite  20/10/2026`);
    expect(r).toMatchObject({ provider: 'EDP', total: 61.4 * U, from: '2026-09-01', usage: 248, dueOn: '2026-10-20' });
  });
  it('sem nada que se perceba', () => {
    expect(readInvoice('olá mundo').found).toBe(0);
  });
});
