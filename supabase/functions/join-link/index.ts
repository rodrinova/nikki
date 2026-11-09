// Juntar uma pessoa à casa por um link (ou QR), sem e-mail nem palavra-passe.
//   {action:'create'} com a sessão de quem está na casa (não staff), com lugar para mais uma pessoa: o link (7 dias;
//     anula o anterior).
//   {action:'peek', token}: a casa e quem convida (para a página do link), ou porque já não serve.
//   {action:'redeem', token, name}: cria a conta (ativa, na casa) e devolve um token de entrada de uso único (o aparelho
//     troca-o por uma sessão com verifyOtp). Depois de usado, o link só volta a abrir a mesma conta, durante 24 horas.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const clean = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rand = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ABC[b % ABC.length]).join('');
const people = async (h: string) => (await admin.from('memberships').select('profile_id', { count: 'exact', head: true }).eq('household_id', h).neq('role', 'staff')).count ?? 0;
const DAY = 86_400_000;

async function find(token: string) {
  const t = clean(token);
  if (t.length !== 12) return null;
  const { data } = await admin.from('join_links').select('*').eq('token_hash', await sha(t)).maybeSingle();
  return data;
}
/** Porque é que o link não serve (ou null se serve), para quem ainda não o usou. */
async function why(l: { household_id: string; expires_at: string; used_by: string | null; used_at: string | null }) {
  if (l.used_by) return Date.parse(l.used_at ?? '') + DAY > Date.now() ? null : 'usado';
  if (Date.parse(l.expires_at) < Date.now()) return 'expirado';
  if (await people(l.household_id) >= 2) return 'casa cheia';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'create') {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const uid = (await admin.auth.getUser(jwt)).data.user?.id;
    if (!uid) return json({ error: 'sem sessão' }, 401);
    const { data: m } = await admin.from('memberships').select('household_id, role').eq('profile_id', uid).neq('role', 'staff').order('joined_at', { ascending: true }).limit(1).maybeSingle();
    const { data: p } = await admin.from('profiles').select('status').eq('id', uid).maybeSingle();
    if (!m || p?.status !== 'active') return json({ error: 'sem acesso' }, 403);
    const h = body.household_id && body.household_id !== m.household_id
      ? (await admin.from('memberships').select('household_id').eq('profile_id', uid).eq('household_id', body.household_id).neq('role', 'staff').maybeSingle()).data?.household_id
      : m.household_id;
    if (!h) return json({ error: 'sem acesso' }, 403);
    if (await people(h) >= 2) return json({ error: 'casa cheia' }, 400);
    const token = rand(12), expires_at = new Date(Date.now() + 7 * DAY).toISOString();
    const { error } = await admin.from('join_links').upsert({ household_id: h, token_hash: await sha(token), created_by: uid, created_at: new Date().toISOString(), expires_at, used_by: null, used_at: null });
    if (error) return json({ error: error.message }, 500);
    return json({ token, expires_at });
  }

  if (body.action === 'peek') {
    const l = await find(body.token);
    if (!l) return json({ error: 'link inválido' }, 400);
    const w = await why(l);
    const { data: h } = await admin.from('households').select('name').eq('id', l.household_id).maybeSingle();
    const { data: by } = l.created_by ? await admin.from('profiles').select('name').eq('id', l.created_by).maybeSingle() : { data: null };
    return json({ house: h?.name ?? '', from: by?.name ?? '', used: !!l.used_by, error: w ?? undefined });
  }

  if (body.action === 'redeem') {
    const l = await find(body.token);
    if (!l) return json({ error: 'link inválido' }, 400);
    const w = await why(l);
    if (w) return json({ error: w }, 400);
    let uid = l.used_by as string | null, email: string | null = null;
    if (uid) email = (await admin.auth.admin.getUserById(uid)).data.user?.email ?? null;
    if (!uid || !email) {
      const name = String(body.name ?? '').trim().slice(0, 60);
      if (!name) return json({ error: 'sem nome' }, 400);
      email = `pessoa-${rand(10)}@membros.nikki.app`; // nunca recebe nada: só serve para entrar
      const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
      if (error || !u.user) return json({ error: error?.message ?? 'conta não criada' }, 500);
      uid = u.user.id;
      await admin.from('profiles').update({ name, status: 'active', approved_at: new Date().toISOString(), approved_via: 'invite' }).eq('id', uid);
      const { error: e2 } = await admin.from('memberships').insert({ household_id: l.household_id, profile_id: uid, role: 'admin' });
      if (e2) return json({ error: e2.message }, 500);
      await admin.from('join_links').update({ used_by: uid, used_at: new Date().toISOString() }).eq('household_id', l.household_id);
    }
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !link.properties?.hashed_token) return json({ error: error?.message ?? 'sem token' }, 500);
    return json({ token_hash: link.properties.hashed_token });
  }

  return json({ error: 'pedido desconhecido' }, 400);
});
