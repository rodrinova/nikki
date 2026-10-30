import type { useZoom } from './zoom';

/** Por baixo de um gráfico com escala: como se muda e, com a escala aproximada, voltar a ver tudo. */
export function ZoomHint({ z }: { z: ReturnType<typeof useZoom> }) {
  return (
    <p className="zoom-hint s">
      <span>{z.zoomed ? 'Arrasta para o lado para andar no tempo.' : 'Afasta dois dedos no gráfico para aproximar.'}</span>
      {z.zoomed && <button type="button" className="press" onClick={z.all}>Ver tudo</button>}
    </p>
  );
}
