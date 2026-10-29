// Calendário da NIKKI para o iPhone e o Google (só de leitura): GET /functions/v1/calendar?t=<ligação secreta>.
// A ligação é de uma pessoa numa casa (nikki.calendar_tokens, criada por nikki.calendar_token na app).
// Leva os eventos da casa e os dessa pessoa (os «só para mim» do outro nunca saem daqui). Sem sessão: a ligação é a
// chave, por isso é longa e aleatória e troca-se na app. Publicar com `supabase functions deploy calendar --no-verify-jwt`.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildIcs, type IcsEvent } from '../../../src/lib/ical.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nikki' }, auth: { persistSession: false } });

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{48}$/.test(t)) return new Response('Ligação inválida.', { status: 404 });
  const { data: tok } = await db.from('calendar_tokens').select('profile_id, household_id').eq('token', t).maybeSingle();
  if (!tok) return new Response('Esta ligação já não existe. Cria uma nova na NIKKI.', { status: 404 });
  const [{ data: house }, { data: rows, error }] = await Promise.all([
    db.from('households').select('name').eq('id', tok.household_id).single(),
    db.from('events').select('id, title, starts_at, ends_at, all_day, location, repeat, weekdays, month_mode, until_on, skip_dates, owner_id, private, created_by')
      .eq('household_id', tok.household_id),
  ]);
  if (error) return new Response('Erro a ler a agenda.', { status: 500 });
  // Da casa (sem dono, nunca privados) e os desta pessoa (incluindo os «só para mim» dela).
  const mine = (rows ?? []).filter((e) => (e.owner_id === null && !e.private) || e.owner_id === tok.profile_id || (e.private && e.created_by === tok.profile_id));
  const ics = buildIcs(`NIKKI · ${house?.name ?? 'Casa'}`, mine as IcsEvent[]);
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900' } });
});
