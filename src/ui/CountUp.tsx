import { useEffect, useRef, useState } from 'react';

/**
 * Um número que conta até ao valor ao aparecer (e quando muda), em ~0,7 s com saída suave. Com «reduzir movimento»
 * no sistema, mostra logo o valor. `fmt` recebe o valor do momento (nas mesmas unidades de `to`).
 */
export function CountUp({ to, fmt, ms = 700 }: { to: number; fmt: (v: number) => string; ms?: number }) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [v, setV] = useState(still ? to : 0);
  const from = useRef(still ? to : 0);
  useEffect(() => {
    if (still) { setV(to); return; }
    const a = from.current, t0 = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(a + (to - a) * e);
      if (k < 1) id = requestAnimationFrame(step); else from.current = to;
    };
    id = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(id); from.current = to; };
  }, [to, ms, still]);
  return <>{fmt(v)}</>;
}
