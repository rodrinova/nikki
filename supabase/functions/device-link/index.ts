// Entrar noutro aparelho. {action:'create'} com a sessão: devolve um código de 8 letras (10 minutos, uma só vez).
// {action:'redeem', code} sem sessão: se o código for válido, devolve um token de entrada de uso único para a conta
// (o aparelho novo troca-o por uma sessão sua com verifyOtp). Nada de e-mails: o código passa de um aparelho ao outro.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L: lê-se sem enganos
const clean = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'create') {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const uid = (await admin.auth.getUser(jwt)).data.user?.id;
    if (!uid) return json({ error: 'sem sessão' }, 401);
    await admin.from('device_codes').delete().or(`expires_at.lt.${new Date().toISOString()},profile_id.eq.${uid}`);
    const r = crypto.getRandomValues(new Uint8Array(8));
    const code = [...r].map((b) => ABC[b % ABC.length]).join('');
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await admin.from('device_codes').insert({ code_hash: await sha(code), profile_id: uid, expires_at });
    if (error) return json({ error: error.message }, 500);
    return json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expires_at });
  }

  if (body.action === 'redeem') {
    const code = clean(body.code);
    if (code.length !== 8) return json({ error: 'código inválido' }, 400);
    // Usa-se uma só vez: marcar e ler na mesma operação (dois aparelhos com o mesmo código: só um entra).
    const { data: row } = await admin.from('device_codes').update({ used_at: new Date().toISOString() })
      .eq('code_hash', await sha(code)).is('used_at', null).gt('expires_at', new Date().toISOString()).select('profile_id').maybeSingle();
    if (!row) return json({ error: 'código inválido' }, 400);
    const { data: u } = await admin.auth.admin.getUserById(row.profile_id);
    if (!u.user?.email) return json({ error: 'conta sem e-mail' }, 400);
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
    if (error || !link.properties?.hashed_token) return json({ error: error?.message ?? 'sem token' }, 500);
    return json({ token_hash: link.properties.hashed_token });
  }

  return json({ error: 'pedido desconhecido' }, 400);
});
