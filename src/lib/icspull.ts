// Do iPhone para a NIKKI: ler o calendário «NIKKI» do iCloud (CalDAV REPORT) e passar cada evento para a forma da
// agenda da NIKKI. Sem dependências da app: usam-no os testes e a função calendar-pull do Supabase.

/** Pedido REPORT: todos os eventos do calendário, com a etag (muda sempre que o evento muda) e o .ics. */
export const REPORT_ALL = '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>';

const unxml = (s: string) => s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, '\r').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

export interface DavItem { href: string; etag: string | null; ics: string }

/** As respostas de um multistatus: o endereço, a etag e o .ics de cada evento. */
export function parseMultistatus(xml: string): DavItem[] {
  const out: DavItem[] = [];
  const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');
  for (const m of xml.matchAll(/<(?:[\w-]+:)?response[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)) {
    const r = m[1];
    const href = r.match(tag('href'))?.[1]?.trim();
    const data = r.match(tag('calendar-data'))?.[1];
    if (!href || !data) continue;
    const etag = r.match(tag('getetag'))?.[1]?.trim().replace(/&quot;/g, '"') ?? null;
    out.push({ href: unxml(href), etag, ics: unxml(data) });
  }
  return out;
}

interface Prop { name: string; params: Record<string, string>; value: string }

/** As linhas de um .ics (desdobradas), cada uma com nome, parâmetros e valor. */
function props(ics: string): Prop[] {
  const lines = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  return lines.filter(Boolean).map((l) => {
    const i = l.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/); // o primeiro «:» fora de aspas
    const head = i < 0 ? l : l.slice(0, i), value = i < 0 ? '' : l.slice(i + 1);
    const [name, ...ps] = head.split(';');
    const params: Record<string, string> = {};
    for (const p of ps) { const [k, v = ''] = p.split('='); params[k.toUpperCase()] = v.replace(/^"|"$/g, ''); }
    return { name: name.toUpperCase(), params, value };
  });
}

const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

/** Os minutos que um fuso está à frente do UTC num dado instante (ex.: Lisboa no verão: +60). */
function tzOffset(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60_000;
}
/** Uma hora local (num fuso) em ISO UTC. */
export function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = guess - tzOffset(guess, tz) * 60_000;
  ms = guess - tzOffset(ms, tz) * 60_000; // à volta da mudança de hora
  return new Date(ms).toISOString();
}

const TZ = 'Europe/Lisbon';
const validTz = (tz: string | undefined) => { if (!tz) return TZ; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return TZ; } };

/** Um DTSTART/DTEND: dia (VALUE=DATE) ou hora (UTC com Z, com TZID, ou flutuante = Lisboa). */
function when(p: Prop): { date: string; iso: string; allDay: boolean } {
  const v = p.value.trim();
  const y = +v.slice(0, 4), mo = +v.slice(4, 6), d = +v.slice(6, 8);
  const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (p.params.VALUE === 'DATE' || v.length === 8) return { date, iso: zoned(y, mo, d, 0, 0, 0, TZ), allDay: true };
  const h = +v.slice(9, 11), mi = +v.slice(11, 13), s = +v.slice(13, 15) || 0;
  const iso = v.endsWith('Z') ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString() : zoned(y, mo, d, h, mi, s, validTz(p.params.TZID));
  return { date, iso, allDay: false };
}

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const lisbonDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** O que a agenda da NIKKI guarda de um evento vindo do iPhone. */
export interface PulledEvent {
  uid: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; location: string | null;
  repeat: 'none' | 'weekly' | 'monthly' | 'yearly'; weekdays: number[] | null; month_mode: 'day' | 'nth'; until_on: string | null; skip_dates: string[];
}

