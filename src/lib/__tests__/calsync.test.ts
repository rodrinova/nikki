import { describe, expect, it } from 'vitest';
import { caldavBody, caldavPath, googleEvent, googleId, hint, hrefIn, open, readState, seal, signState, visibleTo, type SyncEvent } from '../calsync';

const e = (o: Partial<SyncEvent>): SyncEvent => ({ id: '3f2a9c1e-0b7d-4c55-9d1e-2a6b8f0c4d11', title: 'Pilates', starts_at: '2026-01-06T18:45:00Z', ends_at: '2026-01-06T19:45:00Z', all_day: false, owner_id: null, private: false, created_by: 'r', ...o });
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i * 7)));

describe('o que vai para o calendário de cada um', () => {
  it('da casa e os meus; os do outro e os «só para mim» dele não', () => {
    expect(visibleTo(e({}), 'r')).toBe(true);
    expect(visibleTo(e({ owner_id: 'r' }), 'r')).toBe(true);
    expect(visibleTo(e({ owner_id: 'i', created_by: 'i' }), 'r')).toBe(false);
    expect(visibleTo(e({ owner_id: 'i', private: true, created_by: 'i' }), 'r')).toBe(false);
    expect(visibleTo(e({ owner_id: 'r', private: true }), 'r')).toBe(true);
  });
});

describe('iCloud (CalDAV)', () => {
  it('lê os endereços das respostas e escreve um evento por ficheiro', () => {
    const xml = '<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/123456/principal/</href></current-user-principal></prop></propstat></response></multistatus>';
    expect(hrefIn(xml, 'current-user-principal')).toBe('/123456/principal/');
    const home = '<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p57-caldav.icloud.com:443/123456/calendars/</href></calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>';
    expect(hrefIn(home, 'calendar-home-set')).toBe('https://p57-caldav.icloud.com:443/123456/calendars/');
    expect(caldavPath('https://p57-caldav.icloud.com/123/calendars/nikki', 'abc')).toBe('https://p57-caldav.icloud.com/123/calendars/nikki/abc.ics');
    const ics = caldavBody(e({ repeat: 'weekly', weekdays: [2, 4] }));
    expect(ics).toContain('UID:3f2a9c1e-0b7d-4c55-9d1e-2a6b8f0c4d11@nikki');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

describe('Google Calendar', () => {
  it('id válido e evento com a hora de Lisboa, repetição e dias tirados', () => {
    expect(googleId('3f2a9c1e-0b7d-4c55-9d1e-2a6b8f0c4d11')).toMatch(/^[a-v0-9]{5,1024}$/);
    const g = googleEvent(e({ starts_at: '2026-07-07T17:45:00Z', ends_at: '2026-07-07T18:45:00Z', repeat: 'weekly', weekdays: [2], skip_dates: ['2026-07-14'], location: 'Graça' }));
    expect(g.start).toEqual({ dateTime: '2026-07-07T18:45:00', timeZone: 'Europe/Lisbon' });
    expect(g.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE;TZID=Europe/Lisbon:20260714T184500']);
    expect(g.location).toBe('Graça');
  });
  it('dia inteiro: o fim é o dia seguinte', () => {
    const g = googleEvent(e({ all_day: true, starts_at: '1966-03-14T00:00:00Z', ends_at: null, repeat: 'yearly' })); // meia-noite de Lisboa (em 1966, UTC+0)
    expect(g.start).toEqual({ date: '1966-03-14' });
    expect(g.end).toEqual({ date: '1966-03-15' });
  });
});

describe('segredos', () => {
  it('encripta e desencripta o acesso guardado', async () => {
    const s = await seal('abcd-efgh-ijkl-mnop', KEY);
    expect(s).not.toContain('abcd');
    expect(await open(s, KEY)).toBe('abcd-efgh-ijkl-mnop');
  });
  it('o «state» do Google: assinado, não se forja e expira', async () => {
    const st = await signState({ p: 'r', h: 'h1' }, KEY, 1_000_000);
    expect(await readState(st, KEY, 1_000_000 + 60_000)).toEqual({ p: 'r', h: 'h1' });
    expect(await readState(st, KEY, 1_000_000 + 16 * 60_000)).toBeNull();
    expect(await readState(st.replace(/^./, (c) => (c === 'e' ? 'f' : 'e')), KEY, 1_000_000)).toBeNull();
  });
  it('mostra a conta só em parte', () => {
    expect(hint('rodrigo@icloud.com')).toBe('r•••@icloud.com');
  });
});
