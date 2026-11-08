import { describe as group, expect, it } from 'vitest';
import { describe, readIntent } from '../intent';

const T = '2026-11-08'; // domingo

group('readIntent', () => {
  it('despesas: um valor que não é hora', () => {
    expect(readIntent('jantar 48 a meias', T)).toEqual({ kind: 'expense', text: 'jantar 48 a meias' });
    expect(readIntent('45 pingo doce ontem', T).kind).toBe('expense');
    expect(readIntent('Farmácia 12,50€', T).kind).toBe('expense');
    expect(readIntent('ginásio 30 euros', T).kind).toBe('expense');
  });
  it('eventos: dia e hora', () => {
    expect(readIntent('Dentista quinta às 10', T)).toEqual({ kind: 'event', title: 'Dentista', day: '2026-11-12', time: '10:00', end: null });
    expect(readIntent('jantar com a Rita amanhã às 20h30', T)).toEqual({ kind: 'event', title: 'Jantar com a Rita', day: '2026-11-09', time: '20:30', end: null });
    expect(readIntent('reunião da escola dia 20 das 18 às 19h30', T)).toEqual({ kind: 'event', title: 'Reunião da escola', day: '2026-11-20', time: '18:00', end: '19:30' });
    expect(readIntent('IUC dia 3', T)).toMatchObject({ kind: 'event', title: 'IUC', day: '2026-12-03', time: null });
    expect(readIntent('cinema sábado às 9 da noite', T)).toMatchObject({ day: '2026-11-14', time: '21:00' });
    expect(readIntent('almoço na próxima segunda', T)).toMatchObject({ kind: 'event', title: 'Almoço', day: '2026-11-09' });
    expect(readIntent('aniversário da mãe 2/3', T)).toMatchObject({ kind: 'event', day: '2027-03-02' });
  });
  it('domingo «domingo» é o da semana que vem', () => {
    expect(readIntent('padel domingo 10h', T)).toMatchObject({ day: '2026-11-15', time: '10:00' });
  });
  it('compras: uma coisa por linha', () => {
    expect(readIntent('falta leite, ovos e café', T)).toEqual({ kind: 'shop', items: ['Leite', 'Ovos', 'Café'] });
    expect(readIntent('Acabou o detergente da loiça', T)).toEqual({ kind: 'shop', items: ['Detergente da loiça'] });
    expect(readIntent('comprar pão', T)).toEqual({ kind: 'shop', items: ['Pão'] });
  });
  it('a fazer: para quem e quando', () => {
    expect(readIntent('tenho de ligar ao canalizador amanhã', T)).toEqual({ kind: 'todo', title: 'Ligar ao canalizador', day: '2026-11-09', who: 'me' });
    expect(readIntent('temos de marcar a revisão do carro', T)).toEqual({ kind: 'todo', title: 'Marcar a revisão do carro', day: T, who: 'any' });
    expect(readIntent('lembrar de pagar a escola para a Inês sexta', T, { partner: 'Inês' })).toEqual({ kind: 'todo', title: 'Pagar a escola', day: '2026-11-13', who: 'other' });
  });
  it('o resto fica por decidir', () => {
    expect(readIntent('presente da Rita', T)).toEqual({ kind: null, text: 'presente da Rita' });
    expect(readIntent('   ', T).kind).toBe(null);
  });
  it('a frase do que se vai gravar', () => {
    expect(describe(readIntent('Dentista quinta às 10', T), T)).toBe('Quinta, 12 às 10:00');
    expect(describe(readIntent('IUC amanhã', T), T)).toBe('Amanhã, o dia inteiro');
    expect(describe(readIntent('falta leite e ovos', T), T)).toBe('2 coisas para a lista');
  });
});
