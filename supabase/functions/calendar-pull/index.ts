// Do iPhone para a NIKKI: lê o calendário «NIKKI» do iCloud de cada pessoa e traz o que lá mudou (novos, mudados,
// apagados). Corre de 15 em 15 minutos (pg_cron, com x-cron-secret) e quando a app abre a Agenda ({household}, com a
// sessão). Publicar juntando num só ficheiro (como a push), sem verificação de JWT (o cron não traz sessão).

import { admin, caller, cors, json, pullAll } from '../_shared/calendars.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const secret = req.headers.get('x-cron-secret');
  if (secret) {
    const { data } = await admin.from('push_config').select('cron_secret').eq('id', true).single();
    if (!data || data.cron_secret !== secret) return json({ error: 'Sem acesso.' }, 401);
    return json(await pullAll());
  }
  if (!body.household || !(await caller(req, body.household))) return json({ error: 'Sem acesso.' }, 401);
  return json(await pullAll(body.household));
});
