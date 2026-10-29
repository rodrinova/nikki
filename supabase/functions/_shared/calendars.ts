// Escrever no calendário «NIKKI» de uma pessoa: iCloud (CalDAV) ou Google (API). Usado por calendar-link e calendar-sync.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  CALDAV_ROOT, MKCALENDAR, PROPFIND_HOME, PROPFIND_PRINCIPAL, absolute, caldavBody, caldavPath, googleEvent, googleId, hrefIn,
  open, seal, visibleTo, type SyncEvent,
} from '../../../src/lib/calsync.ts';

export const KEY = Deno.env.get('CALENDAR_KEY')!; // 32 bytes em base64 (supabase secrets set CALENDAR_KEY=…)
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
export const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Quem chama (pela sessão da app) e se é desta casa. */
export async function caller(req: Request, household: string): Promise<string | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const { data } = await admin.auth.getUser(jwt);
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: m } = await admin.from('memberships').select('profile_id').eq('household_id', household).eq('profile_id', uid).maybeSingle();
  return m ? uid : null;
}

export interface Link { id: string; profile_id: string; household_id: string; provider: 'icloud' | 'google'; calendar_ref: string; secret_enc: string }

// ───────────── iCloud ─────────────

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;
async function dav(url: string, method: string, auth: string, body?: string, depth = '0', type = 'application/xml; charset=utf-8') {
  return fetch(url, { method, headers: { authorization: auth, depth, 'content-type': type }, body });
}

/** Entra no iCloud com a palavra-passe de app, encontra os calendários e cria (ou reaproveita) o «NIKKI». */
export async function icloudConnect(appleId: string, appPassword: string): Promise<string> {
  const auth = basic(appleId, appPassword);
  const r1 = await dav(CALDAV_ROOT, 'PROPFIND', auth, PROPFIND_PRINCIPAL);
  if (r1.status === 401) throw new Error('O iCloud não aceitou o e-mail ou a palavra-passe de app.');
  const principal = hrefIn(await r1.text(), 'current-user-principal');
  if (!principal) throw new Error('O iCloud não respondeu como esperado.');
  const r2 = await dav(absolute(principal, CALDAV_ROOT), 'PROPFIND', auth, PROPFIND_HOME);
  const home = hrefIn(await r2.text(), 'calendar-home-set');
  if (!home) throw new Error('Não encontrei os calendários do iCloud.');
  const cal = absolute(home, absolute(principal, CALDAV_ROOT)).replace(/\/?$/, '/') + 'nikki/';
  const r3 = await dav(cal, 'MKCALENDAR', auth, MKCALENDAR);
  if (!r3.ok && r3.status !== 405) throw new Error(`O iCloud não deixou criar o calendário (${r3.status}).`); // 405: já existe
  return cal;
}

// ───────────── Google ─────────────

export async function googleToken(refresh: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const d = await r.json();
  if (!d.access_token) throw new Error('O Google não renovou o acesso (pode ter sido revogado).');
  return d.access_token;
}
const gapi = (token: string, path: string, method = 'GET', body?: unknown) =>
  fetch(`https://www.googleapis.com/calendar/v3${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export async function googleCreateCalendar(token: string): Promise<string> {
  const r = await gapi(token, '/calendars', 'POST', { summary: 'NIKKI', timeZone: 'Europe/Lisbon', description: 'A agenda da casa, escrita pela NIKKI.' });
  const d = await r.json();
  if (!d.id) throw new Error('O Google não deixou criar o calendário.');
  return d.id;
}

// ───────────── sincronizar ─────────────

/** Põe (ou tira) um evento no calendário de uma ligação, consoante a pessoa o deve ver. */
export async function syncOne(link: Link, e: SyncEvent | null, eventId: string, cache: Map<string, string>) {
  const secret = await open(link.secret_enc, KEY);
  const show = e !== null && visibleTo(e, link.profile_id);
  if (link.provider === 'icloud') {
    const { u, p } = JSON.parse(secret) as { u: string; p: string };
    const url = caldavPath(link.calendar_ref, eventId), auth = basic(u, p);
    const r = show ? await dav(url, 'PUT', auth, caldavBody(e!), '0', 'text/calendar; charset=utf-8') : await dav(url, 'DELETE', auth);
    if (!r.ok && !(r.status === 404 && !show)) throw new Error(`iCloud ${r.status}`);
    return;
  }
  const token = cache.get(link.id) ?? (await googleToken(secret));
  cache.set(link.id, token);
  const cal = encodeURIComponent(link.calendar_ref), gid = googleId(eventId);
  if (!show) { const r = await gapi(token, `/calendars/${cal}/events/${gid}`, 'DELETE'); if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Google ${r.status}`); return; }
  const body = googleEvent(e!);
  let r = await gapi(token, `/calendars/${cal}/events/${gid}`, 'PUT', body);
  if (r.status === 404) r = await gapi(token, `/calendars/${cal}/events`, 'POST', body);
  if (!r.ok) throw new Error(`Google ${r.status}`);
}

const COLS = 'id, title, starts_at, ends_at, all_day, location, repeat, weekdays, month_mode, until_on, skip_dates, owner_id, private, created_by';

/** Sincroniza um evento (ou todos, sem eventId) para as ligações de uma casa (ou só uma ligação). */
export async function syncHousehold(household: string, eventId?: string, onlyLink?: string) {
  let q = admin.from('calendar_links').select('id, profile_id, household_id, provider, calendar_ref, secret_enc').eq('household_id', household);
  if (onlyLink) q = q.eq('id', onlyLink);
  const { data: links } = await q;
  if (!links?.length) return { links: 0 };
  let eq = admin.from('events').select(COLS).eq('household_id', household);
  if (eventId) eq = eq.eq('id', eventId);
  const { data: evs } = await eq;
  const cache = new Map<string, string>();
  const ids = eventId ? [eventId] : (evs ?? []).map((e) => e.id);
  for (const link of links as Link[]) {
    try {
      for (const id of ids) await syncOne(link, ((evs ?? []).find((e) => e.id === id) as SyncEvent | undefined) ?? null, id, cache);
      await admin.from('calendar_links').update({ status: 'ok', last_error: null, last_sync_at: new Date().toISOString() }).eq('id', link.id);
    } catch (err) {
      await admin.from('calendar_links').update({ status: 'error', last_error: String((err as Error).message).slice(0, 200) }).eq('id', link.id);
    }
  }
  return { links: links.length, events: ids.length };
}

export { seal };
