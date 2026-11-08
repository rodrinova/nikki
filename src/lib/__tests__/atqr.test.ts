import { describe, expect, it } from 'vitest';
import { parseAtQr } from '../atqr';

describe('QR das faturas portuguesas', () => {
  it('lê uma fatura simplificada do supermercado', () => {
    const qr = 'A:500829993*B:999999990*C:PT*D:FS*E:N*F:20261106*G:FS 0123/45678*H:JJF7KN3D-45678*I1:PT*I3:10.20*I4:0.61*I7:15.00*I8:3.45*N:4.06*O:29.26*Q:abcd*R:1234';
    expect(parseAtQr(qr)).toEqual({ nif: '500829993', buyerNif: null, type: 'FS', date: '2026-11-06', doc: 'FS 0123/45678', atcud: 'JJF7KN3D-45678', total: '29.26', vat: '4.06', credit: false });
  });
  it('nota de crédito e NIF do cliente', () => {
    const p = parseAtQr('A:509999999*B:123456789*C:PT*D:NC*E:N*F:20261101*G:NC A/12*H:0*N:2.30*O:12.30*Q:x*R:1');
    expect(p).toMatchObject({ credit: true, buyerNif: '123456789', atcud: null, total: '12.30' });
  });
  it('não é uma fatura', () => {
    expect(parseAtQr('https://exemplo.pt')).toBeNull();
    expect(parseAtQr('A:500829993*F:2026*O:1')).toBeNull();
  });
});
