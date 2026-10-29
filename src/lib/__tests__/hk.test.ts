import { describe, expect, it } from 'vitest';
import { payDateOf, payRuleLabel, daysLabel, history, isVisitDay, nextVisit, payDate, payDue, prevVisit, visitList, visitsBetween, type HkTask } from '../hk';

const t = (id: string, repeat: HkTask['repeat'], due_on: string | null = null): HkTask => ({ id, title: id, repeat, due_on, archived: false });

describe('visitas', () => {
  // 2026-11-03 é terça; 2026-11-06 sexta
  it('próxima e anterior', () => {
    expect(nextVisit([2, 5], '2026-11-03')).toBe('2026-11-03');
    expect(nextVisit([2, 5], '2026-11-04')).toBe('2026-11-06');
    expect(nextVisit([2, 5], '2026-11-07')).toBe('2026-11-10');
    expect(prevVisit([2, 5], '2026-11-06')).toBe('2026-11-03');
    expect(isVisitDay([], '2026-11-04')).toBe(true);
    expect(visitsBetween([2, 5], '2026-11-01', '2026-11-14')).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13']);
  });
  it('rótulos', () => {
    expect(daysLabel([5, 2], '09:00:00')).toBe('Terças e sextas, às 9h');
    expect(daysLabel([1, 3, 5], '14:30')).toBe('Segundas, quartas e sextas, às 14h30');
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Dias úteis');
    expect(daysLabel([])).toBe('Quando combinado');
  });
});

describe('lista de cada visita', () => {
  const tasks = [t('wc', 'visit'), t('vidros', 'week'), t('frigo', 'month'), t('forno', 'once'), t('estores', 'once', '2026-11-06'), { ...t('velha', 'visit'), archived: true }];
  it('primeira visita: tudo o que já pode ser feito', () => {
    expect(visitList(tasks, [], '2026-11-03').map((i) => i.task.id)).toEqual(['forno', 'wc', 'vidros', 'frigo']);
  });
  it('o que foi feito na terça não volta na sexta da mesma semana nem no mesmo mês', () => {
    const log = ['wc', 'vidros', 'frigo', 'forno'].map((id) => ({ task_id: id, done_on: '2026-11-03' }));
    expect(visitList(tasks, log, '2026-11-03').every((i) => i.done)).toBe(true);
    expect(visitList(tasks, log, '2026-11-06').map((i) => i.task.id)).toEqual(['estores', 'wc']);
    expect(visitList(tasks, log, '2026-11-10').map((i) => i.task.id)).toEqual(['estores', 'wc', 'vidros']);
    expect(visitList(tasks, log, '2026-12-01').map((i) => i.task.id)).toEqual(['estores', 'wc', 'vidros', 'frigo']);
  });
  it('feitas vão para o fim', () => {
    const l = visitList(tasks, [{ task_id: 'wc', done_on: '2026-11-03' }], '2026-11-03');
    expect(l.at(-1)!.task.id).toBe('wc');
  });
  it('histórico por dia', () => {
    const h = history(tasks, [{ task_id: 'wc', done_on: '2026-11-03' }, { task_id: 'wc', done_on: '2026-11-06' }, { task_id: 'vidros', done_on: '2026-11-03' }]);
    expect(h).toEqual([{ day: '2026-11-06', titles: ['wc'] }, { day: '2026-11-03', titles: ['wc', 'vidros'] }]);
  });
});

describe('pagamento mensal', () => {
  const hk = { monthly_pay: 320, pay_day: 28, created_at: '2026-09-10T10:00:00Z' };
  it('dia de pagar no fim do mês', () => {
    expect(payDate('2027-02', 31)).toBe('2027-02-28');
    expect(payDate('2026-11', 28)).toBe('2026-11-28');
  });
  it('meses por pagar, com 3 dias de antecedência', () => {
    expect(payDue(hk, ['2026-09'], '2026-10-24')).toEqual([]);
    expect(payDue(hk, ['2026-09'], '2026-10-25')).toEqual([{ month: '2026-10', due: '2026-10-28', late: -3 }]);
    expect(payDue(hk, ['2026-09'], '2026-11-02').map((p) => [p.month, p.late])).toEqual([['2026-10', 5]]);
    expect(payDue(hk, [], '2026-10-29').map((p) => p.month)).toEqual(['2026-09', '2026-10']);
    expect(payDue({ ...hk, monthly_pay: null }, [], '2026-10-29')).toEqual([]);
  });
});

describe('pagar num dia da semana do mês', () => {
  const base = { monthly_pay: 320, pay_day: null, created_at: '2026-09-10T10:00:00Z' };
  it('a última sexta-feira, o 1.º sábado', () => {
    expect(payDateOf('2026-10', { ...base, pay_nth: -1, pay_weekday: 5 })).toBe('2026-10-30');
    expect(payDateOf('2026-11', { ...base, pay_nth: -1, pay_weekday: 5 })).toBe('2026-11-27');
    expect(payDateOf('2026-11', { ...base, pay_nth: 1, pay_weekday: 6 })).toBe('2026-11-07');
    expect(payRuleLabel({ ...base, pay_nth: -1, pay_weekday: 5 })).toBe('última sexta-feira do mês');
    expect(payRuleLabel({ ...base, pay_nth: 1, pay_weekday: 6 })).toBe('1.º sábado do mês');
    expect(payRuleLabel({ ...base, pay_day: 28 })).toBe('dia 28');
  });
  it('avisa com a antecedência escolhida', () => {
    const hk = { ...base, pay_nth: -1, pay_weekday: 5, pay_remind: 7 };
    expect(payDue(hk, ['2026-09'], '2026-10-22')).toEqual([]);
    expect(payDue(hk, ['2026-09'], '2026-10-23')).toEqual([{ month: '2026-10', due: '2026-10-30', late: -7 }]);
    expect(payDue({ ...hk, pay_remind: 1 }, ['2026-09'], '2026-10-23')).toEqual([]);
  });
});
