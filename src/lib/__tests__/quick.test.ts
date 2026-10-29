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
