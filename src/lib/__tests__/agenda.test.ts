import { describe, expect, it } from 'vitest';
import { expand, isoWeekday, mapsLinks, nthOf, nthWeekday, repeatLabel, turns, type AgendaEvent } from '../agenda';
import { buildIcs, esc, fold, rrule } from '../ical';

const ev = (o: Partial<AgendaEvent>): AgendaEvent => ({ id: 'e', title: 'Evento', starts_at: '2026-01-06T18:45:00', ends_at: '2026-01-06T19:45:00', all_day: false, ...o });
const days = (xs: { day: string }[]) => xs.map((x) => x.day);

describe('repetições', () => {
  it('semanal em vários dias, com dias tirados e até quando', () => {
    const e = ev({ repeat: 'weekly', weekdays: [2, 4], skip_dates: ['2026-10-15'], until_on: '2026-10-29' });
    expect(days(expand([e], '2026-10-12', '2026-11-05'))).toEqual(['2026-10-13', '2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29']);
    expect(expand([e], '2026-10-13', '2026-10-13')[0].time).toBe('18:45');
    expect(repeatLabel(e)).toBe('todas as semanas, terça e quinta, até 29/10/2026');
  });
  it('mensal no mesmo dia (meses sem dia 31 saltam) e na n.ª semana', () => {
    expect(days(expand([ev({ starts_at: '2026-01-31T10:00:00', repeat: 'monthly' })], '2026-01-01', '2026-05-31'))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    // 1.ª sexta: 2 jan 2026 é sexta
    expect(days(expand([ev({ starts_at: '2026-01-02T20:00:00', repeat: 'monthly', month_mode: 'nth' })], '2026-01-01', '2026-04-30'))).toEqual(['2026-01-02', '2026-02-06', '2026-03-06', '2026-04-03']);
    expect(repeatLabel(ev({ starts_at: '2026-01-02T20:00:00', repeat: 'monthly', month_mode: 'nth' }))).toBe('todos os meses na 1.ª sexta');
    // última sexta: 30 jan 2026
    expect(nthOf('2026-01-30')).toBe(-1);
    expect(nthWeekday('2026-02', -1, 5)).toBe('2026-02-27');
    expect(repeatLabel(ev({ starts_at: '2026-01-31T20:00:00', repeat: 'monthly', month_mode: 'nth' }))).toBe('todos os meses no último sábado');
  });
  it('anual (aniversários) e 29 de fevereiro', () => {
    const b = ev({ starts_at: '1990-02-29T00:00:00', all_day: true, ends_at: null, repeat: 'yearly' });
    expect(days(expand([ev({ starts_at: '1966-03-14T00:00:00', all_day: true, ends_at: null, repeat: 'yearly' })], '2026-01-01', '2027-12-31'))).toEqual(['2026-03-14', '2027-03-14']);
    expect(days(expand([{ ...b, starts_at: '1992-02-29T00:00:00' }], '2026-01-01', '2028-12-31'))).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
    expect(turns('1966-03-14', '2026-03-14')).toBe(60);
  });
  it('uma vez; vários dias inteiros aparecem em cada dia', () => {
    expect(days(expand([ev({})], '2026-01-01', '2026-01-31'))).toEqual(['2026-01-06']);
    expect(days(expand([ev({ all_day: true, starts_at: '2026-08-10T00:00:00', ends_at: '2026-08-12T00:00:00' })], '2026-08-01', '2026-08-31'))).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    expect(isoWeekday('2026-10-29')).toBe(4);
  });
});

describe('Waze ou Google Maps', () => {
  it('ligações com o sítio', () => {
    const l = mapsLinks('Rua da Graça 12, Lisboa');
    expect(l.google).toBe('https://www.google.com/maps/search/?api=1&query=Rua%20da%20Gra%C3%A7a%2012%2C%20Lisboa');
    expect(l.wazeApp.startsWith('waze://?q=Rua%20da%20Gra%C3%A7a')).toBe(true);
    expect(l.android).toContain('package=com.waze');
    expect(l.android).toContain('S.browser_fallback_url=https%3A%2F%2Fwww.google.com%2Fmaps');
  });
});

describe('calendário para o iPhone (.ics)', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  it('evento com hora (fuso de Lisboa), sítio e repetição semanal', () => {
    const ics = buildIcs('NIKKI · A nossa casa', [{ id: 'p1', title: 'Pilates', starts_at: '2026-01-06T18:45:00Z', ends_at: '2026-01-06T19:45:00Z', all_day: false, location: 'Estúdio, Graça', repeat: 'weekly', weekdays: [4, 2], skip_dates: ['2026-10-15'] }], now);
    expect(ics).toContain('DTSTART;TZID=Europe/Lisbon:20260106T184500');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
    expect(ics).toContain('EXDATE;TZID=Europe/Lisbon:20261015T184500');
    expect(ics).toContain('LOCATION:Estúdio\\, Graça');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('hora de verão: 18:45 em julho fica 18:45 de Lisboa', () => {
    expect(buildIcs('x', [{ id: 'a', title: 'Jantar', starts_at: '2026-07-10T17:45:00Z', ends_at: null, all_day: false }], now)).toContain('DTSTART;TZID=Europe/Lisbon:20260710T184500');
  });
  it('aniversário (dia inteiro, anual) e 29 de fevereiro', () => {
    const ics = buildIcs('x', [{ id: 'b', title: 'Aniversário da mãe', starts_at: '1966-03-14T00:00:00Z', ends_at: null, all_day: true, repeat: 'yearly' }], now);
    expect(ics).toContain('DTSTART;VALUE=DATE:19660314');
    expect(ics).toContain('DTEND;VALUE=DATE:19660315');
    expect(ics).toContain('RRULE:FREQ=YEARLY');
    expect(rrule({ id: 'c', title: '', starts_at: '1992-02-29T00:00:00Z', ends_at: null, all_day: true, repeat: 'yearly' })).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    expect(rrule({ id: 'd', title: '', starts_at: '2026-01-02T20:00:00Z', ends_at: null, all_day: false, repeat: 'monthly', month_mode: 'nth', until_on: '2026-12-31' })).toBe('FREQ=MONTHLY;BYDAY=1FR;UNTIL=20261231T235959Z');
  });
  it('escapa e dobra linhas', () => {
    expect(esc('a;b,c\\d\ne')).toBe('a\;b\\,c\\\\d\\ne');
    expect(fold('X'.repeat(160)).split('\r\n ').length).toBe(3);
  });
});
