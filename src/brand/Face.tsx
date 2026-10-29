// A cara da NIKKI: os olhos (as hastes dos K) e os bigodes (as pernas), sem as outras letras.
// Depois da abertura é esta a marca em toda a app; o nome inteiro fica para a entrada e para a história.
// Geometria de brand/wordmark.py; até 32 px usa os bigodes mais grossos.
const F = [
  { el: 'M62.15 24H65.35V56H62.15Z', er: 'M78.15 24H81.35V56H78.15Z', wl: 'M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z', wr: 'M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z' },
  { el: 'M62.63 24H65.83V56H62.63Z', er: 'M78.63 24H81.83V56H78.63Z', wl: 'M62.63 38.14L53.57 24H51.2L62.63 41.86Z M62.63 38.14L51.2 56H53.57L62.63 41.86Z', wr: 'M81.83 38.14L90.88 24H93.25L81.83 41.86Z M81.83 38.14L93.25 56H90.88L81.83 41.86Z' },
];

/**
 * alive: pisca a cada 4,2 s e mexe os bigodes · busy: pisca depressa enquanto carrega
 * wink: pisca o olho uma vez (algo ficou gravado) · pull: bigodes a tremer enquanto se puxa para atualizar
 */
export type FaceMode = 'alive' | 'still' | 'busy' | 'wink' | 'pull';

export function Face({ h, mode = 'alive', label }: { h: number; mode?: FaceMode; label?: string }) {
  const g = F[h <= 32 ? 1 : 0];
  return (
    <svg className={`word face ${mode}`} height={h} width={((h * 46) / 36).toFixed(1)} viewBox="49 22 46 36" fill="currentColor" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="wk-l" d={g.wl} />
      <path className="wk-r" d={g.wr} />
      <path className="eyes eye-l" d={g.el} />
      <path className="eyes eye-r" d={g.er} />
    </svg>
  );
}
