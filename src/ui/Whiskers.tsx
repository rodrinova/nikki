import { useEffect, useId, useRef, useState } from 'react';
import { lit } from '@/lib/money';

// Contas a dois na cara da NIKKI: tu à esquerda, o outro à direita. Abre igual ao logótipo e, meio segundo
// depois, os bigodes de quem adiantou mais crescem e acendem-se ao crescer (whiskerLean): a luz laranja corre
// da cara para as pontas, com um brilho suave, ao mesmo ritmo do crescimento. Os do outro encolhem. Em
// equilíbrio apagam-se, ficam iguais e a cara pisca. Geometria de brand/wordmark.py; até 32 px, mais grossos.
const G = [
  { el: 'M62.15 24H65.35V56H62.15Z', er: 'M78.15 24H81.35V56H78.15Z', wl: 'M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z', wr: 'M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z', vl: 62.15, vr: 81.35, tl: 51.2, tr: 92.3 },
  { el: 'M62.63 24H65.83V56H62.63Z', er: 'M78.63 24H81.83V56H78.63Z', wl: 'M62.63 38.14L53.57 24H51.2L62.63 41.86Z M62.63 38.14L51.2 56H53.57L62.63 41.86Z', wr: 'M81.83 38.14L90.88 24H93.25L81.83 41.86Z M81.83 38.14L93.25 56H90.88L81.83 41.86Z', vl: 62.63, vr: 81.83, tl: 51.2, tr: 93.25 },
];
const sc = (v: number, f: number) => `translate(${v} 40) scale(${f.toFixed(3)} 1) translate(${-v} -40)`;

/**
 * lean: de −0,5 a 0,5 (positivo = adiantaste tu mais). enter: abre igual ao logótipo e só depois mostra o
 * estado (no ecrã das contas); sem enter, mostra logo o estado (ícone do widget). label só no tamanho grande.
 */
export function Whiskers({ lean, h, label, enter = true }: { lean: number; h: number; label?: string; enter?: boolean }) {
  const g = G[h <= 32 ? 1 : 0];
  const id = 'w' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [v, setV] = useState(enter ? 0 : lean);
  const [once, setOnce] = useState(false);
  const cur = useRef(enter ? 0 : lean);
  const ends = useRef({ a: cur.current, z: cur.current });
  const born = useRef(performance.now());
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, blinkT = 0;
    const blink = () => { setOnce(true); blinkT = window.setTimeout(() => setOnce(false), 700); };
    // meio segundo depois de abrir; a seguir, cada mudança anima logo
    const wait = Math.max(0, 550 - (performance.now() - born.current));
    const t = window.setTimeout(() => {
      const a = cur.current;
      ends.current = { a, z: lean };
      if (reduce || a === lean) { ends.current = { a: lean, z: lean }; cur.current = lean; setV(lean); if (lean === 0 && enter) blink(); return; }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 900), y = a + (lean - a) * (1 - Math.pow(1 - p, 3));
        cur.current = y; setV(y);
        if (p < 1) raf = requestAnimationFrame(step); else if (lean === 0) blink();
      };
      raf = requestAnimationFrame(step);
    }, wait);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); clearTimeout(blinkT); };
  }, [lean, enter]);

  const side = (s: 1 | -1) => {
    const f = lit(v, ends.current.a, ends.current.z, s), k = s === 1 ? 'l' : 'r', d = s === 1 ? g.wl : g.wr, cls = s === 1 ? 'wk-l' : 'wk-r';
    const vx = s === 1 ? g.vl : g.vr, tx = s === 1 ? g.tl : g.tr, front = f.toFixed(3), fade = Math.min(1, f + 0.18).toFixed(3);
    return (
      <g transform={sc(vx, 1 + s * v)}>
        <defs>
          <linearGradient id={`${id}${k}`} gradientUnits="userSpaceOnUse" x1={vx} y1="40" x2={tx} y2="40">
            <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
            <stop offset={front} style={{ stopColor: 'var(--accent)' }} />
            <stop offset={fade} style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path className={cls} d={d} />
        <path className={cls} d={d} fill={`url(#${id}${k})`} filter={`url(#${id}b)`} opacity={(0.75 * f).toFixed(3)} />
        <path className={cls} d={d} fill={`url(#${id}${k})`} opacity={f.toFixed(3)} />
      </g>
    );
  };
  return (
    <svg className={`word wg alive${once ? ' once' : ''}`} height={h} width={((h * 58) / 40).toFixed(1)} viewBox="43 20 58 40" fill="currentColor" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ overflow: 'visible' }}>
      <defs><filter id={`${id}b`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.3" /></filter></defs>
      {side(1)}
      {side(-1)}
      <path className="eyes" d={g.el} />
      <path className="eyes" d={g.er} />
    </svg>
  );
}
