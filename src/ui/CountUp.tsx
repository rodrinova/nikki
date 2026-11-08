import { useEffect, useRef, useState } from 'react';
import { inVT } from './vt';

/**
 * Um número que conta até ao valor ao aparecer (e quando muda), em ~0,7 s com saída suave. Com «reduzir movimento»
 * no sistema (ou numa transição partilhada), mostra logo o valor. `fmt` recebe o valor do momento (nas mesmas unidades de `to`).
 */
export function CountUp({ to, fmt, ms = 700 }: { to: number; fmt: (v: number) => string; ms?: number }) {
  // Numa transição partilhada o número chega já feito (veio do ecrã anterior): não volta a contar.
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const carried = useRef(inVT());
  const [v, setV] = useState(still || carried.current ? to : 0);
  const from = useRef(still || carried.current ? to : 0);
  useEffect(() => {
    if (still || carried.current) { carried.current = false; setV(to); from.current = to; return; }
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
