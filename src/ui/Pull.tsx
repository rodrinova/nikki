import { useEffect, useRef, useState } from 'react';
import { Face } from '@/brand/Face';

// Puxar para atualizar: no topo do ecrã, puxa-se para baixo e a cara aparece com os bigodes a tremer.
// Ao largar, pisca enquanto a NIKKI volta a ler tudo. Só em ecrãs de toque.
const MAX = 96, GO = 64;

export function Pull({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [d, setD] = useState(0);
  const [busy, setBusy] = useState(false);
  const r = useRef({ y0: null as number | null, d: 0, busy: false });

  useEffect(() => {
    const s = r.current;
    const start = (e: TouchEvent) => {
      s.d = 0;
      s.y0 = !s.busy && scrollY <= 0 && !document.body.classList.contains('has-sheet') ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (s.y0 === null) return;
      const dy = e.touches[0].clientY - s.y0;
      s.d = dy > 0 ? Math.min(MAX, dy * 0.5) : 0;
      setD(s.d);
    };
    const end = async () => {
      if (s.y0 === null) return;
      s.y0 = null;
      if (s.d >= GO) {
        s.busy = true; setBusy(true); setD(GO);
        const t0 = Date.now();
        try { await onRefresh(); } finally {
          await new Promise((ok) => setTimeout(ok, Math.max(0, 800 - (Date.now() - t0)))); // o tempo de piscar
          s.busy = false; setBusy(false);
        }
      }
      s.d = 0; setD(0);
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => {
      removeEventListener('touchstart', start); removeEventListener('touchmove', move);
      removeEventListener('touchend', end); removeEventListener('touchcancel', end);
    };
  }, [onRefresh]);

  return (
    <div className={`tug${d ? ' on' : ''}`} style={{ transform: `translate(-50%, ${d - 44}px)` }} aria-hidden="true">
      <Face h={22} mode={busy ? 'busy' : 'pull'} />
    </div>
  );
}
