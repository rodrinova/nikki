// Notificações (Web Push). Chamada de 15 em 15 minutos pelo pg_cron (cabeçalho x-cron-secret): envia o resumo das
// hora que cada pessoa escolheu (morning_at) a quem o tem ligado, as respostas aos pedidos de tarefas e os avisos que não esperam (o que se paga hoje ou já passou, mensagens do housekeeping),
// cada um uma só vez (push_sent). Também aceita {test:true} da app, com a sessão, para um «Experimentar».
// As chaves VAPID e o segredo do agendamento estão em nikki.push_config (só a chave de serviço lê): na primeira
// volta, sem chaves, a função cria-as e guarda-as. A app lê a pública por rpc('push_public_key').

import webpush from 'npm:web-push@3.6.7';
import { admin, cors, json } from '../_shared/calendars.ts';
import { morning, replies, urgent, type DigestIn } from '../../../src/lib/digest.ts';

// As contas do resumo usam datas locais (src/lib/dates.ts) e a função corre em UTC (não se pode mudar o TZ): as
// horas dos eventos passam para a hora de Lisboa escrita sem fuso, que lida aqui dá a hora certa.
const wall = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const lisbonLocal = (iso: string | null) => {
  if (!iso) return iso;
  const p = Object.fromEntries(wall.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
};

const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://rodrinova.github.io/nikki/';
interface Config { vapid_public: string | null; vapid_private: string | null; cron_secret: string }

/** As chaves (criadas uma vez, na primeira volta) e o segredo do pg_cron. */
async function config(): Promise<Config> {
  const { data, error } = await admin.from('push_config').select('vapid_public, vapid_private, cron_secret').eq('id', true).single();
  if (error || !data) throw new Error(`push_config: ${error?.message ?? 'sem linha'}`);
  let c = data as Config;
  if (!c.vapid_public || !c.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    // Só grava se ainda não houver chaves (duas voltas ao mesmo tempo ficam com as mesmas).
    await admin.from('push_config').update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq('id', true).is('vapid_public', null);
    const again = await admin.from('push_config').select('vapid_public, vapid_private, cron_secret').eq('id', true).single();
    c = again.data as Config;
  }
  webpush.setVapidDetails(SUBJECT, c.vapid_public!, c.vapid_private!);
  return c;
}

interface Sub { endpoint: string; profile_id: string; household_id: string; p256dh: string; auth: string; morning: boolean; morning_at: string }
type Msg = { title: string; body: string; url: string };

const lisbon = (d = new Date()) => ({
  day: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(d),
  hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(d)),
  hm: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d),
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
    admin.from('todos').select('id, title, owner_id, due_on, due_time, done_at, done_by, created_by, created_at, moved_at, moved_by, returned_at, returned_by').eq('household_id', h).or(`done_at.is.null,done_at.gte.${since}`),
    admin.from('housekeeping').select('id, name, weekdays, start_time, profile_id, monthly_pay, pay_day, pay_nth, pay_weekday, pay_remind, bill_id, created_at').eq('household_id', h).eq('archived', false).limit(1).maybeSingle(),
    admin.from('hk_messages').select('id, author_id, body, photo_path, created_at').eq('household_id', h).gte('created_at', since),
    admin.from('memberships').select('profile_id, role, profiles(name)').eq('household_id', h),
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
  const names = Object.fromEntries(((mem.data ?? []) as unknown as { profile_id: string; profiles: { name: string } | null }[]).map((m) => [m.profile_id, (m.profiles?.name ?? '').split(' ')[0]]));
  const staff = new Set(((mem.data ?? []) as { profile_id: string; role: string }[]).filter((m) => m.role === 'staff').map((m) => m.profile_id));
  const events = ((ev.data ?? []) as { starts_at: string; ends_at: string | null }[]).map((e) => ({ ...e, starts_at: lisbonLocal(e.starts_at)!, ends_at: lisbonLocal(e.ends_at) }));
  return { events, deadlines: dl.data ?? [], chores: ch.data ?? [], todos: td.data ?? [], hk: card, paid, messages: (ms.data ?? []) as DigestIn['messages'], staff, names, since };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const cfg = await config();
  // «Experimentar» a partir da app: só para os aparelhos de quem chama.
  if (body.test) {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const uid = (await admin.auth.getUser(jwt)).data.user?.id;
    if (!uid) return json({ error: 'sem sessão' }, 401);
    const { data } = await admin.from('push_subs').select('*').eq('profile_id', uid);
    let n = 0;
    for (const s of (data ?? []) as Sub[]) if (await send(s, { title: 'NIKKI', body: 'As notificações estão ligadas. O resumo do dia chega à hora que escolheres.', url: '/' })) n++;
    return json({ sent: n });
  }
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'não autorizado' }, 401);

  const { day: today, hour, hm } = lisbon();
  if (body.check) return json({ ok: true, today, hour, tz: new Date().getTimezoneOffset(), julho: lisbonLocal('2026-07-01T18:30:00Z'), janeiro: lisbonLocal('2026-01-15T18:30:00Z') }); // para verificar a hora
  if (hour < 6 || hour >= 22) return json({ quiet: true }); // de noite não se incomoda ninguém (o resumo pode ser a partir das 6h00; o resto, das 8h00)
  // O resumo sai na hora escolhida (ou na volta seguinte do agendamento, até uma hora depois); fora disso, não.
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const inWindow = (s: Sub) => s.morning && min(hm) >= min(s.morning_at ?? '08:00') && min(hm) < min(s.morning_at ?? '08:00') + 60;
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
        msgs = hour < 8 ? [] : d.messages.filter((m) => m.author_id !== me).map((m) => ({ key: `msg:${m.id}`, title: 'Recado da casa', body: m.body.trim() ? m.body.slice(0, 140) : 'Mandaram uma fotografia.', url: '/' }));
      } else {
        const input: DigestIn = { today, me, events: d.events as DigestIn['events'], deadlines: d.deadlines as DigestIn['deadlines'], chores: d.chores as DigestIn['chores'], todos: d.todos as DigestIn['todos'], hk: d.hk, hkPaid: d.paid, messages: d.messages, names: d.names, since: d.since };
        // O resumo chega à hora que a pessoa escolheu; o que é do dia de hoje, só a partir das 8h00.
        const due = mine.some(inWindow);
        const m = due ? morning(input) : null;
        msgs = [...(m ? [{ ...m, morning: true }] : []), ...(hour >= 8 ? [...urgent(input), ...replies(input)] : [])];
      }
      if (!msgs.length) continue;
      const { data: done } = await admin.from('push_sent').select('key').eq('profile_id', me).in('key', msgs.map((m) => m.key));
      const seen = new Set((done ?? []).map((r: { key: string }) => r.key));
      for (const m of msgs.filter((x) => !seen.has(x.key))) {
        const to = m.morning ? mine.filter(inWindow) : mine;
        let ok = false;
        for (const s of to) ok = (await send(s, m)) || ok;
        if (ok || !to.length) await admin.from('push_sent').insert({ profile_id: me, key: m.key });
        if (ok) sent++;
      }
    }
  }
  return json({ sent });
});
