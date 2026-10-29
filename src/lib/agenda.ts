// Agenda: eventos de uma vez e que se repetem (semanal em certos dias, mensal no mesmo dia ou na n.ª semana, anual),
// aniversários, e abrir o sítio no Waze ou no Google Maps. Regras em docs/CALCULOS.md (secção 8). Puro.

import { addDays, daysInMonth, parseDate, toDateStr } from './dates';

export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface AgendaEvent {
  id: string;
  title: string;
  starts_at: string; // ISO com fuso
  ends_at: string | null;
  all_day: boolean;
  repeat?: Repeat;
  weekdays?: number[] | null; // 1 = segunda … 7 = domingo
  month_mode?: 'day' | 'nth';
  until_on?: string | null;
  skip_dates?: string[] | null;
}

export interface Occurrence<E extends AgendaEvent = AgendaEvent> { ev: E; day: string; time: string | null; endTime: string | null }

const pad = (n: number) => String(n).padStart(2, '0');
/** Dia da semana, 1 = segunda … 7 = domingo. */
export const isoWeekday = (d: string) => ((parseDate(d).getDay() + 6) % 7) + 1;
const hm = (iso: string) => { const x = new Date(iso); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };

/** A n.ª semana do mês em que calha o dia (1–4; a 5.ª conta como «a última», −1). */
export function nthOf(d: string): number {
  const day = Number(d.slice(8, 10)), n = Math.ceil(day / 7);
  return day + 7 > daysInMonth(d.slice(0, 7)) ? (n >= 5 ? -1 : n) : n;
}

/** O dia do mês que é a n.ª (ou a última, −1) segunda…domingo. */
export function nthWeekday(key: string, nth: number, wd: number): string | null {
  const len = daysInMonth(key);
  if (nth === -1) {
    for (let day = len; day > len - 7; day--) { const d = `${key}-${pad(day)}`; if (isoWeekday(d) === wd) return d; }
    return null;
  }
  let seen = 0;
  for (let day = 1; day <= len; day++) { const d = `${key}-${pad(day)}`; if (isoWeekday(d) === wd && ++seen === nth) return d; }
  return null;
}

/**
 * As vezes de cada evento entre dois dias (inclusive), no fuso do telemóvel. Mensal no dia 29–31: os meses sem esse
 * dia saltam (como no iPhone). Anual a 29 de fevereiro: nos anos comuns, a 28. Dias tirados («só este») ficam de fora.
 */
export function expand<E extends AgendaEvent>(events: E[], from: string, to: string): Occurrence<E>[] {
  const out: Occurrence<E>[] = [];
  for (const ev of events) {
    const first = toDateStr(new Date(ev.starts_at));
    const time = ev.all_day ? null : hm(ev.starts_at), endTime = ev.all_day || !ev.ends_at ? null : hm(ev.ends_at);
    const skip = new Set(ev.skip_dates ?? []);
    const last = [to, ev.until_on ?? to].sort()[0];
    const push = (day: string) => { if (day >= from && day <= last && day >= first && !skip.has(day)) out.push({ ev, day, time, endTime }); };
    const rep = ev.repeat ?? 'none';
    if (rep === 'none') {
      // Um evento de vários dias (dia inteiro) aparece em cada dia.
      const end = ev.all_day && ev.ends_at ? toDateStr(new Date(ev.ends_at)) : first;
      for (let d = first; d <= end && d <= to; d = addDays(d, 1)) if (d >= from && !skip.has(d)) out.push({ ev, day: d, time, endTime });
      continue;
    }
    const start = [from, first].sort()[1];
    if (rep === 'weekly') {
      const days = new Set(ev.weekdays?.length ? ev.weekdays : [isoWeekday(first)]);
      for (let d = start; d <= last; d = addDays(d, 1)) if (days.has(isoWeekday(d))) push(d);
    } else if (rep === 'monthly') {
      const dom = Number(first.slice(8, 10)), nth = nthOf(first), wd = isoWeekday(first);
      for (let k = start.slice(0, 7); k <= last.slice(0, 7); k = nextKey(k)) {
        if (ev.month_mode === 'nth') { const d = nthWeekday(k, nth, wd); if (d) push(d); }
        else if (dom <= daysInMonth(k)) push(`${k}-${pad(dom)}`);
      }
    } else {
      const md = first.slice(5);
      for (let y = Number(start.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) {
        const leapDay = md === '02-29' && daysInMonth(`${y}-02`) === 28;
        push(leapDay ? `${y}-02-28` : `${y}-${md}`);
      }
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''));
}
const nextKey = (k: string) => { const y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; };

const WD = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** «Todas as semanas, terça e quinta», «todos os meses no dia 12», «todos os meses na 1.ª sexta», «todos os anos». */
export function repeatLabel(ev: AgendaEvent): string {
  const first = toDateStr(new Date(ev.starts_at));
  const until = ev.until_on ? `, até ${Number(ev.until_on.slice(8, 10))}/${Number(ev.until_on.slice(5, 7))}/${ev.until_on.slice(0, 4)}` : '';
  switch (ev.repeat ?? 'none') {
    case 'weekly': {
      const days = [...new Set(ev.weekdays?.length ? ev.weekdays : [isoWeekday(first)])].sort();
      if (days.length === 7) return `todos os dias${until}`;
      if (days.join() === '1,2,3,4,5') return `dias úteis${until}`;
      return `todas as semanas, ${list(days.map((d) => WD[d - 1]))}${until}`;
    }
    case 'monthly': {
      if (ev.month_mode !== 'nth') return `todos os meses no dia ${Number(first.slice(8, 10))}${until}`;
      const n = nthOf(first), w = isoWeekday(first), fem = w <= 5; // segunda…sexta são femininos; sábado e domingo, masculinos
      const ord = n === -1 ? (fem ? 'na última' : 'no último') : fem ? `na ${n}.ª` : `no ${n}.º`;
      return `todos os meses ${ord} ${WD[w - 1]}${until}`;
    }
    case 'yearly': return `todos os anos${until}`;
    default: return '';
  }
}

/** Idade que faz num aniversário (se a data guardada é a de nascimento). */
export function turns(birth: string, on: string): number | null {
  const y = Number(on.slice(0, 4)) - Number(birth.slice(0, 4));
  return y > 0 && y < 130 ? y : null;
}

// ───────────── sítio: Waze ou Google Maps ─────────────

export function mapsLinks(place: string) {
  const q = encodeURIComponent(place.trim());
  const google = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return {
    google,
    wazeApp: `waze://?q=${q}&navigate=yes`,
    // Android: abre o Waze se estiver instalado; senão, o próprio sistema abre o Google Maps.
    android: `intent://?q=${q}&navigate=yes#Intent;scheme=waze;package=com.waze;S.browser_fallback_url=${encodeURIComponent(google)};end`,
  };
}
