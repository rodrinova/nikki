// Notificações (Web Push). Chamada de 15 em 15 minutos pelo pg_cron (cabeçalho x-cron-secret): envia o resumo das
// 8h00 a quem o tem ligado e os avisos que não esperam (o que se paga hoje ou já passou, mensagens do housekeeping),
// cada um uma só vez (push_sent). Também aceita {test:true} da app, com a sessão, para um «Experimentar».
// Precisa dos segredos VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_CRON_SECRET e TZ=Europe/Lisbon.

import webpush from 'npm:web-push@3.6.7';
import { admin, cors, json } from '../_shared/calendars.ts';
import { morning, urgent, type DigestIn } from '../../../src/lib/digest.ts';

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:nikki@exemplo.pt', Deno.env.get('VAPID_PUBLIC')!, Deno.env.get('VAPID_PRIVATE')!);

interface Sub { endpoint: string; profile_id: string; household_id: string; p256dh: string; auth: string; morning: boolean }
type Msg = { title: string; body: string; url: string };

const lisbon = (d = new Date()) => ({
  day: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(d),
  hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(d)),
});

async function send(s: Sub, m: Msg) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 3600 });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); // o aparelho já não existe
    return false;
  }
}

/** Tudo o que a casa precisa para os resumos (só leitura, com a chave de serviço). */
async function houseData(h: string, today: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [ev, dl, ch, td, hk, ms, mem] = await Promise.all([
    admin.from('events').select('id, title, starts_at, ends_at, all_day, owner_id, private, created_by, kind, repeat, weekdays, month_mode, until_on, skip_dates').eq('household_id', h),
    admin.from('deadlines').select('id, title, due_on, amount, paid_at').eq('household_id', h).is('paid_at', null),
    admin.from('chores').select('id, kind, title, every_n, every_unit, next_on, assign, turn_id, archived, home_id').eq('household_id', h).eq('archived', false),
    admin.from('todos').select('id, title, owner_id, due_on, done_at, created_at').eq('household_id', h).is('done_at', null),
    admin.from('housekeeping').select('id, name, profile_id, monthly_pay, pay_day, pay_nth, pay_weekday, pay_remind, bill_id, created_at').eq('household_id', h).eq('archived', false).limit(1).maybeSingle(),
    admin.from('hk_messages').select('id, author_id, body, photo_path, created_at').eq('household_id', h).gte('created_at', since),
    admin.from('memberships').select('profile_id, role').eq('household_id', h),
  ]);
  const card = hk.data as (DigestIn['hk'] & { id: string; bill_id: string | null }) | null;
  let paid: string[] = [];
  if (card) {
    const [p1, p2] = await Promise.all([
      admin.from('hk_paid').select('month').eq('hk_id', card.id),
      card.bill_id ? admin.from('bill_payments').select('period_to').eq('bill_id', card.bill_id).not('amount', 'is', null) : Promise.resolve({ data: [] }),
    ]);
    paid = [...(p1.data ?? []).map((r: { month: string }) => r.month), ...((p2.data ?? []) as { period_to: string }[]).map((r) => r.period_to.slice(0, 7))];
  }
  const staff = new Set(((mem.data ?? []) as { profile_id: string; role: string }[]).filter((m) => m.role === 'staff').map((m) => m.profile_id));
  return { events: ev.data ?? [], deadlines: dl.data ?? [], chores: ch.data ?? [], todos: td.data ?? [], hk: card, paid, messages: (ms.data ?? []) as DigestIn['messages'], staff };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  // «Experimentar» a partir da app: só para os aparelhos de quem chama.
  if (body.test) {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const uid = (await admin.auth.getUser(jwt)).data.user?.id;
    if (!uid) return json({ error: 'sem sessão' }, 401);
    const { data } = await admin.from('push_subs').select('*').eq('profile_id', uid);
    let n = 0;
    for (const s of (data ?? []) as Sub[]) if (await send(s, { title: 'NIKKI', body: 'As notificações estão ligadas. Até amanhã às 8h00.', url: '/' })) n++;
    return json({ sent: n });
  }
  if (req.headers.get('x-cron-secret') !== Deno.env.get('PUSH_CRON_SECRET')) return json({ error: 'não autorizado' }, 401);

  const { day: today, hour } = lisbon();
  if (hour < 8 || hour >= 22) return json({ quiet: true }); // de noite não se incomoda ninguém
  const { data: subs } = await admin.from('push_subs').select('*');
  const byHouse = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byHouse.set(s.household_id, [...(byHouse.get(s.household_id) ?? []), s]);
  let sent = 0;
  for (const [h, list] of byHouse) {
    const d = await houseData(h, today);
    for (const me of new Set(list.map((s) => s.profile_id))) {
      const mine = list.filter((s) => s.profile_id === me);
      let msgs: (Msg & { key: string; morning?: boolean })[];
      if (d.staff.has(me)) {
        // Quem faz o housekeeping só recebe as mensagens da casa.
        msgs = d.messages.filter((m) => m.author_id !== me).map((m) => ({ key: `msg:${m.id}`, title: 'Recado da casa', body: m.body.trim() ? m.body.slice(0, 140) : 'Mandaram uma fotografia.', url: '/' }));
      } else {
        const input: DigestIn = { today, me, events: d.events as DigestIn['events'], deadlines: d.deadlines as DigestIn['deadlines'], chores: d.chores as DigestIn['chores'], todos: d.todos as DigestIn['todos'], hk: d.hk, hkPaid: d.paid, messages: d.messages };
        const m = morning(input);
        msgs = [...(m ? [{ ...m, morning: true }] : []), ...urgent(input)];
      }
      if (!msgs.length) continue;
      const { data: done } = await admin.from('push_sent').select('key').eq('profile_id', me).in('key', msgs.map((m) => m.key));
      const seen = new Set((done ?? []).map((r: { key: string }) => r.key));
      for (const m of msgs.filter((x) => !seen.has(x.key))) {
        const to = m.morning ? mine.filter((s) => s.morning) : mine;
        let ok = false;
        for (const s of to) ok = (await send(s, m)) || ok;
        if (ok || !to.length) await admin.from('push_sent').insert({ profile_id: me, key: m.key });
        if (ok) sent++;
      }
    }
  }
  return json({ sent });
});
