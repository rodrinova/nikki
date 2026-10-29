import { describe, expect, it } from 'vitest';
import { ago, fillWeeks, hoursLabel, shortDate } from '../admin';
import { moduleOf } from '../modules';

const now = new Date(2026, 9, 28, 15, 0); // quarta, 28 out 2026, 15:00 em Lisboa

describe('há quanto tempo', () => {
  it('minutos, horas, dias de calendário e datas', () => {
    expect(ago(null, now)).toBe('nunca');
    expect(ago(new Date(2026, 9, 28, 14, 59, 40).toISOString(), now)).toBe('agora');
    expect(ago(new Date(2026, 9, 28, 14, 35).toISOString(), now)).toBe('há 25 min');
    expect(ago(new Date(2026, 9, 28, 9, 0).toISOString(), now)).toBe('há 6 h');
    expect(ago(new Date(2026, 9, 27, 23, 30).toISOString(), now)).toBe('ontem'); // menos de 24 h, mas foi ontem
    expect(ago(new Date(2026, 9, 24, 12, 0).toISOString(), now)).toBe('há 4 dias');
    expect(ago(new Date(2026, 9, 10, 12, 0).toISOString(), now)).toBe('há 2 semanas');
    expect(ago(new Date(2026, 2, 3, 12, 0).toISOString(), now)).toBe('3 mar');
    expect(shortDate(new Date(2025, 11, 1).toISOString(), now)).toBe('1 dez 2025');
  });
  it('mudança de hora (25 out) não estraga os dias', () => {
    expect(ago(new Date(2026, 9, 24, 23, 0).toISOString(), new Date(2026, 9, 26, 1, 0))).toBe('há 2 dias');
  });
});

describe('registos por semana', () => {
  it('8 semanas de segunda a domingo, com zeros onde não houve', () => {
    const w = fillWeeks([{ week: '2026-10-26', n: 2 }, { week: '2026-10-12', n: 1 }, { week: '2026-08-03', n: 9 }], '2026-10-28');
    expect(w).toHaveLength(8);
    expect(w[0].week).toBe('2026-09-07');
    expect(w[7]).toEqual({ week: '2026-10-26', n: 2 });
    expect(w.map((x) => x.n)).toEqual([0, 0, 0, 0, 0, 1, 0, 2]); // a de agosto já não entra
  });
  it('atravessa a mudança de hora sem saltar semanas', () => {
    const w = fillWeeks([], '2026-11-02', 3).map((x) => x.week);
    expect(w).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  });
});

describe('outros', () => {
  it('tempo até aprovar', () => {
    expect(hoursLabel(null)).toBe('—');
    expect(hoursLabel(0.4)).toBe('24 min');
    expect(hoursLabel(5.4)).toBe('5 h');
    expect(hoursLabel(60)).toBe('3 dias');
  });
  it('módulo de cada caminho', () => {
    expect(moduleOf('/compras')).toBe('compras');
    expect(moduleOf('/garagem')).toBe('garagem');
    expect(moduleOf('/garagem/abc')).toBe('garagem');
    expect(moduleOf('/dinheiro')).toBeNull();
    expect(moduleOf('/contas')).toBeNull(); // «Entre nós» é um separador do Dinheiro, não um módulo
    expect(moduleOf('/contasx')).toBeNull();
  });
});
