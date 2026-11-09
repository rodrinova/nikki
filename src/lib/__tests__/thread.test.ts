import { describe, expect, it } from 'vitest';
import { buckets, monthPrint } from '../thread';

const R = 'r';
let n = 0;
const e = (spent_on: string, amount: number, category = 'Supermercado') => ({ id: String(n++), paid_by: R, other_id: null, amount, split: 'mine' as const, payer_share: null, spent_on, category });
const T = '2026-11-09'; // segunda
const x = {
  expenses: [e('2026-11-08', 20), e('2026-11-09', 5, 'Restaurantes'), e('2026-11-03', 30), e('2026-01-15', 100)],
  who: R,
  items: [{ day: T, time: '18:45', title: 'Pilates', kind: 'mine' }, { day: T, time: null, title: 'IUC', kind: 'due' }, { day: '2026-11-12', time: '10:00', title: 'Dentista', kind: 'mine' }],
  ghosts: [{ day: '2026-11-20', title: 'Seguro da casa', amount: 41_200_000 }],
};

describe('buckets', () => {
  it('dia: as horas, o agora e o dia inteiro na primeira', () => {
    const b = buckets(0, T, 14, x);
    expect(b).toHaveLength(18);
    expect(b.find((q) => q.now)!.label).toBe('14:00');
    expect(b.find((q) => q.label === '18:00')!.items[0].title).toBe('Pilates');
    expect(b[0].items[0].title).toBe('IUC');
    expect(b.find((q) => q.label === '18:00')!.future).toBe(true);
  });
  it('semana: 15 dias com o gasto de cada um', () => {
    const b = buckets(1, T, 14, x);
    expect(b).toHaveLength(15);
    expect(b[7]).toMatchObject({ label: 'Hoje', now: true, spend: 500_000 });
    expect(b[6]).toMatchObject({ label: 'Ontem', spend: 2_000_000 });
    expect(b.find((q) => q.key === '2026-11-12')!.items[0].title).toBe('Dentista');
  });
  it('mês: semanas de segunda a domingo, com os fantasmas', () => {
    const b = buckets(2, T, 14, x);
    expect(b).toHaveLength(13);
    expect(b[8]).toMatchObject({ key: '2026-11-09', label: 'Esta semana', spend: 500_000 });
    expect(b[7]).toMatchObject({ label: 'A passada', spend: 5_000_000 }); // 3 + 8 nov
    expect(b[9].ghosts[0].title).toBe('Seguro da casa'); // 16 a 22
    expect(b[10].ghosts).toHaveLength(0);
  });
  it('ano: 14 meses com o agora no 12.º', () => {
    const b = buckets(3, T, 14, x);
    expect(b).toHaveLength(14);
    expect(b[0]).toMatchObject({ key: '2025-12' });
    expect(b[11]).toMatchObject({ key: '2026-11', now: true, spend: 5_500_000 });
    expect(b[1]).toMatchObject({ key: '2026-01', spend: 10_000_000 });
    expect(b[13]).toMatchObject({ key: '2027-01', future: true });
  });
});

describe('monthPrint', () => {
  it('o mês dia a dia, por categoria', () => {
    const p = monthPrint(x.expenses, R, '2026-11');
    expect(p.days).toHaveLength(30);
    expect(p.days[7]).toMatchObject({ day: 8, total: 2_000_000 });
    expect(p.total).toBe(5_500_000);
    expect(p.max).toBe(3_000_000);
    expect(p.top).toEqual(['Supermercado', 'Restaurantes']);
  });
});
