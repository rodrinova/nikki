import { describe, expect, it } from 'vitest';
import { morning, urgent, type DigestIn } from '../digest';

const T = '2026-10-29';
const base: DigestIn = { today: T, me: 'r', events: [], deadlines: [], chores: [], todos: [], hk: null, hkPaid: [], messages: [] };
const ev = (title: string, at: string, o: Partial<DigestIn['events'][0]> = {}) => ({ id: title, title, starts_at: new Date(at).toISOString(), ends_at: null, all_day: false, owner_id: null, private: false, created_by: 'r', ...o });

describe('resumo da manhã', () => {
  it('nada para dizer, nada se envia', () => expect(morning(base)).toBeNull());
  it('o dia, o que se paga e quantas coisas para fazer', () => {
    const d: DigestIn = {
      ...base,
      events: [ev('Pilates', '2026-10-29T18:45:00'), ev('Dentista', '2026-10-29T09:00:00'), ev('Reunião', '2026-10-29T10:00:00', { owner_id: 'i', private: true, created_by: 'i' }), ev('Amanhã', '2026-10-30T10:00:00')],
      deadlines: [{ id: 'd', title: 'IUC do Golf', due_on: '2026-10-30', amount: '148.37', paid_at: null }],
      hk: { name: 'Maria', profile_id: 'm', monthly_pay: '320.00', pay_day: 29, pay_remind: 0, created_at: '2026-10-01T10:00:00Z' },
      todos: [{ id: 't', title: 'Ligar', owner_id: 'r', due_on: T, done_at: null, created_at: T }],
    };
    expect(morning(d)).toEqual({ key: 'manha:2026-10-29', title: 'Hoje', url: '/', body: 'Dentista às 09h00 e Pilates às 18h45. IUC do Golf (148,37 €) e Housekeeping (Maria, 320 €). 1 coisa para fazer.' });
  });
});

describe('avisos urgentes', () => {
  it('o que se paga hoje ou passou, e mensagens do housekeeping', () => {
    const d: DigestIn = {
      ...base,
      deadlines: [{ id: 'a', title: 'Seguro', due_on: T, amount: null, paid_at: null }, { id: 'b', title: 'IMI', due_on: '2026-10-30', amount: 90, paid_at: null }, { id: 'c', title: 'Pago', due_on: T, amount: 1, paid_at: 'x' }],
      hk: { name: 'Maria', profile_id: 'm', monthly_pay: 320, pay_day: 20, created_at: '2026-10-01T10:00:00Z' },
      messages: [{ id: 'x', author_id: 'm', body: 'Falta lixívia.', created_at: '' }, { id: 'y', author_id: 'r', body: 'eu', created_at: '' }],
    };
    expect(urgent(d).map((p) => [p.key, p.title, p.body])).toEqual([
      ['dl:a:2026-10-29', 'Paga-se hoje', 'Seguro'],
      ['hk:2026-10', 'Ficou por pagar', 'Housekeeping (Maria, 320 €)'],
      ['msg:x', 'Mensagem de Maria', 'Falta lixívia.'],
    ]);
  });
});

describe('preparar o pagamento do housekeeping', () => {
  it('no resumo da manhã, com a antecedência escolhida', () => {
    const d: DigestIn = { ...base, hk: { name: 'Maria', profile_id: 'm', monthly_pay: 320, pay_day: null, pay_nth: -1, pay_weekday: 5, pay_remind: 5, created_at: '2026-10-01T10:00:00Z' } };
    expect(morning(d)!.body).toBe('Preparar o housekeeping (Maria, 320 €) para amanhã.');
    expect(urgent(d)).toEqual([]);
  });
});
