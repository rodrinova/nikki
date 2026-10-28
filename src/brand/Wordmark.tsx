// Wordmark NIKKI: o primeiro K espelhado; as hastes dos K são os olhos, as pernas finas os bigodes.
// Geometria de brand/wordmark.py (repositório thenikki). Até 32 px usa a versão com bigodes mais grossos.
const WM = [
  { lt: 'M0 60V20H3.43L22.4 53.87V20H25.6V60H22.17L3.2 26.13V60Z M38.4 20H41.6V60H38.4Z M101.9 20H105.1V60H101.9Z', eyes: 'M62.15 24H65.35V56H62.15Z M78.15 24H81.35V56H78.15Z', wl: 'M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z', wr: 'M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z', w: 105.1 },
  { lt: 'M0 60V20H3.43L22.4 53.87V20H25.6V60H22.17L3.2 26.13V60Z M38.4 20H41.6V60H38.4Z M102.85 20H106.05V60H102.85Z', eyes: 'M62.63 24H65.83V56H62.63Z M78.63 24H81.83V56H78.63Z', wl: 'M62.63 38.14L53.57 24H51.2L62.63 41.86Z M62.63 38.14L51.2 56H53.57L62.63 41.86Z', wr: 'M81.83 38.14L90.88 24H93.25L81.83 41.86Z M81.83 38.14L93.25 56H90.88L81.83 41.86Z', w: 106.05 },
];

export function Wordmark({ h, alive = false, draw = false }: { h: number; alive?: boolean; draw?: boolean }) {
  const g = WM[h <= 32 ? 1 : 0];
  return (
    <svg className={`word${alive ? ' alive' : ''}${draw ? ' draw' : ''}`} height={h} width={((h * g.w) / 40).toFixed(1)} viewBox={`0 20 ${g.w} 40`} fill="currentColor" role="img" aria-label="NIKKI">
      <path className="lt" d={g.lt} />
      <path className="wk-l" d={g.wl} />
      <path className="wk-r" d={g.wr} />
      <path className="eyes" d={g.eyes} />
    </svg>
  );
}
