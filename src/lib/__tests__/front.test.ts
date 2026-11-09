import { describe, expect, it } from 'vitest';
import { compose, stories, type Signals } from '../front';

const T = '2026-11-09';
const base: Signals = { today: T, hhmm: '09:00', month: { pct: 2, why: null, total: 116_500_000, normal: 107_000_000, name: 'novembro' } };

describe('stories + compose', () => {
  it('dia calmo: nada passa de 40', () => {
    const f = compose(stories({ ...base, events: [{ title: 'Pilates', day: T, time: '18:45', endTime: '19:45', kind: 'mine' }] }));
    expect(f.calm).toBe(true);
    expect(f.lead.head).toBe('Dia calmo.');
    expect(f.lead.sub).toBe('Pilates às 18:45.'); // o que mais pesa fica por baixo da manchete
    expect(f.features.map((x) => x.key)).toEqual(['month']);
  });
  it('um prazo amanhã passa a manchete', () => {
    const f = compose(stories({ ...base, deadlines: [{ title: 'Seguro da casa', due_on: '2026-11-10', amount: 41_200_000 }], live: { name: 'Marta', left: 9 } }));
    expect(f.lead.head).toBe('Seguro da casa: amanhã, 412 €.');
    expect(f.features[0].key).toBe('live');
  });
  it('o mês quente passa à frente das compras', () => {
    const f = compose(stories({ ...base, month: { ...base.month!, pct: 31, why: 'Restaurantes' }, live: { name: 'Marta', left: 9 } }));
    expect(f.lead.head).toBe('Mês quente: 31% acima do habitual, sobretudo restaurantes.');
    expect(f.lead.to).toBe('/n2/dinheiro');
  });
  it('um evento perto pesa mais do que um longe', () => {
    const near = stories({ ...base, hhmm: '18:00', events: [{ title: 'Pilates', day: T, time: '18:45', endTime: '19:45', kind: 'mine' }] }).find((x) => x.key === 'ev:Pilates')!;
    expect(near.weight).toBe(56);
    expect(near.sub).toBe('Daqui a 45 minutos.');
  });
  it('prazos para lá de uma semana e saldos pequenos não entram', () => {
    const s = stories({ ...base, deadlines: [{ title: 'IUC', due_on: '2026-11-30' }], balance: { lead: 'Adiantaste mais', v: 1_000_000, even: false } });
    expect(s.find((x) => x.key.startsWith('dl:'))).toBeUndefined();
    const f = compose(s);
    expect(f.lead.sub).toBe('Mês no ritmo.');
    expect(f.briefs.map((x) => x.key)).toEqual(['us']);
  });
});
