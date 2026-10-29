import { describe, expect, it } from 'vitest';
import { pairEntries, pairFilter } from '../pairlog';
import { toU } from '../money';

const R = 'r', I = 'i';
const ex = [
  { id: '1', paid_by: R, other_id: I, amount: '100.00', split: 'shared' as const, payer_share: 0.5, spent_on: '2026-10-03', category: 'Supermercado', note: 'Continente', created_at: '2026-10-03T10:00:00Z' },
  { id: '2', paid_by: I, other_id: R, amount: '46.80', split: 'shared' as const, payer_share: 0.5, spent_on: '2026-10-20', category: 'Restaurantes', note: null, created_at: '2026-10-20T21:00:00Z' },
  { id: '3', paid_by: R, other_id: I, amount: '24.00', split: 'other' as const, payer_share: null, spent_on: '2025-06-01', category: 'Saúde', note: 'Farmácia para a Inês' },
  { id: '4', paid_by: R, other_id: null, amount: '9.99', split: 'mine' as const, payer_share: null, spent_on: '2026-10-21', category: 'Lazer', note: 'Só meu' },
  { id: '5', paid_by: R, other_id: I, amount: '12.00', split: 'shared' as const, payer_share: 0.5, spent_on: '2026-10-20', category: 'Lazer', note: 'Cinema', created_at: '2026-10-20T22:00:00Z' },
];
const tr = [{ id: 't', from_id: I, to_id: R, amount: '50.00', made_on: '2026-10-25' }];
const names = { [R]: 'Rodrigo', [I]: 'Inês' };
const all = pairEntries(ex, tr, R, I);
const f = (o: object) => pairFilter(all, { me: R, names, today: '2026-10-28', ...o }).map((e) => e.id);

describe('movimentos a dois', () => {
  it('só o que é dos dois; efeito de cada um nas contas a dois', () => {
    expect(all.map((e) => e.id).sort()).toEqual(['1', '2', '3', '5', 't']); // a «só minha» não entra
    expect(all.find((e) => e.id === '1')!.effect).toBe(toU(50)); // adiantei metade
    expect(all.find((e) => e.id === '2')!.effect).toBe(-toU(23.4)); // a Inês adiantou a minha metade
    expect(all.find((e) => e.id === '3')!.effect).toBe(toU(24)); // paguei uma dela
    expect(all.find((e) => e.id === 't')!.effect).toBe(-toU(50)); // recebi
  });
  it('por defeito do mais recente para o mais antigo (no mesmo dia, o último registado primeiro)', () => {
    expect(f({})).toEqual(['t', '5', '2', '1', '3']);
    expect(f({ sort: 'old' })).toEqual(['3', '1', '2', '5', 't']);
    expect(f({ sort: 'big' })).toEqual(['1', 't', '2', '3', '5']);
  });
  it('filtros: quem pagou, transferências e período', () => {
    expect(f({ who: 'me' })).toEqual(['5', '1', '3']);
    expect(f({ who: 'other' })).toEqual(['2']);
    expect(f({ who: 'transfers' })).toEqual(['t']);
    expect(f({ period: 'month' })).toEqual(['t', '5', '2', '1']);
    expect(f({ period: '12m' })).toEqual(['t', '5', '2', '1']); // junho de 2025 já fica de fora
  });
  it('pesquisa sem acentos, por nome de quem pagou e por valor', () => {
    expect(f({ q: 'farmacia' })).toEqual(['3']);
    expect(f({ q: 'ines' })).toEqual(['t', '2', '3']); // pagou a Inês, transferiu a Inês, «para a Inês»
    expect(f({ q: '46,8' })).toEqual(['2']);
    expect(f({ q: '46.80' })).toEqual(['2']);
    expect(f({ q: 'restau' })).toEqual(['2']);
  });
});
