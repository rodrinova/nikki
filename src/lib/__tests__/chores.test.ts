import { describe, expect, it } from 'vitest';
import { addMonths, addPeriod, afterDone, everyLabel, readReceipt, todayList, warrantyEnd, warrantyState, type Chore, type Todo } from '../chores';

const chore = (o: Partial<Chore>): Chore => ({ id: 'c', kind: 'task', title: 'Tarefa', every_n: 1, every_unit: 'week', next_on: '2026-10-29', assign: 'anyone', turn_id: null, archived: false, ...o });
const todo = (o: Partial<Todo>): Todo => ({ id: 't', title: 'Coisa', owner_id: null, due_on: '2026-10-29', done_at: null, created_at: '2026-10-28T10:00:00Z', ...o });

describe('periodicidade', () => {
  it('dias, semanas, meses (fim do mês) e anos', () => {
    expect(addPeriod('2026-10-29', 3, 'day')).toBe('2026-11-01');
    expect(addPeriod('2026-10-29', 2, 'week')).toBe('2026-11-12');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addPeriod('2024-02-29', 1, 'year')).toBe('2025-02-28');
    expect(everyLabel(1, 'week')).toBe('todas as semanas');
    expect(everyLabel(3, 'month')).toBe('a cada 3 meses');
  });
  it('depois de feita: conta do dia em que se fez e a vez passa', () => {
    const people = ['r', 'i'];
    expect(afterDone(chore({ assign: 'rotate', turn_id: 'r', next_on: '2026-10-20' }), '2026-10-29', 'r', people)).toEqual({ next_on: '2026-11-05', turn_id: 'i' });
    expect(afterDone(chore({ assign: 'rotate', turn_id: 'r' }), '2026-10-29', 'i', people)).toEqual({ next_on: '2026-11-05', turn_id: 'r' });
    expect(afterDone(chore({ assign: 'rotate', turn_id: 'r' }), '2026-10-29', 'r', ['r'])).toEqual({ next_on: '2026-11-05', turn_id: 'r' });
    expect(afterDone(chore({ assign: 'fixed', turn_id: 'i' }), '2026-10-29', 'r', people).turn_id).toBe('i');
    expect(afterDone(chore({ assign: 'anyone' }), '2026-10-29', 'r', people).turn_id).toBeNull();
  });
});

describe('a lista de hoje', () => {
  it('as minhas e as de quem pegar, atrasadas primeiro; conta as do outro', () => {
    const r = todayList([
      chore({ id: 'a', title: 'Lençóis', assign: 'rotate', turn_id: 'r', next_on: '2026-10-29' }),
      chore({ id: 'b', title: 'Regar', assign: 'anyone', next_on: '2026-10-27' }),
      chore({ id: 'c', title: 'Lixo', assign: 'fixed', turn_id: 'i', next_on: '2026-10-29' }),
      chore({ id: 'd', title: 'Amanhã', next_on: '2026-10-30' }),
      chore({ id: 'e', title: 'Arquivada', next_on: '2026-10-01', archived: true }),
    ], [todo({ id: 't1', title: 'Canalizador', owner_id: 'r' }), todo({ id: 't2', title: 'Feita', done_at: '2026-10-29T09:00:00Z' }), todo({ id: 't3', title: 'Sem dia', due_on: null }), todo({ id: 't4', title: 'Da Inês', owner_id: 'i' })], 'r', '2026-10-29');
    expect(r.mine.map((i) => i.title)).toEqual(['Regar', 'Canalizador', 'Lençóis', 'Sem dia']);
    expect(r.mine[0].late).toBe(2);
    expect(r.others).toBe(2);
  });
});

describe('garantias', () => {
  it('3 anos a partir da compra; a acabar nos últimos 90 dias', () => {
    expect(warrantyEnd('2024-02-29', 3)).toBe('2027-02-28');
    expect(warrantyEnd('2025-03-14', 1.5)).toBe('2026-09-14');
    expect(warrantyState('2023-12-01', 3, '2026-10-29')).toEqual({ end: '2026-12-01', state: 'soon', days: 33 });
    expect(warrantyState('2025-03-14', 3, '2026-10-29').state).toBe('ok');
    expect(warrantyState('2023-01-10', 3, '2026-10-29').state).toBe('ended');
  });
  it('lê a loja, a data e o total de um talão', () => {
    expect(readReceipt(`WORTEN - Equipamentos para o Lar
NIF 503630330
Data: 14/03/2025 18:22
Máquina de lavar roupa 8kg
TOTAL 429,99 €`)).toEqual({ store: 'WORTEN - Equipamentos para o Lar', date: '2025-03-14', total: 42999000 });
  });
});
