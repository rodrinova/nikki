// Notificações: o resumo da manhã (às 8h00) e os avisos que não podem esperar. Só o que precisa da pessoa:
// o que tem hoje, o que é para pagar ou fazer, e mensagens novas do housekeeping. Puro: usa-o a função «push».
// Regras em docs/CALCULOS.md, secção 11.

import { addDays, dayLabel } from './dates';
import { expand, type AgendaEvent } from './agenda';
import { todayList, type Chore, type Todo } from './chores';
import { payDue } from './hk';

export interface DEvent extends AgendaEvent { owner_id: string | null; private: boolean; created_by: string; kind?: 'event' | 'birthday' }
export interface DDeadline { id: string; title: string; due_on: string; amount: string | number | null; paid_at: string | null }
export interface DHk { name: string; profile_id: string | null; monthly_pay: string | number | null; pay_day: number | null; pay_nth?: number | null; pay_weekday?: number | null; pay_remind?: number | null; created_at: string }
export interface DMessage { id: string; author_id: string; body: string; photo_path?: string | null; created_at: string }
export interface DigestIn {
  today: string; me: string;
  events: DEvent[]; deadlines: DDeadline[]; chores: Chore[]; todos: Todo[];
  hk: DHk | null; hkPaid: string[]; messages: DMessage[];
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
  const ev = eventsOn(d, d.today).map((o) => (o.ev.kind === 'birthday' ? `${o.ev.title} 🎂` : `${o.ev.title}${o.time ? ` às ${o.time.replace(':', 'h')}` : ''}`));
  const pay = dues(d).map((x) => x.t);
  const todo = todayList(d.chores, d.todos, d.me, d.today).mine.length;
  const parts = [ev.length ? list(ev) : '', pay.length ? list(pay) : '', todo ? `${todo} ${todo === 1 ? 'coisa' : 'coisas'} para fazer` : ''].filter(Boolean);
  if (!parts.length) return null;
  return { key: `manha:${d.today}`, title: 'Hoje', body: `${parts.join('. ')}.`, url: '/' };
}

/** Os avisos que não esperam pelo resumo: o que se paga hoje ou já passou, e mensagens novas do housekeeping. */
export function urgent(d: DigestIn): Push[] {
  const out: Push[] = dues(d).filter((x) => x.due <= d.today).map((x) => ({ key: x.key, title: x.when === 'atrasado' ? 'Ficou por pagar' : 'Paga-se hoje', body: x.t, url: x.key.startsWith('hk:') ? '/housekeeping' : '/' }));
  const from = d.hk?.profile_id;
  for (const m of d.messages.filter((x) => from && x.author_id === from)) out.push({ key: `msg:${m.id}`, title: `Mensagem de ${d.hk!.name}`, body: m.body.trim() ? m.body.slice(0, 140) : 'Mandou uma fotografia.', url: '/housekeeping/mensagens' });
  return out;
}
