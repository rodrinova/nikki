// Ligar ou desligar o calendário «NIKKI» de uma pessoa ao iCloud ou ao Google.
//   POST {action:'icloud', household, apple_id, app_password}  → testa, cria o calendário, guarda (encriptado), copia tudo
//   POST {action:'google', household}                          → devolve o endereço para entrar com o Google
//   GET  ?code&state                                           → volta do Google: guarda o acesso, cria o calendário, copia tudo
//   POST {action:'unlink', household, provider}                → esquece a ligação (o calendário fica no telemóvel; apaga-se lá)
// Publicar: supabase functions deploy calendar-link --no-verify-jwt (a volta do Google não traz sessão; o resto verifica-a).

import { readState, signState, hint, GOOGLE_SCOPE } from '../../../src/lib/calsync.ts';
import { KEY, admin, caller, cors, googleCreateCalendar, googleToken, icloudConnect, json, seal, syncHousehold } from '../_shared/calendars.ts';

const SELF = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-link`;
const APP = Deno.env.get('APP_URL') ?? 'https://nikki.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  // Volta do Google.
  if (req.method === 'GET' && url.searchParams.get('state')) {
    const st = await readState(url.searchParams.get('state')!, KEY);
    const code = url.searchParams.get('code');
    if (!st || !code) return Response.redirect(`${APP}/?calendario=erro`, 302);
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, redirect_uri: SELF, grant_type: 'authorization_code' }) });
    const tok = await r.json();
    if (!tok.refresh_token) return Response.redirect(`${APP}/?calendario=erro`, 302);
    const access = await googleToken(tok.refresh_token);
    const cal = await googleCreateCalendar(access);
    const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${access}` } })).json().catch(() => ({}));
    const { data } = await admin.from('calendar_links').upsert({ profile_id: st.p, household_id: st.h, provider: 'google', account_hint: info.email ? hint(info.email) : 'Google', calendar_ref: cal, secret_enc: await seal(tok.refresh_token, KEY), status: 'ok' }, { onConflict: 'profile_id,household_id,provider' }).select('id').single();
    await syncHousehold(st.h, undefined, data?.id);
    return Response.redirect(`${APP}/?calendario=google`, 302);
  }

  const body = await req.json().catch(() => ({}));
  const uid = body.household ? await caller(req, body.household) : null;
  if (!uid) return json({ error: 'Sem acesso.' }, 401);

  if (body.action === 'icloud') {
    try {
      const cal = await icloudConnect(String(body.apple_id).trim(), String(body.app_password).replace(/\s/g, ''));
      const { data } = await admin.from('calendar_links').upsert({ profile_id: uid, household_id: body.household, provider: 'icloud', account_hint: hint(String(body.apple_id)), calendar_ref: cal, secret_enc: await seal(JSON.stringify({ u: String(body.apple_id).trim(), p: String(body.app_password).replace(/\s/g, '') }), KEY), status: 'ok' }, { onConflict: 'profile_id,household_id,provider' }).select('id').single();
      return json({ ok: true, ...(await syncHousehold(body.household, undefined, data?.id)) });
    } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  if (body.action === 'google') {
    const state = await signState({ p: uid, h: body.household }, KEY);
    const q = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: SELF, response_type: 'code', scope: `${GOOGLE_SCOPE} openid email`, access_type: 'offline', prompt: 'consent', state });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }
  if (body.action === 'unlink') {
    await admin.from('calendar_links').delete().eq('profile_id', uid).eq('household_id', body.household).eq('provider', body.provider);
    return json({ ok: true });
  }
  return json({ error: 'Pedido desconhecido.' }, 400);
});
