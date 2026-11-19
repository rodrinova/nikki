// Notificações: o resumo da manhã (à hora que cada pessoa escolhe) e os avisos que não podem esperar. Só o que precisa da pessoa:
// o que tem hoje, o que é para pagar ou fazer, e mensagens novas do housekeeping. Puro: usa-o a função «push».
// Regras em docs/CALCULOS.md, secção 11.

import { addDays, dayLabel } from './dates';
import { expand, type AgendaEvent } from './agenda';
import { todayList, type Chore, type Todo } from './chores';
import { payDue } from './hk';

export interface DEvent extends AgendaEvent { owner_id: string | null; private: boolean; created_by: string; kind?: 'event' | 'birthday' }
export interface DDeadline { id: string; title: string; due_on: string; amount: string | number | null; paid_at: string | null }
export interface DHk { weekdays?: number[]; start_time?: string | null; name: string; profile_id: string | null; monthly_pay: string | number | null; pay_day: number | null; pay_nth?: number | null; pay_weekday?: number | null; pay_remind?: number | null; created_at: string }
export interface DMessage { id: string; author_id: string; body: string; photo_path?: string | null; created_at: string }
export interface DigestIn {
  today: string; me: string;
  events: DEvent[]; deadlines: DDeadline[]; chores: Chore[]; todos: Todo[];
  hk: DHk | null; hkPaid: string[]; messages: DMessage[];
  /** Os nomes das pessoas da casa (para «A Inês já fez…»). */ names?: Record<string, string>;
  /** Desde quando contam as respostas aos pedidos (ISO; por omissão, nada). */ since?: string;
}
export interface Push { key: string; title: string; body: string; url: string }

const money = (v: string | number) => `${Number(v).toFixed(Number(v) % 1 ? 2 : 0).replace('.', ',')} €`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`);

/** Os eventos de um dia que a pessoa vê (os da casa e os dela; os «só para mim» dos outros não). */
function eventsOn(d: DigestIn, day: string) {
  const mine = d.events.filter((e) => (e.owner_id === null && !e.private) || e.owner_id === d.me || e.created_by === d.me);
  return expand(mine, day, day).sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00'));
}

function dues(d: DigestIn) {
  const out: { key: string; t: string; when: string; due: string }[] = [];
  for (const x of d.deadlines) if (!x.paid_at && x.due_on <= addDays(d.today, 1))
    out.push({ key: `dl:${x.id}:${x.due_on}`, t: `${x.title}${x.amount ? ` (${money(x.amount)})` : ''}`, when: x.due_on < d.today ? 'atrasado' : dayLabel(x.due_on, d.today), due: x.due_on });
  // O housekeeping avisa com os dias escolhidos (para preparar o pagamento); no dia, passa a urgente.
  if (d.hk?.monthly_pay) for (const p of payDue({ ...d.hk, monthly_pay: Number(d.hk.monthly_pay) }, d.hkPaid, d.today))
    out.push({ key: `hk:${p.month}`, t: p.late < 0 ? `Preparar o housekeeping (${d.hk.name}, ${money(d.hk.monthly_pay)}) para ${dayLabel(p.due, d.today)}` : `Housekeeping (${d.hk.name}, ${money(d.hk.monthly_pay)})`, when: p.late > 0 ? 'atrasado' : p.late === 0 ? 'hoje' : dayLabel(p.due, d.today), due: p.due });
  return out;
}

/** O resumo das 8h00: «Hoje: Pilates às 18h45. Pagar a Maria (320 €). 3 coisas para fazer.» Nada para dizer, nada se envia. */
export function morning(d: DigestIn): Push | null {
  const hm = (t: string) => t.slice(0, 5).replace(':', 'h').replace(/h00$/, 'h').replace(/^0/, '');
  const ev = eventsOn(d, d.today).map((o) => (o.ev.kind === 'birthday' ? `${o.ev.title} 🎂` : `${o.ev.title}${o.time ? ` às ${hm(o.time)}` : ''}`));
  // Dia de visita do housekeeping: quem vem e a que horas.
  const wd = ((new Date(`${d.today}T12:00:00`).getDay() + 6) % 7) + 1;
  const visit = d.hk?.weekdays?.includes(wd) ? `${d.hk.name} vem${d.hk.start_time ? ` às ${hm(d.hk.start_time)}` : ' hoje'}` : '';
  const pay = dues(d).map((x) => x.t);
  const mine = todayList(d.chores, d.todos, d.me, d.today).mine
    .map((i) => ({ t: i.title, at: i.kind === 'todo' ? i.todo?.due_time ?? null : null }))
    .sort((a, b) => (a.at ?? '99').localeCompare(b.at ?? '99'));
  const names = mine.slice(0, 4).map((i) => (i.at ? `${i.t} (às ${hm(i.at)})` : i.t));
  const todo = mine.length ? `Para fazer: ${list(mine.length > 4 ? [...names, `mais ${mine.length - 4}`] : names)}` : '';
  const parts = [ev.length ? list(ev) : '', visit, pay.length ? list(pay) : '', todo].filter(Boolean);
  if (!parts.length) return null;
  return { key: `manha:${d.today}`, title: 'Hoje', body: `${parts.join('. ')}.`, url: '/' };
}

/** Para quem pediu uma tarefa a outra pessoa da casa: quando ela a faz, a devolve ou muda o dia. */
export function replies(d: DigestIn): Push[] {
  if (!d.since) return [];
  const since = d.since, nm = (id?: string | null) => (id && d.names?.[id]) || 'Alguém';
  const out: Push[] = [];
  for (const t of d.todos) {
    if (t.created_by !== d.me) continue;
    if (t.done_at && t.done_at >= since && t.done_by && t.done_by !== d.me) out.push({ key: `feito:${t.id}`, title: `${nm(t.done_by)} já fez`, body: t.title, url: '/' });
    if (t.returned_at && t.returned_at >= since && t.returned_by && t.returned_by !== d.me) out.push({ key: `devolveu:${t.id}:${t.returned_at}`, title: `${nm(t.returned_by)} não consegue`, body: `${t.title}. Voltou para ti.`, url: '/agenda' });
    if (!t.done_at && t.moved_at && t.moved_at >= since && t.moved_by && t.moved_by !== d.me && t.due_on) out.push({ key: `mudou:${t.id}:${t.due_on}`, title: `${nm(t.moved_by)} mudou o dia`, body: `${t.title}: passa para ${t.due_on === addDays(d.today, 1) ? 'amanhã' : `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(`${t.due_on}T12:00:00`).getDay()]}, dia ${Number(t.due_on.slice(8, 10))}`}.`, url: '/agenda' });
  }
  return out;
}

/** Os avisos que não esperam pelo resumo: o que se paga hoje ou já passou, e mensagens novas do housekeeping. */
export function urgent(d: DigestIn): Push[] {
  const out: Push[] = dues(d).filter((x) => x.due <= d.today).map((x) => ({ key: x.key, title: x.when === 'atrasado' ? 'Ficou por pagar' : 'Paga-se hoje', body: x.t, url: x.key.startsWith('hk:') ? '/housekeeping' : '/' }));
  const from = d.hk?.profile_id;
  for (const m of d.messages.filter((x) => from && x.author_id === from)) out.push({ key: `msg:${m.id}`, title: `Mensagem de ${d.hk!.name}`, body: m.body.trim() ? m.body.slice(0, 140) : 'Mandou uma fotografia.', url: '/housekeeping/mensagens' });
  return out;
}
