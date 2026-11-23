// Outro calendário da pessoa por subscrição (.ics/webcal; ex.: o da universidade no Compass, o do trabalho): só leitura.
//   POST {action:'add', household, name, url} com a sessão: testa o link, guarda-o encriptado, traz os eventos.
//   POST {action:'remove', household} com a sessão: esquece a subscrição e tira os eventos dela da agenda.
//   POST {action:'pull', household} com a sessão, ou com x-cron-secret (de 15 em 15 minutos): atualiza.
// Os eventos entram como da pessoa (owner_id), com o título, visíveis à casa; mudam e saem quando lá mudam e saem.
// O link fica encriptado (AES-GCM, a chave do calendário em nikki.calendar_config) e só esta função o lê.
// Publicar juntando num só ficheiro (esbuild), sem verificação de JWT (o agendamento não traz sessão).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { changes, parseEvent, splitFeed } from '../../../src/lib/icspull.ts';
import { open, seal } from '../../../src/lib/calsync.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
const COLS = 'id, title, starts_at, ends_at, all_day, location, repeat, weekdays, month_mode, until_on, skip_dates, ext_uid';
interface Feed { id: string; profile_id: string; household_id: string; url_enc: string }

let key: string | null = Deno.env.get('CALENDAR_KEY') ?? null;
async function calKey() {
  if (key) return key;
  const { data } = await admin.from('calendar_config').select('key').eq('id', true).single();
  if (!data?.key) throw new Error('Falta a chave do calendário.');
  return (key = data.key as string);
}

function feedUrl(raw: string) {
  const u = new URL(String(raw).trim().replace(/^webcals?:\/\//i, 'https://'));
  if (u.protocol !== 'https:') throw new Error('O link tem de começar por https:// ou webcal://.');
  return u.toString();
}
async function fetchFeed(url: string) {
  const r = await fetch(url, { headers: { accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`O calendário não respondeu (${r.status}).`);
  const t = await r.text();
  if (t.length > 5_000_000 || !/BEGIN:VCALENDAR/i.test(t)) throw new Error('Este link não é de um calendário (.ics).');
  return t;
}

async function pull(f: Feed, text?: string) {
  const parts = splitFeed(text ?? await fetchFeed(await open(f.url_enc, await calKey())));
  const tag = `ics:${f.id.slice(0, 8)}:`;
  const from = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: evs } = await admin.from('events').select(COLS).eq('household_id', f.household_id).like('ext_uid', `${tag}%`);
  const mine = new Map(((evs ?? []) as { id: string; ext_uid: string }[]).map((e) => [e.ext_uid, e]));
  const there = new Set<string>(), stats = { new: 0, changed: 0, removed: 0 };
  for (const part of parts) {
    const pe = parseEvent(part);
    if (!pe || (pe.repeat === 'none' && (pe.ends_at ?? pe.starts_at) < from)) continue;
    const k = `${tag}${pe.uid}`.slice(0, 300);
    there.add(k);
    const ev = mine.get(k);
    if (ev) {
      const diff = changes(ev as unknown as Record<string, unknown>, pe);
      if (Object.keys(diff).length) { await admin.from('events').update(diff).eq('id', ev.id); stats.changed++; }
    } else {
      await admin.from('events').insert({
        household_id: f.household_id, created_by: f.profile_id, owner_id: f.profile_id, private: false, ask_share: false, kind: 'event', ext_uid: k,
        title: pe.title, starts_at: pe.starts_at, ends_at: pe.ends_at, all_day: pe.all_day, location: pe.location,
        repeat: pe.repeat, weekdays: pe.weekdays, month_mode: pe.month_mode, until_on: pe.until_on, skip_dates: pe.skip_dates,
      });
      stats.new++;
    }
  }
  if (parts.length) for (const [k, e] of mine) if (!there.has(k)) { await admin.from('events').delete().eq('id', e.id); stats.removed++; }
  await admin.from('calendar_feeds').update({ status: 'ok', last_error: null, last_sync_at: new Date().toISOString() }).eq('id', f.id);
  return stats;
}
async function pullSafe(f: Feed) {
  try { return await pull(f); } catch (e) {
    await admin.from('calendar_feeds').update({ status: 'error', last_error: String((e as Error).message).slice(0, 200) }).eq('id', f.id);
    return { error: (e as Error).message };
  }
}

async function caller(req: Request, household: string) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const uid = (await admin.auth.getUser(jwt)).data.user?.id;
  if (!uid) return null;
  const { data: m } = await admin.from('memberships').select('role').eq('household_id', household).eq('profile_id', uid).maybeSingle();
  return m && m.role !== 'staff' ? uid : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const secret = req.headers.get('x-cron-secret');
  if (secret) {
    const { data } = await admin.from('push_config').select('cron_secret').eq('id', true).single();
    if (!data || data.cron_secret !== secret) return json({ error: 'Sem acesso.' }, 401);
    const { data: feeds } = await admin.from('calendar_feeds').select('id, profile_id, household_id, url_enc');
    const out: Record<string, unknown> = {};
    for (const f of (feeds ?? []) as Feed[]) out[f.id] = await pullSafe(f);
    return json(out);
  }
  const uid = body.household ? await caller(req, String(body.household)) : null;
  if (!uid) return json({ error: 'Sem acesso.' }, 401);
  const mine = async () => (await admin.from('calendar_feeds').select('id, profile_id, household_id, url_enc').eq('profile_id', uid).eq('household_id', body.household).maybeSingle()).data as Feed | null;

  if (body.action === 'add') {
    try {
      const url = feedUrl(String(body.url ?? ''));
      const text = await fetchFeed(url);
      const name = String(body.name ?? '').trim().slice(0, 40) || 'Calendário';
      const { data, error } = await admin.from('calendar_feeds').upsert({ profile_id: uid, household_id: body.household, name, url_enc: await seal(url, await calKey()), status: 'ok', last_error: null }, { onConflict: 'profile_id,household_id' }).select('id, profile_id, household_id, url_enc').single();
      if (error || !data) throw new Error(`Não consegui guardar (${error?.message ?? 'sem dados'}).`);
      return json({ ok: true, ...(await pull(data as Feed, text)) });
    } catch (e) { return json({ error: (e as Error).message }); } // 200: a app mostra a razão
  }
  if (body.action === 'remove') {
    const f = await mine();
    if (f) {
      await admin.from('events').delete().eq('household_id', f.household_id).like('ext_uid', `ics:${f.id.slice(0, 8)}:%`);
      await admin.from('calendar_feeds').delete().eq('id', f.id);
    }
    return json({ ok: true });
  }
  if (body.action === 'pull') {
    const f = await mine();
    return json(f ? await pullSafe(f) : { ok: true });
  }
  return json({ error: 'Pedido desconhecido.' }, 400);
});
