import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { monthName, parseDate } from '@/lib/dates';

/**
 * Um gráfico no tempo, feito para o dedo:
 * - um dedo a deslizar mostra a régua (a linha vertical segue o dedo e o valor desse dia, interpolado);
 * - dois dedos aproximam/afastam e andam no tempo (no computador: pinça do trackpad ou Ctrl + roda, e deslizar);
 * - por baixo, a régua pequena com o histórico todo: arrasta-se a janela, ou toca-se onde se quer ver;
 * - atalhos 3M · 6M · 1A · Tudo.
 * Linhas verticais em cada mês. A escala vertical ajusta-se ao que se vê com suavidade (um salto grande no património
 * não esmaga o resto). Com `bands`, a área por baixo da linha pinta-se por níveis (linhas horizontais de cada nível).
 */
/** Camadas (de baixo para cima, já somadas) e linhas horizontais das metas. */
export interface Layer { points: { on: string; v: number }[]; color: string }
export interface Level { v: number; color: string }
type P = { on: string; v: number };
const DAY = 86_400_000;

export function TimeChart({ points, fmt, layers, levels, height = 170, label, restValue = true }: { points: P[]; fmt: (v: number) => string; layers?: Layer[]; levels?: Level[]; height?: number; label: string; restValue?: boolean }) {
  const W = 340, H = height, T = 14, B = 24;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t0 = parseDate(points[0].on).getTime();
  const at = useCallback((d: string) => (parseDate(d).getTime() - t0) / DAY, [t0]);
  const end = Math.max(1, at(points[points.length - 1].on));
  const minSpan = Math.min(end, 21);
  const fit = useCallback(([a, b]: [number, number]): [number, number] => {
    const span = Math.min(end, Math.max(minSpan, b - a));
    let x = (a + b) / 2 - span / 2, y = x + span;
    if (x < 0) { y -= x; x = 0; }
    if (y > end) { x -= y - end; y = end; }
    return [Math.max(0, x), Math.min(end, y)];
  }, [end, minSpan]);
  const [win, setWin] = useState<[number, number]>(() => fit([Math.max(0, end - 365), end]));
  useEffect(() => { setWin((w) => fit(w)); }, [fit]);
  const [a, b] = win;
  const [scrub, setScrub] = useState<number | null>(null);

  // O valor num dia qualquer: interpolado entre os registos à volta.
  const valueAt = useCallback((t: number) => {
    let i = points.findIndex((p) => at(p.on) >= t);
    if (i === -1) return points[points.length - 1].v;
    if (i === 0) return points[0].v;
    const p0 = points[i - 1], p1 = points[i], x0 = at(p0.on), x1 = at(p1.on);
    return p0.v + (p1.v - p0.v) * ((t - x0) / Math.max(1e-9, x1 - x0));
  }, [points, at]);

  // A escala vertical: o que se vê (com as linhas dos níveis, se estiverem perto), animada até lá.
  const target = useMemo(() => {
    const vis = points.filter((p) => at(p.on) >= a && at(p.on) <= b).map((p) => p.v);
    vis.push(valueAt(a), valueAt(b));
    let lo = Math.min(...vis), hi = Math.max(...vis);
    if (layers) lo = Math.min(lo, 0);
    if (levels) for (const l of levels) if (l.v < hi * 1.6) hi = Math.max(hi, l.v);
    if (hi - lo < 1) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1;
    return [layers ? lo : lo - pad, hi + pad] as const;
  }, [points, at, a, b, valueAt, layers, levels]);
  const [yr, setYr] = useState<readonly [number, number]>(target);
  const yrRef = useRef(yr);
  yrRef.current = yr;
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setYr(target); return; }
    let id = 0;
    const step = () => {
      const [l, h] = yrRef.current, k = 0.22;
      const nl = l + (target[0] - l) * k, nh = h + (target[1] - h) * k;
      if (Math.abs(nl - target[0]) + Math.abs(nh - target[1]) < (target[1] - target[0]) * 0.002) { setYr(target); return; }
      setYr([nl, nh]); id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target]);
  const [lo, hi] = yr;
  const x = (t: number) => ((t - a) / Math.max(1e-9, b - a)) * W;
  const y = (v: number) => T + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - T - B);

  // A linha: os registos que se veem, mais um de cada lado, em curva suave.
  const iA = Math.max(0, points.findIndex((p) => at(p.on) >= a) - 1);
  let iB = points.length - 1;
  for (let i = points.length - 1; i >= 0; i--) if (at(points[i].on) <= b) { iB = Math.min(points.length - 1, i + 1); break; }
  const P2 = points.slice(iA, iB + 1).map((p) => [x(at(p.on)), y(p.v)] as const);
  const line = P2.map(([px, py], n) => {
    if (!n) return `M${px.toFixed(1)},${py.toFixed(1)}`;
    const p0 = P2[n - 2] ?? P2[n - 1], p1 = P2[n - 1], p3 = P2[n + 1] ?? [px, py];
    return `C${(p1[0] + (px - p0[0]) / 6).toFixed(1)},${(p1[1] + (py - p0[1]) / 6).toFixed(1)} ${(px - (p3[0] - p1[0]) / 6).toFixed(1)},${(py - (p3[1] - p1[1]) / 6).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
  // A área de uma camada (já somada), na mesma curva suave.
  const areaOf = (pts: P[]) => {
    const q = pts.filter((_, n) => n >= iA - 1 && n <= iB + 1).map((p) => [x(at(p.on)), y(p.v)] as const);
    if (!q.length) return '';
    const d = q.map(([px, py], n) => { if (!n) return `M${px.toFixed(1)},${py.toFixed(1)}`; const p0 = q[n - 2] ?? q[n - 1], p1 = q[n - 1], p3 = q[n + 1] ?? [px, py]; return `C${(p1[0] + (px - p0[0]) / 6).toFixed(1)},${(p1[1] + (py - p0[1]) / 6).toFixed(1)} ${(px - (p3[0] - p1[0]) / 6).toFixed(1)},${(py - (p3[1] - p1[1]) / 6).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`; }).join(' ');
    return `${d} L${q[q.length - 1][0].toFixed(1)},${H - B} L${q[0][0].toFixed(1)},${H - B} Z`;
  };
  const area = P2.length ? `${line} L${P2[P2.length - 1][0].toFixed(1)},${H - B} L${P2[0][0].toFixed(1)},${H - B} Z` : '';

  // Linhas verticais dos meses (com o nome; com muitos meses, só de 3 em 3 ou o ano).
  const months = useMemo(() => {
    const out: { t: number; l: string; year: boolean }[] = [];
    const d0 = new Date(t0 + a * DAY), d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
    const span = b - a, every = span > 900 ? 6 : span > 420 ? 3 : 1;
    for (; (d.getTime() - t0) / DAY <= b; d.setMonth(d.getMonth() + 1)) {
      if (d.getMonth() % every) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ t: (d.getTime() - t0) / DAY, l: d.getMonth() === 0 ? String(d.getFullYear()) : monthName(k).slice(0, 3), year: d.getMonth() === 0 });
    }
    return out;
  }, [t0, a, b]);

  // Gestos no gráfico.
  const svg = useRef<SVGSVGElement>(null);
  const ptrs = useRef(new Map<number, number>());
  const g = useRef<{ d: number; mid: number; w: [number, number] } | null>(null);
  const frac = (cx: number) => { const r = svg.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (cx - r.left) / r.width)); };
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, e.clientX);
    const xs = [...ptrs.current.values()];
    if (xs.length >= 2) { g.current = { d: Math.max(24, Math.abs(xs[0] - xs[1])), mid: frac((xs[0] + xs[1]) / 2), w: [a, b] }; setScrub(null); }
    else setScrub(a + frac(e.clientX) * (b - a));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) { if (e.pointerType === 'mouse') setScrub(a + frac(e.clientX) * (b - a)); return; }
    ptrs.current.set(e.pointerId, e.clientX);
    const xs = [...ptrs.current.values()];
    if (xs.length >= 2 && g.current) {
      const s = g.current, d = Math.max(24, Math.abs(xs[0] - xs[1])), f = frac((xs[0] + xs[1]) / 2);
      const anchor = s.w[0] + s.mid * (s.w[1] - s.w[0]), span = (s.w[1] - s.w[0]) * (s.d / d);
      setWin(fit([anchor - f * span, anchor - f * span + span]));
    } else setScrub(a + frac(e.clientX) * (b - a));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) g.current = null; if (!ptrs.current.size && e.pointerType !== 'mouse') setTimeout(() => setScrub(null), 1600); };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      setWin((w) => {
        if (e.ctrlKey) { const anchor = w[0] + f * (w[1] - w[0]), span = (w[1] - w[0]) * Math.exp(e.deltaY * 0.01); return fit([anchor - f * span, anchor - f * span + span]); }
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const dd = (e.deltaX / r.width) * (w[1] - w[0]); return fit([w[0] + dd, w[1] + dd]); }
        return w;
      });
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [fit]);

  // A régua pequena (o histórico todo): arrastar a janela, ou tocar para a levar ali.
  const mini = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x0: number; w: [number, number] } | null>(null);
  const mfrac = (cx: number) => { const r = mini.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (cx - r.left) / r.width)); };
  const mDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const t = mfrac(e.clientX) * end;
    if (t < a || t > b) { const s = b - a; setWin(fit([t - s / 2, t + s / 2])); drag.current = { x0: e.clientX, w: fit([t - s / 2, t + s / 2]) }; }
    else drag.current = { x0: e.clientX, w: [a, b] };
  };
  const mMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const r = mini.current!.getBoundingClientRect(), dd = ((e.clientX - drag.current.x0) / r.width) * end;
    setWin(fit([drag.current.w[0] + dd, drag.current.w[1] + dd]));
  };
  const mUp = () => { drag.current = null; };
  const all = points.map((p) => p.v), mlo = Math.min(0, ...all), mhi = Math.max(...all, 1);
  const mline = points.map((p, n) => `${n ? 'L' : 'M'}${((at(p.on) / end) * W).toFixed(1)},${(22 - ((p.v - mlo) / (mhi - mlo)) * 18).toFixed(1)}`).join(' ');

  const tS = scrub ?? end, vS = valueAt(Math.min(end, Math.max(0, tS)));
  const dS = new Date(t0 + Math.round(tS) * DAY);
  const dLabel = `${dS.getDate()} ${monthName(`${dS.getFullYear()}-${String(dS.getMonth() + 1).padStart(2, '0')}`).slice(0, 3)} ${dS.getFullYear()}`;
  const first = valueAt(a), diff = vS - first;
  const span = b - a;
  const range = (days: number | null) => setWin(fit(days === null ? [0, end] : [end - days, end]));
  const on = (days: number | null) => (days === null ? span >= end - 1 : Math.abs(span - Math.min(days, end)) < 2 && b >= end - 1);

  return (
    <figure className="tchart" aria-label={label}>
      <div className="tc-read">{(restValue || scrub !== null) && <span className="tc-v">{fmt(vS)}</span>}<span className="s">{scrub === null ? 'hoje' : dLabel}{Math.abs(diff) >= 1 && span > 0 ? ` · ${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} na janela` : ''}</span></div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setScrub(null); }}>
        <defs>
          <clipPath id={`tc-c${uid}`}><rect x={0} y={0} width={W} height={H} /></clipPath>
          <linearGradient id={`tc-f${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ink)" stopOpacity=".14" /><stop offset="1" stopColor="var(--ink)" stopOpacity="0" /></linearGradient>
        </defs>
        {months.map((m) => <g key={m.t}><line x1={x(m.t)} x2={x(m.t)} y1={T - 6} y2={H - B} className={`tc-month${m.year ? ' y' : ''}`} /><text x={x(m.t) + 3} y={H - 8} className="tc-ax">{m.l}</text></g>)}
        <g clipPath={`url(#tc-c${uid})`}>
        {layers ? [...layers].reverse().map((l, k) => <path key={k} d={areaOf(l.points)} fill={l.color} opacity={0.92} />) : <path d={area} fill={`url(#tc-f${uid})`} />}
        {levels?.filter((l) => l.v >= lo && l.v <= hi).map((l, k) => <line key={`lv${k}`} x1={0} x2={W} y1={y(l.v)} y2={y(l.v)} className="tc-level" stroke={l.color} />)}
        <path d={line} className="tc-line" />
        </g>
        <line x1={x(tS)} x2={x(tS)} y1={T - 6} y2={H - B} className={`tc-rule${scrub === null ? ' rest' : ''}`} />
        <circle cx={x(tS)} cy={y(vS)} r={14} className="net-halo" />
        <circle cx={x(tS)} cy={y(vS)} r={4.5} className="tc-dot" />
      </svg>
      <svg ref={mini} className="tc-mini" viewBox={`0 0 ${W} 26`} aria-hidden="true" onPointerDown={mDown} onPointerMove={mMove} onPointerUp={mUp} onPointerCancel={mUp}>
        <path d={mline} className="tc-mline" />
        <rect x={(a / end) * W} y={1} width={Math.max(8, ((b - a) / end) * W)} height={24} rx={7} className="tc-win" />
      </svg>
      <div className="tc-ranges" role="group" aria-label="Período">
        {([['3M', 91], ['6M', 182], ['1A', 365], ['Tudo', null]] as [string, number | null][]).filter(([, d]) => d === null || d < end).map(([l, d]) => <button key={l} type="button" className="press" aria-pressed={on(d)} onClick={() => range(d)}>{l}</button>)}
      </div>
    </figure>
  );
}
