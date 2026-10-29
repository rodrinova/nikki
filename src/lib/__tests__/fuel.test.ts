import { describe, expect, it } from 'vitest';
import { readFuel, readOdometer } from '../fuel';

describe('talão ou bomba', () => {
  it('talão com rótulos', () => {
    expect(readFuel('GALP ENERGIA\nBomba 4 Gasoleo\n34,66 L x 1,789 €/L\nTOTAL 62,00 €\nIVA 23% 11,59')).toEqual({ amount: 62, litres: 34.66, price: 1.789 });
    expect(readFuel('REPSOL\nCombustivel: Gasolina 95\nQuantidade: 41,20\nPreço/L: 1,859\nA pagar 76,59')).toEqual({ amount: 76.59, litres: 41.2, price: 1.859 });
  });
  it('mostrador da bomba: três números soltos', () => {
    expect(readFuel('62.00\n34.66\n1.789')).toEqual({ amount: 62, litres: 34.66, price: 1.789 });
    expect(readFuel('EUR 45,02 LITROS 25.17 1,789')).toMatchObject({ amount: 45.02, litres: 25.17 });
  });
  it('com dois, calcula o terceiro; sem nada, nada', () => {
    expect(readFuel('Total 50,00 €  Preço 1,750 €/L')).toEqual({ amount: 50, litres: 28.57, price: 1.75 });
    expect(readFuel('obrigado pela visita')).toEqual({ amount: null, litres: null, price: null });
  });
});

describe('conta-quilómetros', () => {
  it('o total, não o parcial', () => {
    expect(readOdometer('TRIP A 312.4 km\nODO 48210 km')).toBe(48210);
    expect(readOdometer('48 210 km  12:45  21°C')).toBe(48210);
    expect(readOdometer('sem números')).toBeNull();
  });
  it('sabendo o último, o que vem a seguir', () => {
    expect(readOdometer('148210  48250', 48000)).toBe(48250);
  });
});
