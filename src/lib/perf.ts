// Rapidez deste aparelho: alguns tempos do arranque (em ms desde que a página começou a abrir), para comparar
// navegadores no mesmo telemóvel. Fica só na memória da página; nada sai do aparelho.

export const marks: Record<string, number> = {};
export const spans: Record<string, number> = {};

/** Marca a primeira vez que algo acontece (as seguintes não contam). */
export function mark(k: string) {
  if (!(k in marks) && typeof performance !== 'undefined') marks[k] = Math.round(performance.now());
}

/** Duração de uma operação (a primeira de cada nome). */
export function span(k: string, ms: number) {
  if (!(k in spans)) spans[k] = Math.round(ms);
}

/** Resumo dos pedidos ao Supabase feitos até agora. */
export function requests(host: string) {
  if (typeof performance === 'undefined') return null;
  const rs = performance.getEntriesByType('resource').filter((r) => r.name.includes(host)) as PerformanceResourceTiming[];
  if (!rs.length) return null;
  const d = rs.map((r) => r.duration).sort((a, b) => a - b);
  const proto = [...new Set(rs.map((r) => r.nextHopProtocol).filter(Boolean))].join(', ');
  return { n: rs.length, median: Math.round(d[Math.floor(d.length / 2)]), max: Math.round(d[d.length - 1]), proto };
}
