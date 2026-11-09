// Entrar como quem faz o housekeeping, por um link (sem e-mail nem convite).
//   {action:'create', hk_id} com a sessão de quem administra a casa (não staff): gera o link (anula o anterior).
//   {action:'redeem', token} sem sessão: na primeira vez cria a conta dela (papel staff, ativa, ligada à ficha);
//   devolve um token de entrada de uso único (o aparelho troca-o por uma sessão com verifyOtp), como o device-link.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o, 1/i/l
const clean = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rand = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ABC[b % ABC.length]).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'create') {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const uid = (await admin.auth.getUser(jwt)).data.user?.id;
    if (!uid) return json({ error: 'sem sessão' }, 401);
    const { data: hk } = await admin.from('housekeeping').select('id, household_id, archived').eq('id', body.hk_id).maybeSingle();
    if (!hk || hk.archived) return json({ error: 'ficha não encontrada' }, 404);
    const { data: m } = await admin.from('memberships').select('role').eq('household_id', hk.household_id).eq('profile_id', uid).maybeSingle();
    const { data: p } = await admin.from('profiles').select('status').eq('id', uid).maybeSingle();
    if (!m || m.role === 'staff' || p?.status !== 'active') return json({ error: 'sem acesso' }, 403);
    const token = rand(12);
    const { error } = await admin.from('hk_links').upsert({ hk_id: hk.id, token_hash: await sha(token), created_by: uid, created_at: new Date().toISOString(), used_at: null, uses: 0 });
    if (error) return json({ error: error.message }, 500);
    return json({ token });
  }

  if (body.action === 'redeem') {
    const token = clean(body.token);
    if (token.length !== 12) return json({ error: 'link inválido' }, 400);
    const { data: l } = await admin.from('hk_links').select('hk_id, uses').eq('token_hash', await sha(token)).maybeSingle();
    if (!l) return json({ error: 'link inválido' }, 400);
    const { data: hk } = await admin.from('housekeeping').select('id, household_id, profile_id, name, archived').eq('id', l.hk_id).maybeSingle();
    if (!hk || hk.archived) return json({ error: 'link inválido' }, 400);
    let uid: string | null = hk.profile_id;
    let email: string | null = null;
    if (uid) email = (await admin.auth.admin.getUserById(uid)).data.user?.email ?? null;
    if (!uid || !email) {
      // A primeira vez: a conta dela, com um e-mail que ninguém usa (nunca recebe mensagens; só serve para entrar).
      email = `casa-${hk.id.slice(0, 8)}-${rand(6)}@staff.nikki.app`;
      const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: hk.name } });
      if (error || !u.user) return json({ error: error?.message ?? 'conta não criada' }, 500);
      uid = u.user.id;
      await admin.from('housekeeping').update({ profile_id: uid }).eq('id', hk.id);
    }
    // Ativa, na casa com o papel staff (mesmo que tenha saído entretanto).
    await admin.from('profiles').update({ status: 'active', approved_at: new Date().toISOString(), approved_via: 'invite' }).eq('id', uid).neq('status', 'active');
    await admin.from('memberships').upsert({ household_id: hk.household_id, profile_id: uid, role: 'staff' }, { onConflict: 'household_id,profile_id', ignoreDuplicates: true });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !link.properties?.hashed_token) return json({ error: error?.message ?? 'sem token' }, 500);
    await admin.from('hk_links').update({ used_at: new Date().toISOString(), uses: (l.uses ?? 0) + 1 }).eq('hk_id', hk.id);
    return json({ token_hash: link.properties.hashed_token, name: hk.name });
  }

  return json({ error: 'pedido desconhecido' }, 400);
});
