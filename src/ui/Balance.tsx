import { useEffect, useState } from 'react';

/**
 * A balança do «Entre nós»: o prato de quem adiantou mais desce. `lean` vem de whiskerLean (−0,5 a 0,5; positivo =
 * eu adiantei mais), por isso inclina muito no início e assenta devagar quando a diferença é grande. Ao aparecer,
 * parte do meio e assenta com uma mola. Em equilíbrio, fica direita e os dois pratos acendem.
 */
export function Balance({ lean, me, other, label, small }: {
  lean: number; me: { name: string; color?: string | null }; other: { name: string; color?: string | null }; label: string; small?: boolean;
}) {
  const target = Math.max(-1, Math.min(1, lean * 2)) * 14; // graus
  const [deg, setDeg] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setDeg(target))); return () => cancelAnimationFrame(id); }, [target]);
  const L = 104, cx = 150, cy = 44;
  const rad = (-deg * Math.PI) / 180; // positivo: o meu lado (esquerda) desce
  const end = (side: -1 | 1) => ({ x: cx + side * L * Math.cos(rad), y: cy + side * L * Math.sin(rad) });
  const l = end(-1), r = end(1);
  const even = Math.abs(target) < 0.5;
  const pan = (p: { x: number; y: number }, who: { name: string; color?: string | null }, heavy: boolean) => (
    <g className={`bal-pan${heavy ? ' heavy' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
      <path d="M0 0 L-30 52 M0 0 L30 52" className="bal-str" />
      <path d="M-38 52 Q0 74 38 52 Z" className="bal-dish" />
      <circle cx="0" cy="38" r="15" className="bal-av" style={{ fill: who.color ?? 'var(--tile-2)' }} />
      <text x="0" y="43.5" textAnchor="middle" className="bal-ini">{who.name[0]}</text>
    </g>
  );
  return (
    <svg className={`balance${small ? ' small' : ''}${even ? ' even' : ''}`} viewBox="0 0 300 150" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <path d={`M${cx} ${cy} V140 M${cx - 34} 140 H${cx + 34}`} className="bal-post" />
      <g className="bal-beam" style={{ transform: `rotate(${-deg}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <line x1={cx - L} y1={cy} x2={cx + L} y2={cy} />
      </g>
      <circle cx={cx} cy={cy} r="5" className="bal-pivot" />
      {pan(l, me, deg > 0.5)}
      {pan(r, other, deg < -0.5)}
    </svg>
  );
}
