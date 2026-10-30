import { describe, expect, it } from 'vitest';
import { guess, parseQuick, type Past } from '../quick';

const T = '2026-10-29'; // quinta
const CATS = ['Supermercado', 'Restaurantes', 'Casa', 'Contas', 'Carros', 'Lazer', 'Saúde', 'Roupa', 'Viagens', 'Future Me'];

describe('ler o que se escreve', () => {
  it('valor e sítio, em qualquer ordem', () => {
    expect(parseQuick('45 pingo doce', T)).toEqual({ amount: '45', note: 'Pingo doce', day: null });
    expect(parseQuick('Pingo Doce 45,30€', T)).toEqual({ amount: '45.30', note: 'Pingo Doce', day: null });
    expect(parseQuick('12.5', T)).toEqual({ amount: '12.5', note: '', day: null });
    expect(parseQuick('galp', T).amount).toBeNull();
  });
  it('o dia', () => {
    expect(parseQuick('12,50 almoço ontem', T)).toEqual({ amount: '12.50', note: 'Almoço', day: '2026-10-28' });
    expect(parseQuick('30 jantar 12/10', T)).toEqual({ amount: '30', note: 'Jantar', day: '2026-10-12' });
    expect(parseQuick('30 jantar 12/12', T).day).toBe('2025-12-12');
    expect(parseQuick('20 mercado no sábado', T)).toEqual({ amount: '20', note: 'Mercado', day: '2026-10-24' });
    expect(parseQuick('20 farmácia quinta', T).day).toBe('2026-10-22');
  });
});

describe('adivinhar categoria e divisão', () => {
  const p = (note: string, category: string, split: Past['split'], d = '2026-10-01', by = 'r'): Past => ({ note, category, split, created_by: by, created_at: d });
  const past = [p('Pingo Doce Alvalade', 'Supermercado', 'shared'), p('Zara', 'Roupa', 'mine'), p('Talho do Zé', 'Casa', 'shared'), p('Jantar', 'Restaurantes', 'shared'), p('Sushi', 'Restaurantes', 'shared'), p('Pingo doce', 'Lazer', 'mine', '2026-10-02', 'i')];
  it('o mesmo sítio manda (só o que eu fiz)', () => {
    expect(guess('Pingo doce', past, 'r', true, CATS)).toEqual({ category: 'Supermercado', split: 'shared', why: 'history' });
    expect(guess('talho do zé', past, 'r', true, CATS)).toEqual({ category: 'Casa', split: 'shared', why: 'history' });
  });
  it('palavras conhecidas na primeira vez', () => {
    expect(guess('Galp Benfica', past, 'r', true, CATS)).toMatchObject({ category: 'Carros', why: 'words' });
    expect(guess('Farmácia', past, 'r', true, CATS)).toEqual({ category: 'Saúde', split: 'mine', why: 'words' });
    expect(guess('Uniqlo', past, 'r', true, CATS)).toEqual({ category: 'Roupa', split: 'mine', why: 'words' });
  });
  it('sem nada: a categoria que mais uso; a solo, sempre minha', () => {
    expect(guess('', past, 'r', true, CATS)).toMatchObject({ category: 'Restaurantes', split: 'shared', why: 'default' });
    expect(guess('Pingo doce', past, 'r', false, CATS).split).toBe('mine');
    expect(guess('', [], 'r', true, CATS)).toEqual({ category: 'Supermercado', split: 'shared', why: 'default' });
  });
});

import { carKindOf } from '../quick';
describe('que despesa do carro', () => {
  it('pela nota', () => {
    expect(carKindOf('Galp Benfica', false)).toBe('fuel');
    expect(carKindOf('Galp', true)).toBe('charge');
    expect(carKindOf('Via Verde', false)).toBe('toll');
    expect(carKindOf('Oficina do Zé', false)).toBe('service');
    expect(carKindOf('', false)).toBe('fuel');
  });
});

describe('escrever tudo de uma vez', () => {
  const ctx = { partner: 'Inês', cats: CATS, cars: [{ id: 'g', name: 'Golf' }, { id: 'z', name: 'Zoe' }], occasions: [{ id: 'c', name: 'Casamento' }] };
  it('a divisão', () => {
    expect(parseQuick('60 jantar partilhada', T, ctx)).toMatchObject({ amount: '60', note: 'Jantar', split: 'shared' });
    expect(parseQuick('20 cinema minha', T, ctx)).toMatchObject({ amount: '20', note: 'Cinema', split: 'mine' });
    expect(parseQuick('35 farmácia para a Inês', T, ctx)).toMatchObject({ amount: '35', note: 'Farmácia', split: 'other' });
    expect(parseQuick('35 farmacia para a ines', T, ctx).split).toBe('other');
    expect(parseQuick('40 sushi a meias', T, ctx)).toMatchObject({ note: 'Sushi', split: 'shared' });
  });
  it('quem pagou e a parte de quem paga', () => {
    expect(parseQuick('80 continente pagou a Inês', T, ctx)).toMatchObject({ amount: '80', note: 'Continente', paidBy: 'partner' });
    expect(parseQuick('80 continente Inês pagou partilhada', T, ctx)).toMatchObject({ paidBy: 'partner', split: 'shared' });
    expect(parseQuick('80 continente 60/40', T, ctx)).toMatchObject({ amount: '80', note: 'Continente', split: 'shared', share: 0.6 });
  });
  it('mais formas de dizer o dia', () => {
    expect(parseQuick('30 jantar dia 3', T, ctx).day).toBe('2026-10-03');
    expect(parseQuick('30 jantar dia 30', T, ctx).day).toBe('2026-09-30');
    expect(parseQuick('30 jantar 12 out', T, ctx)).toMatchObject({ amount: '30', note: 'Jantar', day: '2026-10-12' });
    expect(parseQuick('30 jantar a 5 de setembro', T, ctx).day).toBe('2026-09-05');
    expect(parseQuick('30 jantar 20 dezembro', T, ctx).day).toBe('2025-12-20');
    expect(parseQuick('15 padaria há 3 dias', T, ctx)).toMatchObject({ amount: '15', note: 'Padaria', day: '2026-10-26' });
    expect(parseQuick('20 mercado sábado passado', T, ctx).day).toBe('2026-10-24');
  });
  it('categoria, carro e evento pelos nomes', () => {
    expect(parseQuick('25 bilhetes lazer', T, ctx)).toMatchObject({ amount: '25', note: 'Bilhetes', category: 'Lazer' });
    expect(parseQuick('45 supermercado', T, ctx)).toMatchObject({ note: 'Supermercado', category: 'Supermercado' });
    expect(parseQuick('15 #saude vitaminas', T, ctx)).toMatchObject({ note: 'Vitaminas', category: 'Saúde' });
    expect(parseQuick('60 galp golf', T, ctx)).toMatchObject({ amount: '60', note: 'Galp', category: 'Carros', car: 'g' });
    expect(parseQuick('300 flores casamento', T, ctx)).toMatchObject({ amount: '300', note: 'Flores', occasion: 'c' });
  });
  it('tudo junto, por qualquer ordem', () => {
    expect(parseQuick('ontem 62,40 jantar fora restaurante partilhada pagou a Inês', T, ctx)).toEqual({
      amount: '62.40', note: 'Jantar fora', day: '2026-10-28', split: 'shared', paidBy: 'partner', category: 'Restaurantes',
    });
  });
  it('sem nada disto, como antes', () => {
    expect(parseQuick('45 pingo doce', T, ctx)).toEqual({ amount: '45', note: 'Pingo doce', day: null });
  });
});
