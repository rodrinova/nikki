import { useCallback, useEffect, useRef, useState } from 'react';

export type Win = [number, number];

/**
 * A janela visível [a, b] dentro de [lo, hi], com a largura entre `minSpan` e tudo: puxada para dentro sem mudar a
 * largura, se possível.
 */
export function clampWin([a, b]: Win, lo: number, hi: number, minSpan: number): Win {
  const full = hi - lo;
  if (full <= 0) return [lo, hi];
  const span = Math.min(full, Math.max(Math.min(minSpan, full), b - a));
  const c = (a + b) / 2;
  let x = c - span / 2, y = c + span / 2;
  if (x < lo) { y += lo - x; x = lo; }
  if (y > hi) { x -= y - hi; y = hi; }
  return [Math.max(lo, x), Math.min(hi, y)];
}

/** Aproximar (factor < 1) ou afastar (factor > 1) à volta do ponto que está na fração `f` (0 a 1) da largura. */
export function zoomAt([a, b]: Win, f: number, factor: number): Win {
  const at = a + f * (b - a), span = (b - a) * factor;
  return [at - f * span, at - f * span + span];
}

/**
 * Escala do tempo com os dedos: afastar ou juntar dois dedos aproxima ou afasta; com a escala aproximada, arrastar
 * um dedo para o lado anda no tempo. No computador: pinça do trackpad (ou Ctrl + roda) e deslizar para o lado.
 * Devolve a janela visível e as propriedades a pôr no elemento do gráfico.
 */
export function useZoom(lo: number, hi: number, minSpan: number, init?: Win) {
  const fit = useCallback((w: Win) => clampWin(w, lo, hi, minSpan), [lo, hi, minSpan]);
  const start = init ?? [lo, hi];
  const [win, setWin] = useState<Win>(() => fit(start));
  const key = `${lo}:${hi}:${start[0]}:${start[1]}`;
  const last = useRef(key);
  useEffect(() => { if (last.current !== key) { last.current = key; setWin(fit(start)); } });
  const el = useRef<SVGSVGElement | null>(null);
  const pts = useRef(new Map<number, number>());
  const g = useRef<{ kind: 'pinch'; d: number; f: number; w: Win } | { kind: 'pan'; x: number; w: Win } | null>(null);
  const frac = (x: number) => { const r = el.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
  const begin = (w: Win) => {
    const xs = [...pts.current.values()];
    if (xs.length >= 2) g.current = { kind: 'pinch', d: Math.max(24, Math.abs(xs[0] - xs[1])), f: frac((xs[0] + xs[1]) / 2), w };
    else if (xs.length === 1) g.current = { kind: 'pan', x: xs[0], w };
    else g.current = null;
  };
  const winRef = useRef(win);
  winRef.current = win;
  const zoomed = win[1] - win[0] < hi - lo - 1e-9;

  // A roda tem de ser «não passiva» para a pinça do trackpad não aumentar a página inteira.
  useEffect(() => {
    const svg = el.current;
    if (!svg) return;
    const wheel = (e: WheelEvent) => {
      const w = winRef.current;
      if (e.ctrlKey) { e.preventDefault(); setWin(fit(zoomAt(w, frac(e.clientX), Math.exp(e.deltaY * 0.01)))); }
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && w[1] - w[0] < hi - lo) {
        e.preventDefault();
        const r = svg.getBoundingClientRect(), d = (e.deltaX / r.width) * (w[1] - w[0]);
        setWin(fit([w[0] + d, w[1] + d]));
      }
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [fit, hi, lo]);

  const bind = {
    ref: el,
    onPointerDown: (e: React.PointerEvent) => { pts.current.set(e.pointerId, e.clientX); begin(winRef.current); },
    onPointerMove: (e: React.PointerEvent) => {
      if (!pts.current.has(e.pointerId)) return;
      pts.current.set(e.pointerId, e.clientX);
      const s = g.current, xs = [...pts.current.values()];
      if (!s) return;
      if (s.kind === 'pinch' && xs.length >= 2) {
        const d = Math.max(24, Math.abs(xs[0] - xs[1])), f = frac((xs[0] + xs[1]) / 2);
        const at = s.w[0] + s.f * (s.w[1] - s.w[0]), span = (s.w[1] - s.w[0]) * (s.d / d);
        setWin(fit([at - f * span, at - f * span + span]));
      } else if (s.kind === 'pan' && e.pointerType !== 'mouse') {
        const r = el.current!.getBoundingClientRect(), dd = (-(xs[0] - s.x) / r.width) * (s.w[1] - s.w[0]);
        if (s.w[1] - s.w[0] < hi - lo) setWin(fit([s.w[0] + dd, s.w[1] + dd]));
      }
    },
    onPointerUp: (e: React.PointerEvent) => { pts.current.delete(e.pointerId); begin(winRef.current); },
    onPointerCancel: (e: React.PointerEvent) => { pts.current.delete(e.pointerId); begin(winRef.current); },
  };
  return { win, zoomed, bind, reset: () => setWin(fit(start)), all: () => setWin([lo, hi]) };
}
