// Calendário na hora: o que vai para o calendário «NIKKI» de cada pessoa no iCloud (CalDAV) ou no Google (API).
// Sem dependências da app: usam-no os testes e as funções calendar-link e calendar-sync do Supabase.
// Regras em docs/CALCULOS.md (secção 8).

import { buildIcs, lisbonDay, lisbonLocal, rrule, type IcsEvent } from './ical.ts';

export interface SyncEvent extends IcsEvent { owner_id: string | null; private: boolean; created_by: string }

/** Entra no calendário de uma pessoa: os eventos da casa (sem dono, não privados) e os dela (incluindo os «só para mim»). */
export const visibleTo = (e: SyncEvent, profile: string) =>
  (e.owner_id === null && !e.private) || e.owner_id === profile || (e.private && e.created_by === profile);

// ───────────── iCloud (CalDAV) ─────────────

export const CALDAV_ROOT = 'https://caldav.icloud.com/';

/** Pedidos PROPFIND: quem sou (principal) e onde estão os calendários (calendar-home-set). */
export const PROPFIND_PRINCIPAL = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
export const PROPFIND_HOME = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>';
/** Criar o calendário «NIKKI» (só eventos). */
export const MKCALENDAR = '<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>NIKKI</d:displayname><a:calendar-color>#E8600AFF</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>';

/** O primeiro href dentro de uma propriedade (ex.: current-user-principal) de uma resposta multistatus. */
export function hrefIn(xml: string, prop: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${prop}[^>]*>\\s*<(?:[\\w-]+:)?href[^>]*>([^<]+)</(?:[\\w-]+:)?href>`, 'i'));
  return m ? m[1].trim() : null;
}

/** Um endereço relativo do servidor, completado com a origem de onde veio. */
export const absolute = (href: string, base: string) => new URL(href, base).toString();

/** O evento como ficheiro .ics (um evento por ficheiro, nome = id do evento). */
export const caldavBody = (e: IcsEvent) => buildIcs('NIKKI', [e]);
export const caldavPath = (calendar: string, id: string) => `${calendar.replace(/\/?$/, '/')}${id}.ics`;

// ───────────── Google Calendar ─────────────

/** Só os calendários que a NIKKI cria (não vê nem mexe nos outros). */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

/** Id do evento no Google: só letras a–v e algarismos (base32hex); o uuid sem hífenes serve. */
export const googleId = (id: string) => id.replace(/-/g, '').toLowerCase();

const isoLocal = (iso: string) => { const l = lisbonLocal(iso); return `${l.slice(0, 4)}-${l.slice(4, 6)}-${l.slice(6, 8)}T${l.slice(9, 11)}:${l.slice(11, 13)}:${l.slice(13, 15)}`; };
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

/** O evento no formato da API do Google (hora de Lisboa; repetições em RRULE; dias tirados em EXDATE). */
export function googleEvent(e: IcsEvent) {
  const tz = 'Europe/Lisbon';
  const start = e.all_day ? { date: lisbonDay(e.starts_at) } : { dateTime: isoLocal(e.starts_at), timeZone: tz };
  const end = e.all_day
    ? { date: nextDay(e.ends_at ? lisbonDay(e.ends_at) : lisbonDay(e.starts_at)) }
    : { dateTime: isoLocal(e.ends_at ?? new Date(Date.parse(e.starts_at) + 3_600_000).toISOString()), timeZone: tz };
  const r = rrule(e);
  const ex = (e.skip_dates ?? []).map((d) => (e.all_day ? `EXDATE;VALUE=DATE:${d.replace(/-/g, '')}` : `EXDATE;TZID=${tz}:${d.replace(/-/g, '')}${lisbonLocal(e.starts_at).slice(8)}`));
  return {
    id: googleId(e.id), summary: e.title, ...(e.location ? { location: e.location } : {}), start, end,
    ...(r ? { recurrence: [`RRULE:${r}`, ...ex] } : {}),
  };
}

// ───────────── o acesso guardado (encriptado) e o «state» do Google ─────────────

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(keyB64: string) {
  return crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
/** Encripta (AES-GCM, chave de 32 bytes em base64): «iv.dados» em base64. */
export async function seal(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function open(sealed: string, keyB64: string): Promise<string> {
  const [iv, ct] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(keyB64), unb64(ct)));
}

/** «state» do Google assinado (pessoa, casa, hora), para a volta do Google não poder ser forjada. Vale 15 minutos. */
export async function signState(data: { p: string; h: string }, keyB64: string, now = Date.now()): Promise<string> {
  const body = b64(new TextEncoder().encode(JSON.stringify({ ...data, t: now })));
  const k = await crypto.subtle.importKey('raw', unb64(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))));
  return `${body}.${sig}`.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
export async function readState(state: string, keyB64: string, now = Date.now()): Promise<{ p: string; h: string } | null> {
  const fix = (s: string) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return t + '='.repeat((4 - (t.length % 4)) % 4); };
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const k = await crypto.subtle.importKey('raw', unb64(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('HMAC', k, unb64(fix(sig)), new TextEncoder().encode(fix(body))))) return null;
  const d = JSON.parse(new TextDecoder().decode(unb64(fix(body))));
  return now - d.t <= 15 * 60_000 ? { p: d.p, h: d.h } : null;
}

/** «r•••@icloud.com»: mostrar a conta sem a mostrar toda. */
export const hint = (email: string) => { const [u, d] = email.split('@'); return d ? `${u.slice(0, 1)}•••@${d}` : '•••'; };
