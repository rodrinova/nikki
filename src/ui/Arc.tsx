import { useEffect, useRef, useState } from 'react';

// Contas a dois num arco (a ideia do arco do Citi, de Paula Scher): quem vê à esquerda, o outro à direita.
// O ponto mostra para que lado está a conta e volta ao meio quando se equilibra. A posição vem de arcT.
const at = (t: number) => {
  const u = 1 - t;
  return [u * u * 40 + 2 * u * t * 160 + t * t * 280, u * u * 82 + 2 * u * t * -6 + t * t * 82];
};

/** O ponto desliza pelo arco quando o saldo muda (e não salta em linha reta). */
function useGlide(t: number) {
  const [v, setV] = useState(t);
  const from = useRef(t);
  useEffect(() => {
    const a = from.current;
    if (a === t) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = t; setV(t); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 700), x = a + (t - a) * (1 - Math.pow(1 - p, 3));
      from.current = x; setV(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [t]);
  return v;
}

interface Who { name: string; color: string }

export function Arc({ t, even, me, other, label }: { t: number; even: boolean; me: Who; other: Who; label: string }) {
  const [x, y] = at(useGlide(t));
  return (
    <svg className="arc" viewBox="0 0 320 120" role="img" aria-label={label}>
      <path className="arc-line" d="M40 82Q160 -6 280 82" />
      <circle className="arc-mid" cx="160" cy="38" r="11" />
      <circle cx="40" cy="100" r="16" style={{ fill: me.color }} />
      <text className="arc-ini" x="40" y="105">{me.name[0]}</text>
      <circle cx="280" cy="100" r="16" style={{ fill: other.color }} />
      <text className="arc-ini" x="280" y="105">{other.name[0]}</text>
      <circle className={`arc-dot${even ? ' even' : ''}`} cx={x.toFixed(2)} cy={y.toFixed(2)} r="7" />
    </svg>
  );
}

/** O mesmo arco em ícone, para o widget do início. */
export function ArcIcon({ t, even, s = 22 }: { t: number; even: boolean; s?: number }) {
  const u = 1 - t, x = u * u * 3 + 2 * u * t * 12 + t * t * 21, y = u * u * 17 + 2 * u * t * 1 + t * t * 17;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M3 17Q12 1 21 17" />
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="2.6" stroke="none" style={{ fill: even ? 'currentColor' : 'var(--accent)' }} />
    </svg>
  );
}
