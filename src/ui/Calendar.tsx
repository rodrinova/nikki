import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WEEKDAYS, addDays, monthKey, monthName, monthWeeks, nextMonth, parseDate, prevMonth, todayStr, weekOf, weekdayName } from '@/lib/dates';
import { Icon } from './Icon';

export type CalKind = 'house' | 'mine' | 'other' | 'busy' | 'due';
export interface CalItem { day: string; time: string | null; title: string; kind: CalKind; color?: string; note: string }

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dayTitle = (d: string, today: string) => {
  const x = parseDate(d), tail = `${x.getDate()} ${MON[x.getMonth()]}`;
  return d === today ? `Hoje · ${weekdayName(d)}, ${tail}` : d === addDays(today, 1) ? `Amanhã · ${weekdayName(d)}, ${tail}` : `${cap(weekdayName(d))}, ${tail}`;
};
const dot = (it: CalItem, k: number) => <i key={k} className={`k-${it.kind}`} style={it.color ? { ['--c' as string]: it.color } : undefined} />;

/**
 * Agenda no início, no lugar do widget Próximo: a semana, que abre no mês com um toque no título ou a
 * deslizar para baixo (e fecha a deslizar para cima). Um ponto por coisa: da casa a tinta, de cada um na
 * sua cor, «tem planos» (os só para si do outro) em contorno, prazos a laranja. O dia escolhido mostra a lista por baixo.
 */
export function Calendar({ items, to }: { items: CalItem[]; to: string }) {
  const today = todayStr();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(today);
  const [mk, setMk] = useState(monthKey(today));
  const y0 = useRef<number | null>(null);
  const by = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    for (const l of m.values()) l.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    return m;
  }, [items]);
  const toggle = (v: boolean) => { setOpen(v); if (v) setMk(monthKey(sel)); };
  const shown = open ? mk : monthKey(sel);
  const list = by.get(sel) ?? [];

  return (
    <section className={`tile cal${open ? ' open' : ''}`} aria-label="Agenda">
      <div className="cal-top">
        <button className="cal-title press" onClick={() => toggle(!open)} aria-expanded={open}>
          {cap(monthName(shown))}{shown.slice(0, 4) !== today.slice(0, 4) ? ` ${shown.slice(0, 4)}` : ''}
          <span className="cal-chev"><Icon n="chev" s={14} w={1.8} /></span>
        </button>
        {open
          ? <div className="cal-nav"><button className="press" aria-label="Mês anterior" onClick={() => setMk(prevMonth(mk))}><Icon n="back" s={18} /></button><button className="press" aria-label="Mês seguinte" onClick={() => setMk(nextMonth(mk))}><Icon n="chev" s={18} /></button></div>
          : <Link className="s press cal-more" to={to}>Agenda <Icon n="chev" s={12} w={1.8} /></Link>}
      </div>
      <div
        className="cal-grid"
        onTouchStart={(e) => { e.stopPropagation(); y0.current = e.touches[0].clientY; }}
        onTouchMove={(e) => {
          if (y0.current === null) return;
          const dy = e.touches[0].clientY - y0.current;
          if ((!open && dy > 28) || (open && dy < -28)) { toggle(!open); y0.current = null; }
        }}
        onTouchEnd={() => { y0.current = null; }}
      >
        {WEEKDAYS.map((w, j) => <span key={j} className="cal-wd" aria-hidden="true">{w}</span>)}
        {(open ? monthWeeks(mk) : [weekOf(sel)]).flat().map((d) => {
          const l = by.get(d) ?? [];
          return (
            <button key={d} className={`cal-d${d === today ? ' today' : ''}${open && monthKey(d) !== mk ? ' out' : ''}`} aria-pressed={d === sel}
              aria-label={`${dayTitle(d, today)}${l.length ? `, ${l.length} ${l.length === 1 ? 'coisa' : 'coisas'}` : ''}`} onClick={() => setSel(d)}>
              <span className="n">{parseDate(d).getDate()}</span>
              <span className="dots" aria-hidden="true">{l.slice(0, 3).map(dot)}{l.length > 3 && <b>+</b>}</span>
            </button>
          );
        })}
      </div>
      <div className="cal-list">
        <p className="s">{dayTitle(sel, today)}</p>
        {list.length
          ? list.map((it, k) => (
            <Link key={k} className="cal-ev press" to={to}>
              <span className="t">{it.time ?? (it.kind === 'due' ? 'prazo' : 'dia')}</span>
              <span className="nm">{it.title}<span className="s">{it.note}</span></span>
              {dot(it, 0)}
            </Link>
          ))
          : <p className="s cal-none">Nada marcado.</p>}
      </div>
    </section>
  );
}
