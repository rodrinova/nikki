// O calendário da NIKKI em formato iCalendar (.ics), para o iPhone e o Google subscreverem (só de leitura).
// Sem dependências: usa-o a app (testes) e a função calendar do Supabase. Regras em docs/CALCULOS.md (secção 8).

export interface IcsEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location?: string | null;
  repeat?: 'none' | 'weekly' | 'monthly' | 'yearly';
  weekdays?: number[] | null;
  month_mode?: 'day' | 'nth';
  until_on?: string | null;
  skip_dates?: string[] | null;
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const ymd = (s: string) => s.slice(0, 10).replace(/-/g, '');

/** O dia de calendário (em Lisboa) de um instante. */
export function lisbonDay(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return p; // AAAA-MM-DD
}
/** A hora local de Lisboa de um instante, como AAAAMMDDTHHMMSS (para DTSTART;TZID=Europe/Lisbon). */
export function lisbonLocal(iso: string): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}
// Lisboa: hora de verão do último domingo de março ao último de outubro. Com o fuso, as repetições mantêm a hora local.
const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Lisbon',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:WEST', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:WET', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const weekdayOf = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Texto escapado (\\ ; , e mudanças de linha). */
export const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linhas com mais de 75 octetos dobram-se (continuação começa com um espaço). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function rrule(e: IcsEvent): string | null {
  const day = lisbonDay(e.starts_at);
  const until = e.until_on ? `;UNTIL=${ymd(e.until_on)}T235959Z` : '';
  switch (e.repeat ?? 'none') {
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${(e.weekdays?.length ? [...e.weekdays].sort() : [weekdayOf(day)]).map((w) => BYDAY[w - 1]).join(',')}${until}`;
    case 'monthly': {
      if (e.month_mode !== 'nth') return `FREQ=MONTHLY;BYMONTHDAY=${Number(day.slice(8, 10))}${until}`;
      const dom = Number(day.slice(8, 10)), last = dom + 7 > daysIn(Number(day.slice(0, 4)), Number(day.slice(5, 7)));
      const n = Math.ceil(dom / 7);
      return `FREQ=MONTHLY;BYDAY=${last && n >= 5 ? -1 : n}${BYDAY[weekdayOf(day) - 1]}${until}`;
    }
    case 'yearly': return day.slice(5) === '02-29' ? `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1${until}` : `FREQ=YEARLY${until}`;
    default: return null;
  }
}

/** O calendário inteiro. `now` entra no DTSTAMP (para os testes serem fixos). */
export function buildIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NIKKI//Agenda//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Lisbon', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTIMEZONE];
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@nikki`, `DTSTAMP:${utc(now)}`, `SUMMARY:${esc(e.title)}`);
    if (e.all_day) {
      const d = lisbonDay(e.starts_at), end = e.ends_at ? nextDay(lisbonDay(e.ends_at)) : nextDay(d);
      L.push(`DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(end)}`);
    } else {
      const en = e.ends_at ?? new Date(Date.parse(e.starts_at) + 3_600_000).toISOString();
      L.push(`DTSTART;TZID=Europe/Lisbon:${lisbonLocal(e.starts_at)}`, `DTEND;TZID=Europe/Lisbon:${lisbonLocal(en)}`);
    }
    const r = rrule(e);
    if (r) L.push(`RRULE:${r}`);
    for (const sk of e.skip_dates ?? []) {
      if (e.all_day) L.push(`EXDATE;VALUE=DATE:${ymd(sk)}`);
      else L.push(`EXDATE;TZID=Europe/Lisbon:${ymd(sk)}${lisbonLocal(e.starts_at).slice(8)}`); // a mesma hora de Lisboa nesse dia
    }
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
