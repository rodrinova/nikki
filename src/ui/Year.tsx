import type { ReactNode } from 'react';
import { yearFill } from '@/lib/money';
import { Icon } from './Icon';

// Meses livres à vista (a ideia da janela do Windows, de Paula Scher: desenhar o que o nome diz).
// Um ano de 12 meses que se pinta com o rendimento passivo; o mês a meio avança com a ponta roída.
const L = 'JFMAMJJASOND';

export function Year({ free, label }: { free: number; label: string }) {
  return (
    <div className="year" role="img" aria-label={label}>
      {yearFill(free).map((v, j) => (
        <i key={j} className={v >= 1 ? 'f' : v > 0 ? 'p' : ''} style={{ ['--k' as string]: j, ...(v > 0 && v < 1 ? { ['--p' as string]: `${Math.round(v * 100)}%` } : {}) }}>{L[j]}</i>
      ))}
    </div>
  );
}

/** «Como contámos»: cada frase bonita traz a conta por trás, a um toque (a lição do BP Helios). */
export function How({ children }: { children: ReactNode }) {
  return (
    <details className="how">
      <summary>Como contámos <Icon n="chev" s={14} w={1.8} /></summary>
      <div className="how-in">{children}</div>
    </details>
  );
}
