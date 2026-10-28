import { useEffect, useRef, useState } from 'react';

// Contas a dois na cara da NIKKI: tu à esquerda, o outro à direita. Abre igual ao logótipo e, meio segundo
// depois, os bigodes de quem adiantou mais crescem e acendem a laranja, e os do outro encolhem (whiskerLean).
// Em equilíbrio ficam iguais e a cara pisca. Geometria de brand/wordmark.py; até 32 px, bigodes mais grossos.
const G = [
  { el: 'M62.15 24H65.35V56H62.15Z', er: 'M78.15 24H81.35V56H78.15Z', wl: 'M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z', wr: 'M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z', vl: 62.15, vr: 81.35 },
  { el: 'M62.63 24H65.83V56H62.63Z', er: 'M78.63 24H81.83V56H78.63Z', wl: 'M62.63 38.14L53.57 24H51.2L62.63 41.86Z M62.63 38.14L51.2 56H53.57L62.63 41.86Z', wr: 'M81.83 38.14L90.88 24H93.25L81.83 41.86Z M81.83 38.14L93.25 56H90.88L81.83 41.86Z', vl: 62.63, vr: 81.83 },
];
const sc = (v: number, f: number) => `translate(${v} 40) scale(${f.toFixed(3)} 1) translate(${-v} -40)`;
// O laranja acende depressa assim que os bigodes começam a crescer
const glow = (x: number) => Math.min(1, Math.max(0, x) / 0.06).toFixed(3);

/**
 * lean: de −0,5 a 0,5 (positivo = adiantaste tu mais). enter: abre igual ao logótipo e só depois mostra o
 * estado (no ecrã das contas); sem enter, mostra logo o estado (ícone do widget). label só no tamanho grande.
 */
export function Whiskers({ lean, h, label, enter = true }: { lean: number; h: number; label?: string; enter?: boolean }) {
  const g = G[h <= 32 ? 1 : 0];
  const [v, setV] = useState(enter ? 0 : lean);
  const [once, setOnce] = useState(false);
  const cur = useRef(enter ? 0 : lean);
  const born = useRef(performance.now());
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, blinkT = 0;
    const blink = () => { setOnce(true); blinkT = window.setTimeout(() => setOnce(false), 700); };
    // meio segundo depois de abrir; a seguir, cada mudança anima logo
    const wait = Math.max(0, 550 - (performance.now() - born.current));
    const t = window.setTimeout(() => {
      const a = cur.current;
      if (reduce || a === lean) { cur.current = lean; setV(lean); if (lean === 0 && enter) blink(); return; }
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
  return (
    <svg className={`word wg alive${once ? ' once' : ''}`} height={h} width={((h * 58) / 40).toFixed(1)} viewBox="43 20 58 40" fill="currentColor" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform={sc(g.vl, 1 + v)}><path className="wk-l" d={g.wl} /><path className="wk-l" d={g.wl} style={{ fill: 'var(--accent)' }} opacity={glow(v)} /></g>
      <g transform={sc(g.vr, 1 - v)}><path className="wk-r" d={g.wr} /><path className="wk-r" d={g.wr} style={{ fill: 'var(--accent)' }} opacity={glow(-v)} /></g>
      <path className="eyes" d={g.el} />
      <path className="eyes" d={g.er} />
    </svg>
  );
}
