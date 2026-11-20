import { useMemo } from 'react';
import { useSession } from './session';
import { useHouse, type EventRow, type TodoRow } from './house';
import { eur } from '@/lib/money';
import { expand, turns } from '@/lib/agenda';
import { toDateStr } from '@/lib/dates';

export type CalKind = 'house' | 'mine' | 'other' | 'busy' | 'due' | 'birthday' | 'todo';
export interface CalItem { day: string; time: string | null; title: string; kind: CalKind; color?: string; note: string }

/** Uma coisa da agenda num dia: um evento (ou a vez de um que se repete), «tem planos» do outro, ou um prazo. */
export interface AgendaItem extends CalItem { endTime: string | null; ev?: EventRow; location?: string | null; todo?: TodoRow }

/**
 * As coisas da agenda entre dois dias: eventos (com as repetições), aniversários (com a idade, se se souber), os
 * «só para mim» do outro como «<nome> tem planos», e os prazos da casa e dos carros (se os módulos estiverem ligados).
 */
export function useAgendaItems(from: string, to: string): AgendaItem[] {
  const { me, members } = useSession();
  const { events, busy, deadlines, todos, on } = useHouse();
  const dues = on('casa') || on('garagem');
  return useMemo(() => {
    const who = (id: string) => members.find((m) => m.id === id);
    const out: AgendaItem[] = [];
    for (const o of expand(events.rows, from, to)) {
      const e = o.ev, p = e.owner_id ? who(e.owner_id) : undefined;
      const age = e.kind === 'birthday' ? turns(toDateStr(new Date(e.starts_at)), o.day) : null;
      out.push({
        day: o.day, time: o.time, endTime: o.endTime, ev: e, location: e.location,
        title: e.kind === 'birthday' && age ? `${e.title} (${age})` : e.title,
        kind: e.kind === 'birthday' ? 'birthday' : !e.owner_id ? 'house' : e.owner_id === me?.id ? 'mine' : 'other',
        color: p?.color, note: !e.owner_id ? 'Casa' : e.owner_id === me?.id ? 'Tu' : p?.name ?? '',
      });
    }
    for (const o of expand(busy.rows.map((b) => ({ ...b, title: '' })), from, to)) {
      const p = who(o.ev.owner_id);
      out.push({ day: o.day, time: o.time, endTime: o.endTime, title: `${p?.name ?? 'Alguém'} tem planos`, kind: 'busy', color: p?.color, note: '' });
    }
    if (dues) for (const d of deadlines.rows) if (!d.paid_at && d.due_on >= from && d.due_on <= to && ((d.car_id && on('garagem')) || (!d.car_id && on('casa')))) {
      out.push({ day: d.due_on, time: null, endTime: null, title: d.title, kind: 'due', note: d.amount ? `Prazo · ${eur(Number(d.amount) * 100_000)} €` : 'Prazo' });
    }
    // As tarefas com dia (de quem for: a casa toda vê), até estarem feitas.
    for (const t of todos.rows) if (!t.done_at && t.due_on && t.due_on >= from && t.due_on <= to) {
      const p = t.owner_id ? who(t.owner_id) : undefined;
      out.push({ day: t.due_on, time: t.due_time ? t.due_time.slice(0, 5) : null, endTime: null, title: t.title, kind: 'todo', todo: t, color: p?.color,
        note: !t.owner_id ? 'Tarefa · quem puder' : t.owner_id === me?.id ? (t.created_by !== me?.id ? `Tarefa · pedida por ${who(t.created_by)?.name ?? 'alguém'}` : 'Tarefa · tu') : `Tarefa · ${p?.name ?? ''}` });
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''));
  }, [events.rows, busy.rows, deadlines.rows, todos.rows, dues, on, members, me?.id, from, to]);
}

/** De quem é, visto por quem está a ver: «me» (azul), «other» (laranja, a outra pessoa da casa) ou «house» (dos dois). */
export type Whose = 'me' | 'other' | 'house';
export function whoseOf(it: Pick<AgendaItem, 'kind' | 'todo'>, me?: string): Whose {
  if (it.kind === 'mine') return 'me';
  if (it.kind === 'other' || it.kind === 'busy') return 'other';
  if (it.kind === 'todo') return !it.todo?.owner_id ? 'house' : it.todo.owner_id === me ? 'me' : 'other';
  return 'house';
}
/** As cores fixas da agenda do casal: tu a azul, a outra pessoa a laranja, a casa a branco. */
export const WHO_COLOR: Record<Whose, string> = { me: '#4D86FF', other: '#FF6A1F', house: '#E8ECF2' };
