// Escrever no calendário «NIKKI» de uma pessoa: iCloud (CalDAV) ou Google (API). Usado por calendar-link e calendar-sync.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  CALDAV_ROOT, MKCALENDAR, PROPFIND_HOME, PROPFIND_PRINCIPAL, absolute, caldavBody, caldavPath, googleEvent, googleId, hrefIn,
  open, seal, visibleTo, type SyncEvent,
} from '../../../src/lib/calsync.ts';
import { REPORT_ALL, changes, nikkiId, parseEvent, parseMultistatus } from '../../../src/lib/icspull.ts';

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
// A chave que encripta os acessos guardados (32 bytes em base64): o segredo CALENDAR_KEY, se existir; senão, a da
// tabela nikki.calendar_config (criada pela migração, só a chave de serviço a lê).
let cachedKey: string | null = Deno.env.get('CALENDAR_KEY') ?? null;
export async function calKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const { data, error } = await admin.from('calendar_config').select('key').eq('id', true).single();
  if (error || !data?.key) throw new Error('Falta a chave do calendário.');
  cachedKey = data.key as string;
  return cachedKey;
}
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
  if (r1.status === 401 || r1.status === 403) throw new Error('O iCloud não aceitou o e-mail ou a palavra-passe de app. Confirma o e-mail do Apple ID (o de iniciar sessão no iPhone) e cria uma palavra-passe de app nova.');
  const t1 = await r1.text();
  const principal = hrefIn(t1, 'current-user-principal');
  if (!principal) { console.error('icloud principal', r1.status, t1.slice(0, 400)); throw new Error(`O iCloud não respondeu como esperado (${r1.status}).`); }
  const r2 = await dav(absolute(principal, CALDAV_ROOT), 'PROPFIND', auth, PROPFIND_HOME);
  const t2 = await r2.text();
  const home = hrefIn(t2, 'calendar-home-set');
  if (!home) { console.error('icloud home', r2.status, t2.slice(0, 400)); throw new Error(`Não encontrei os calendários do iCloud (${r2.status}).`); }
  const cal = absolute(home, absolute(principal, CALDAV_ROOT)).replace(/\/?$/, '/') + 'nikki/';
  const r3 = await dav(cal, 'MKCALENDAR', auth, MKCALENDAR);
  if (!r3.ok && r3.status !== 405) { console.error('icloud mkcalendar', r3.status, cal, (await r3.text()).slice(0, 400)); throw new Error(`O iCloud não deixou criar o calendário (${r3.status}).`); } // 405: já existe
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
  const secret = await open(link.secret_enc, await calKey());
  const show = e !== null && visibleTo(e, link.profile_id);
  if (link.provider === 'icloud') {
    const { u, p } = JSON.parse(secret) as { u: string; p: string };
    // O endereço onde está no iCloud: o que ficou registado (os que nasceram no iPhone têm o nome que o iPhone deu).
    const { data: seen } = await admin.from('calendar_seen').select('href').eq('link_id', link.id).eq('event_id', eventId).maybeSingle();
    const url = seen?.href ? absolute(seen.href, link.calendar_ref) : caldavPath(link.calendar_ref, eventId), auth = basic(u, p);
    const r = show ? await dav(url, 'PUT', auth, caldavBody(e!), '0', 'text/calendar; charset=utf-8') : await dav(url, 'DELETE', auth);
    if (!r.ok && !(r.status === 404 && !show)) throw new Error(`iCloud ${r.status}`);
    // Fica registado o que lá está (e a etag), para a volta saber o que mudou no iPhone.
    if (show) await admin.from('calendar_seen').upsert({ link_id: link.id, event_id: eventId, href: new URL(url).pathname, etag: r.headers.get('etag') }, { onConflict: 'link_id,event_id' });
    else await admin.from('calendar_seen').delete().eq('link_id', link.id).eq('event_id', eventId);
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

export const COLS = 'id, household_id, title, starts_at, ends_at, all_day, location, repeat, weekdays, month_mode, until_on, skip_dates, owner_id, private, created_by, ext_uid';

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

// ───────────── do iPhone para a NIKKI ─────────────

/**
 * Lê o calendário «NIKKI» do iCloud de uma ligação e traz para a NIKKI o que lá mudou:
 * - eventos novos (criados no iPhone): entram como «só para mim» de quem os criou, e a NIKKI pergunta de quem são;
 * - eventos mudados no iPhone (a etag mudou): a NIKKI fica com a versão do iPhone;
 * - eventos apagados no iPhone: saem da NIKKI (e dos calendários dos outros);
 * - eventos da NIKKI que ainda não estão lá (ou que lá ficaram depois de apagados na NIKKI): acerta-os.
 */
export async function pullLink(link: Link) {
  const { u, p } = JSON.parse(await open(link.secret_enc, await calKey())) as { u: string; p: string };
  const auth = basic(u, p);
  const r = await dav(link.calendar_ref, 'REPORT', auth, REPORT_ALL, '1');
  if (r.status !== 207) throw new Error(`iCloud ${r.status}`);
  const items = parseMultistatus(await r.text());
  const [{ data: evs }, { data: seenRows }] = await Promise.all([
    admin.from('events').select(COLS).eq('household_id', link.household_id),
    admin.from('calendar_seen').select('event_id, href, etag').eq('link_id', link.id),
  ]);
  const events = (evs ?? []) as (SyncEvent & { household_id: string; ext_uid: string | null })[];
  const seen = new Map((seenRows ?? []).map((s) => [s.event_id as string, s as { event_id: string; href: string; etag: string | null }]));
  const byHref = new Map((seenRows ?? []).map((s) => [s.href as string, s.event_id as string]));
  const path = (h: string) => new URL(h, link.calendar_ref).pathname;
  const there = new Set<string>(), stats = { new: 0, changed: 0, removed: 0, pushed: 0 };
  const touched: string[] = [];
  for (const it of items) {
    const pe = parseEvent(it.ics);
    if (!pe) continue;
    const href = path(it.href);
    const id = byHref.get(href) ?? nikkiId(pe.uid) ?? events.find((e) => e.ext_uid === pe.uid)?.id ?? null;
    const ev = id ? events.find((e) => e.id === id) : undefined;
    if (ev && visibleTo(ev, link.profile_id)) {
      there.add(ev.id);
      const s = seen.get(ev.id);
      if (s && s.etag && it.etag && s.etag === it.etag) continue; // igual ao que a NIKKI lá pôs
      const diff = changes(ev as unknown as Record<string, unknown>, pe);
      if (Object.keys(diff).length) { await admin.from('events').update(diff).eq('id', ev.id); stats.changed++; touched.push(ev.id); }
      await admin.from('calendar_seen').upsert({ link_id: link.id, event_id: ev.id, href, etag: it.etag }, { onConflict: 'link_id,event_id' });
    } else if (nikkiId(pe.uid) || ev) {
      // Já não existe na NIKKI (ou já não é para esta pessoa): sai do iPhone.
      await dav(absolute(it.href, link.calendar_ref), 'DELETE', auth);
      if (id) await admin.from('calendar_seen').delete().eq('link_id', link.id).eq('event_id', id);
    } else {
      // Novo, criado no iPhone: fica «só para mim» de quem o criou até escolher de quem é.
      const { data: row } = await admin.from('events').insert({
        household_id: link.household_id, created_by: link.profile_id, owner_id: link.profile_id, private: true, ask_share: true, kind: 'event', ext_uid: pe.uid,
        title: pe.title, starts_at: pe.starts_at, ends_at: pe.ends_at, all_day: pe.all_day, location: pe.location,
        repeat: pe.repeat, weekdays: pe.weekdays, month_mode: pe.month_mode, until_on: pe.until_on, skip_dates: pe.skip_dates,
      }).select('id').single();
      if (row) { await admin.from('calendar_seen').insert({ link_id: link.id, event_id: row.id, href, etag: it.etag }); there.add(row.id); stats.new++; }
    }
  }
  // O que estava lá e desapareceu: apagado no iPhone. Por cautela, uma resposta vazia não apaga nada.
  if (items.length) for (const s of seen.values()) if (!there.has(s.event_id) && events.some((e) => e.id === s.event_id && visibleTo(e, link.profile_id))) {
    await admin.from('calendar_seen').delete().eq('link_id', link.id).eq('event_id', s.event_id); // os dos outros ficam: o syncHousehold usa-os para tirar lá
    await admin.from('events').delete().eq('id', s.event_id);
    stats.removed++; touched.push(s.event_id);
  }
  await admin.from('calendar_links').update({ status: 'ok', last_error: null, last_sync_at: new Date().toISOString() }).eq('id', link.id);
  // O que mudou no iPhone de uma pessoa vai também para os calendários dos outros da casa.
  for (const id of touched) await syncHousehold(link.household_id, id);
  // O que é para esta pessoa e ainda não está no iPhone dela (ligação nova, ou um envio que falhou).
  const cache = new Map<string, string>();
  for (const e of events) if (visibleTo(e, link.profile_id) && !there.has(e.id) && !touched.includes(e.id)) { await syncOne(link, e, e.id, cache); stats.pushed++; }
  return stats;
}

/** Traz o que mudou no iPhone de todas as ligações ao iCloud (de uma casa, ou de todas). */
export async function pullAll(household?: string) {
  let q = admin.from('calendar_links').select('id, profile_id, household_id, provider, calendar_ref, secret_enc').eq('provider', 'icloud');
  if (household) q = q.eq('household_id', household);
  const { data: links } = await q;
  const out: Record<string, unknown> = {};
  for (const l of (links ?? []) as Link[]) {
    try { out[l.id] = await pullLink(l); } catch (err) {
      await admin.from('calendar_links').update({ status: 'error', last_error: String((err as Error).message).slice(0, 200) }).eq('id', l.id);
      out[l.id] = { error: (err as Error).message };
    }
  }
  return out;
}
