import { useEffect, useState } from 'react';

/**
 * Números que rolam como um contador mecânico: cada algarismo roda até ao seu valor, com um pequeno atraso da
 * direita para a esquerda, na largura normal da letra. Para os leitores de ecrã, o número inteiro.
 */
export function Odometer({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState(() => value.replace(/\d/g, '0'));
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(value))); return () => cancelAnimationFrame(id); }, [value]);
  const chars = [...shown];
  return (
    <span className={`odo${className ? ` ${className}` : ''}`} aria-label={value} role="text">
      {chars.map((ch, k) => (/\d/.test(ch)
        ? <span key={k} className="odo-c" aria-hidden="true" style={{ ['--d' as string]: Number(ch), ['--k' as string]: chars.length - k }}><span className="odo-w">{[...value][k] ?? ch}</span><span className="odo-s">{'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}</span></span>
        : <span key={k} className="odo-x" aria-hidden="true">{ch}</span>))}
    </span>
  );
}