/** O evento principal de um .ics (sem as exceções com RECURRENCE-ID), na forma da agenda da NIKKI. */
export function parseEvent(ics: string): PulledEvent | null {
  const all = props(ics);
  // Os blocos VEVENT; fica o primeiro sem RECURRENCE-ID (a série ou o evento simples).
  const blocks: Prop[][] = [];
  let cur: Prop[] | null = null;
  for (const p of all) {
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') cur = [];
    else if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') { if (cur) blocks.push(cur); cur = null; }
    else if (cur) cur.push(p);
  }
  const ev = blocks.find((b) => !b.some((p) => p.name === 'RECURRENCE-ID'));
  if (!ev) return null;
  const get = (n: string) => ev.find((p) => p.name === n);
  const uid = get('UID')?.value.trim(), ds = get('DTSTART');
  if (!uid || !ds) return null;
  const s = when(ds), de = get('DTEND');
  let ends_at: string | null = null;
  if (s.allDay) {
    // Dia inteiro: na NIKKI, ends_at é o último dia (ou nada, se for um só dia). No .ics, DTEND é o dia a seguir.
    if (de) { const e = when(de); const last = new Date(`${e.date}T12:00:00Z`); last.setUTCDate(last.getUTCDate() - 1); const ld = last.toISOString().slice(0, 10); if (ld > s.date) ends_at = zoned(+ld.slice(0, 4), +ld.slice(5, 7), +ld.slice(8, 10), 0, 0, 0, TZ); }
  } else if (de) ends_at = when(de).iso;
  else { const dur = get('DURATION')?.value.match(/PT?(?:(\d+)H)?(?:(\d+)M)?/); if (dur) ends_at = new Date(Date.parse(s.iso) + ((+(dur[1] ?? 0)) * 60 + +(dur[2] ?? 0)) * 60_000).toISOString(); }
  // Repetições: semanal (com os dias), mensal (no dia ou na n.ª semana), anual. O resto fica como evento simples.
  const rr = Object.fromEntries((get('RRULE')?.value ?? '').split(';').filter(Boolean).map((x) => x.split('=') as [string, string]));
  let repeat: PulledEvent['repeat'] = 'none', weekdays: number[] | null = null, month_mode: 'day' | 'nth' = 'day';
  if (rr.FREQ === 'WEEKLY') { repeat = 'weekly'; const w = (rr.BYDAY ?? '').split(',').map((x) => DAYS.indexOf(x.slice(-2)) + 1).filter((n) => n > 0); weekdays = w.length ? [...new Set(w)].sort() : null; }
  else if (rr.FREQ === 'MONTHLY') { repeat = 'monthly'; month_mode = rr.BYDAY ? 'nth' : 'day'; }
  else if (rr.FREQ === 'YEARLY') repeat = 'yearly';
  let until_on: string | null = null;
  if (repeat !== 'none' && rr.UNTIL) { const u = rr.UNTIL; until_on = u.length > 8 && u.endsWith('Z') ? lisbonDate(new Date(Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), +u.slice(9, 11), +u.slice(11, 13))).toISOString()) : `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`; }
  const skip = ev.filter((p) => p.name === 'EXDATE').flatMap((p) => p.value.split(',').map((v) => when({ ...p, value: v })))
    .map((w) => (w.allDay ? w.date : lisbonDate(w.iso)));
  const title = unesc(get('SUMMARY')?.value ?? '').trim() || 'Sem título';
  const loc = unesc(get('LOCATION')?.value ?? '').trim();
  return {
    uid, title: title.slice(0, 80), starts_at: s.iso, ends_at, all_day: s.allDay, location: loc ? loc.slice(0, 160) : null,
    repeat, weekdays, month_mode, until_on, skip_dates: [...new Set(skip)].sort(),
  };
}

/** O id da NIKKI num UID escrito por ela («<id>@nikki»), ou null se o evento nasceu no iPhone. */
export const nikkiId = (uid: string) => (/^[0-9a-f-]{36}@nikki$/i.test(uid) ? uid.slice(0, 36).toLowerCase() : null);

/** O que mudou num evento (só os campos que o iPhone pode mudar). Vazio: nada a fazer. */
export function changes(cur: Record<string, unknown>, p: PulledEvent): Partial<PulledEvent> {
  const out: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => {
    if (typeof a === 'string' && typeof b === 'string' && /^\d{4}-\d\d-\d\dT/.test(a) && /^\d{4}-\d\d-\d\dT/.test(b)) return Date.parse(a) === Date.parse(b);
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  };
  for (const k of ['title', 'starts_at', 'ends_at', 'all_day', 'location', 'repeat', 'weekdays', 'month_mode', 'until_on', 'skip_dates'] as const) {
    const a = k === 'skip_dates' ? [...((cur[k] as string[] | null) ?? [])].sort() : k === 'weekdays' ? (cur[k] ? [...(cur[k] as number[])].sort() : null) : cur[k];
    if (!same(a, p[k])) out[k] = p[k];
  }
  // A forma da repetição só conta se repetir.
  if (p.repeat === 'none') { delete out.weekdays; delete out.month_mode; delete out.until_on; }
  return out as Partial<PulledEvent>;
}
