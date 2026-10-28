import { useEffect, useRef, useState } from 'react';

// Contas a dois na cara da NIKKI: tu à esquerda, o outro à direita. Os bigodes de quem adiantou mais
// crescem e os do outro encolhem (whiskerLean); em equilíbrio ficam iguais, como no logótipo, e a cara pisca.
// Geometria de brand/wordmark.py; até 32 px usa os bigodes mais grossos. vl e vr são os vértices dos bigodes.
const G = [
  { el: 'M62.15 24H65.35V56H62.15Z', er: 'M78.15 24H81.35V56H78.15Z', wl: 'M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z', wr: 'M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z', vl: 62.15, vr: 81.35 },
  { el: 'M62.63 24H65.83V56H62.63Z', er: 'M78.63 24H81.83V56H78.63Z', wl: 'M62.63 38.14L53.57 24H51.2L62.63 41.86Z M62.63 38.14L51.2 56H53.57L62.63 41.86Z', wr: 'M81.83 38.14L90.88 24H93.25L81.83 41.86Z M81.83 38.14L93.25 56H90.88L81.83 41.86Z', vl: 62.63, vr: 81.83 },
];
const sc = (v: number, f: number) => `translate(${v} 40) scale(${f.toFixed(3)} 1) translate(${-v} -40)`;

/** Os bigodes crescem e encolhem devagar quando o saldo muda (em vez de saltarem). */
function useGlide(x: number) {
  const [v, setV] = useState(x);
  const from = useRef(x);
  useEffect(() => {
    const a = from.current;
    if (a === x) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = x; setV(x); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 700), y = a + (x - a) * (1 - Math.pow(1 - p, 3));
      from.current = y; setV(y);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [x]);
  return v;
}

/** lean: de −0,5 a 0,5 (positivo = adiantaste tu mais). label só no tamanho grande; o ícone é decorativo. */
export function Whiskers({ lean, even, h, label }: { lean: number; even: boolean; h: number; label?: string }) {
  const g = G[h <= 32 ? 1 : 0], v = useGlide(lean);
  const [once, setOnce] = useState(false);
  useEffect(() => {
    if (!even) return;
    setOnce(true);
    const t = setTimeout(() => setOnce(false), 700);
    return () => clearTimeout(t);
  }, [even]);
  return (
    <svg className={`word wg alive${once ? ' once' : ''}`} height={h} width={((h * 58) / 40).toFixed(1)} viewBox="43 20 58 40" fill="currentColor" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform={sc(g.vl, 1 + v)}><path className="wk-l" d={g.wl} /></g>
      <g transform={sc(g.vr, 1 - v)}><path className="wk-r" d={g.wr} /></g>
      <path className="eyes" d={g.el} />
      <path className="eyes" d={g.er} />
    </svg>
  );
}
