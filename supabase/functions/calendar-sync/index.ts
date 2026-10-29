// Calendário na hora: a app chama isto logo depois de guardar ou apagar um evento ({household, event_id}); a função
// escreve (ou tira) esse evento no calendário «NIKKI» do iCloud ou do Google de cada pessoa da casa que o deve ver.
// O iCloud e o Google empurram a mudança para o telemóvel em segundos.
// Publicar: supabase functions deploy calendar-sync

import { caller, cors, json, syncHousehold } from '../_shared/calendars.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  if (!body.household || !(await caller(req, body.household))) return json({ error: 'Sem acesso.' }, 401);
  return json(await syncHousehold(body.household, body.event_id ?? undefined));
});
