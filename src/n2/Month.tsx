// O mês como no calendário do iPhone (vista com faixas): cada dia com até três faixas com o início do título, na cor de
// quem é (tu a azul, a outra pessoa a laranja, a casa a branco). O que dura vários dias é uma faixa contínua. Tocar
// num dia mostra a lista desse dia por baixo; deslizar para o lado muda de mês.
import { useMemo, useRef, useState } from 'react';
import { useSession } from '@/data/session';
import { useAgendaItems, whoseOf, WHO_COLOR, type AgendaItem, type Whose } from '@/data/agenda';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { WEEKDAYS, addDays, monthKey, monthName, monthWeeks, nextMonth, parseDate, prevMonth, todayStr, weekdayName } from '@/lib/dates';
import { DayRow, EventSheet } from '@/screens/Agenda';

const LANES = 3;
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

interface Seg { c0: number; c1: number; it: AgendaItem; who: Whose; lane: number }

/** As faixas de uma semana: junta os dias seguidos do mesmo evento de dia inteiro e arruma em linhas. */
function layout(week: string[], by: Map<string, AgendaItem[]>, me?: string) {
  const segs: Omit<Seg, 'lane'>[] = [];
  const open = new Map<string, Omit<Seg, 'lane'>>();
  week.forEach((d, c) => {
    const seen = new Set<string>();
    for (const it of by.get(d) ?? []) {
      const long = it.ev && it.ev.all_day && it.ev.repeat === 'none' ? it.ev.id : null;
      if (long) {
        seen.add(long);
        const s = open.get(long);
        if (s && s.c1 === c - 1) { s.c1 = c; continue; }
        const n = { c0: c, c1: c, it, who: whoseOf(it, me) };
        open.set(long, n); segs.push(n);
      } else segs.push({ c0: c, c1: c, it, who: whoseOf(it, me) });
    }
    for (const k of [...open.keys()]) if (!seen.has(k)) open.delete(k);
  });
  segs.sort((a, b) => (b.c1 - b.c0) - (a.c1 - a.c0) || a.c0 - b.c0 || Number(!!a.it.time) - Number(!!b.it.time) || (a.it.time ?? '').localeCompare(b.it.time ?? ''));
  const used: boolean[][] = Array.from({ length: LANES }, () => Array(7).fill(false));
  const shown: Seg[] = [], hidden = Array(7).fill(0) as number[];
  for (const s of segs) {
    const lane = used.findIndex((row) => row.slice(s.c0, s.c1 + 1).every((x) => !x));
    if (lane < 0) { for (let c = s.c0; c <= s.c1; c++) hidden[c]++; continue; }
    for (let c = s.c0; c <= s.c1; c++) used[lane][c] = true;
    shown.push({ ...s, lane });
  }
  return { shown, hidden };
}

export function MonthStripes() {
  const { me, partner } = useSession();
  const { open: sheet } = useOverlays();
  const today = todayStr();
  const [mk, setMk] = useState(monthKey(today));
  const [sel, setSel] = useState(today);
  const weeks = useMemo(() => monthWeeks(mk), [mk]);
  const items = useAgendaItems(weeks[0][0], weeks[weeks.length - 1][6]);
  const by = useMemo(() => { const m = new Map<string, AgendaItem[]>(); for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]); return m; }, [items]);
  const lay = useMemo(() => weeks.map((w) => layout(w, by, me?.id)), [weeks, by, me?.id]);
  const go = (dir: 1 | -1) => { const k = dir > 0 ? nextMonth(mk) : prevMonth(mk); setMk(k); setSel(k === monthKey(today) ? today : `${k}-01`); };
  const t0 = useRef<{ x: number; y: number } | null>(null);
  const list = (by.get(sel) ?? []).map((it) => ({ ...it, color: WHO_COLOR[whoseOf(it, me?.id)] }));
  const x = parseDate(sel);
  return (
    <section className="mo" aria-label="Agenda do mês"
      onTouchStart={(e) => { t0.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => { const s = t0.current; t0.current = null; if (!s) return; const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && (e.target as HTMLElement).closest('.mo-grid')) go(dx < 0 ? 1 : -1); }}>
      <div className="mo-top">
        <button type="button" className="tb quiet press" onClick={() => go(-1)} aria-label="Mês anterior"><Icon n="back" s={16} /></button>
        <h2>{cap(monthName(mk))}{mk.slice(0, 4) !== today.slice(0, 4) ? ` ${mk.slice(0, 4)}` : ''}</h2>
        <button type="button" className="tb quiet press" onClick={() => go(1)} aria-label="Mês seguinte"><Icon n="chev" s={16} /></button>
        <span style={{ flex: 1 }} />
        {(sel !== today || mk !== monthKey(today)) && <button type="button" className="tb quiet press" onClick={() => { setMk(monthKey(today)); setSel(today); }}>Hoje</button>}
        <button type="button" className="tb press" onClick={() => sheet(<EventSheet day={sel} />)}>Novo</button>
      </div>
      <div className="mo-legend" aria-hidden="true"><span><i style={{ background: WHO_COLOR.me }} />Tu</span>{partner && <span><i style={{ background: WHO_COLOR.other }} />{partner.name.split(' ')[0]}</span>}<span><i style={{ background: WHO_COLOR.house }} />Casa</span></div>
      <div className="mo-wd" aria-hidden="true">{WEEKDAYS.map((w, j) => <span key={j}>{w}</span>)}</div>
      <div className="mo-grid">
        {weeks.map((w, wi) => (
          <div key={w[0]} className="mo-wk">
            {w.map((d, c) => (
              <button key={d} type="button" style={{ gridColumn: c + 1 }} className={`mo-d press${d.slice(0, 7) !== mk ? ' out' : ''}${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}`}
                aria-label={`${weekdayName(d)}, ${Number(d.slice(8))}${(by.get(d) ?? []).length ? `, ${(by.get(d) ?? []).length} coisas` : ''}`} aria-pressed={d === sel} onClick={() => setSel(d)}>
                <span className="n">{Number(d.slice(8))}</span>
              </button>
            ))}
            {lay[wi].shown.map((s, k) => (
              <span key={k} className={`mo-s w-${s.who}${s.it.kind === 'busy' ? ' busy' : ''}${s.c1 > s.c0 ? ' long' : ''}`} style={{ gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: s.lane + 2, ['--c' as string]: WHO_COLOR[s.who] }} aria-hidden="true">{s.it.title}</span>
            ))}
            {lay[wi].hidden.map((n, c) => n > 0 && <span key={`m${c}`} className="mo-more" style={{ gridColumn: c + 1, gridRow: LANES + 2 }} aria-hidden="true">+{n}</span>)}
          </div>
        ))}
      </div>
      <div className="mo-day">
        <span className="s">{sel === today ? 'Hoje · ' : ''}{cap(weekdayName(sel))}, {x.getDate()} {MON[x.getMonth()]}</span>
        {list.length ? <div className="rows">{list.map((it, j) => <DayRow key={j} it={it} day={sel} />)}</div> : <p className="s">Nada neste dia.</p>}
        {sel === today && (by.get(addDays(today, 1)) ?? []).length > 0 && <button type="button" className="tb quiet press" onClick={() => setSel(addDays(today, 1))}>Amanhã: {(by.get(addDays(today, 1)) ?? []).length} {(by.get(addDays(today, 1)) ?? []).length === 1 ? 'coisa' : 'coisas'} <Icon n="arrow" s={14} /></button>}
      </div>
    </section>
  );
}
