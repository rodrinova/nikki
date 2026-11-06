import { describe, expect, it } from 'vitest';
import { buildIcs } from '../ical';
import { changes, nikkiId, parseEvent, parseMultistatus, zoned } from '../icspull';

const ID = '8b1c2d3e-4f50-4a6b-9c7d-0e1f2a3b4c5d';

describe('do iPhone para a NIKKI', () => {
  it('ida e volta: o que a NIKKI escreve lê-se igual', () => {
    const ev = { id: ID, title: 'Jantar; com amigos, Rita', starts_at: '2026-07-03T19:30:00.000Z', ends_at: '2026-07-03T22:00:00.000Z', all_day: false, location: 'Casa', repeat: 'weekly' as const, weekdays: [1, 3, 5], month_mode: 'day' as const, until_on: '2026-12-31', skip_dates: ['2026-07-08'] };
    const p = parseEvent(buildIcs('NIKKI', [ev]))!;
    expect(nikkiId(p.uid)).toBe(ID);
    expect(changes(ev, p)).toEqual({});
  });
  it('dia inteiro de vários dias e mensal na n.ª semana', () => {
    const ev = { id: ID, title: 'Férias', starts_at: zoned(2026, 8, 10, 0, 0, 0, 'Europe/Lisbon'), ends_at: zoned(2026, 8, 14, 0, 0, 0, 'Europe/Lisbon'), all_day: true, location: null, repeat: 'none' as const, weekdays: null, month_mode: 'day' as const, until_on: null, skip_dates: [] };
    expect(changes(ev, parseEvent(buildIcs('NIKKI', [ev]))!)).toEqual({});
    const m = { ...ev, all_day: false, starts_at: '2026-11-10T18:00:00.000Z', ends_at: '2026-11-10T19:00:00.000Z', repeat: 'monthly' as const, month_mode: 'nth' as const };
    expect(changes(m, parseEvent(buildIcs('NIKKI', [m]))!)).toEqual({});
  });
  it('um evento criado no iPhone (UID da Apple, hora com TZID, alarme e exceção)', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:ABCD-1234-EFGH', 'DTSTART;TZID=Europe/Lisbon:20261120T090000',
      'DTEND;TZID=Europe/Lisbon:20261120T100000', 'SUMMARY:Dentista', 'LOCATION:Rua Augusta\\, 10', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:ABCD-1234-EFGH', 'RECURRENCE-ID;TZID=Europe/Lisbon:20261127T090000', 'DTSTART;TZID=Europe/Lisbon:20261127T110000', 'SUMMARY:Outro', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const p = parseEvent(ics)!;
    expect(p).toMatchObject({ uid: 'ABCD-1234-EFGH', title: 'Dentista', starts_at: '2026-11-20T09:00:00.000Z', ends_at: '2026-11-20T10:00:00.000Z', location: 'Rua Augusta, 10', repeat: 'none' });
    expect(nikkiId(p.uid)).toBeNull();
    // Verão: Lisboa = UTC+1.
    expect(zoned(2026, 7, 1, 9, 0, 0, 'Europe/Lisbon')).toBe('2026-07-01T08:00:00.000Z');
  });
  it('uma mudança feita no iPhone nota-se', () => {
    const ev = { id: ID, title: 'Treino', starts_at: '2026-11-10T19:30:00.000Z', ends_at: '2026-11-10T20:30:00.000Z', all_day: false, location: null, repeat: 'none' as const, weekdays: null, month_mode: 'day' as const, until_on: null, skip_dates: [] };
    const moved = buildIcs('NIKKI', [{ ...ev, title: 'Treino de pernas', starts_at: '2026-11-10T20:00:00.000Z', ends_at: '2026-11-10T21:00:00.000Z' }]);
    expect(changes(ev, parseEvent(moved)!)).toEqual({ title: 'Treino de pernas', starts_at: '2026-11-10T20:00:00.000Z', ends_at: '2026-11-10T21:00:00.000Z' });
  });
  it('lê a resposta do iCloud (multistatus)', () => {
    const xml = `<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/123/calendars/nikki/abc.ics</href><propstat><prop><getetag>&quot;e1&quot;</getetag><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:x&#13;
DTSTART;VALUE=DATE:20261201&#13;
SUMMARY:A &amp; B&#13;
END:VEVENT&#13;
END:VCALENDAR</calendar-data></prop></propstat></response></multistatus>`;
    const r = parseMultistatus(xml);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ href: '/123/calendars/nikki/abc.ics', etag: '"e1"' });
    expect(parseEvent(r[0].ics)).toMatchObject({ uid: 'x', title: 'A & B', all_day: true, ends_at: null });
  });
});

import { calendarNamed } from '../calsync';
describe('iCloud: reaproveitar o calendário «NIKKI»', () => {
  it('encontra-o pelo nome, só se for calendário', () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/1/calendars/</href><propstat><prop><displayname>NIKKI</displayname><resourcetype><collection/></resourcetype></prop></propstat></response>
<response><href>/1/calendars/ABC-1/</href><propstat><prop><displayname>Casa</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response>
<response><href>/1/calendars/DEF-2/</href><propstat><prop><displayname>Nikki</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response></multistatus>`;
    expect(calendarNamed(xml, 'NIKKI')).toBe('/1/calendars/DEF-2/');
    expect(calendarNamed(xml, 'Trabalho')).toBeNull();
  });
});
