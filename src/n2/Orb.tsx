import { useRef, useState, type PointerEvent as RPE } from 'react';
import { useNavigate } from 'react-router-dom';
import { Face } from '@/brand/Face';
import { useOverlays } from '@/ui/overlays';
import { Say } from '@/screens/QuickAdd';

/**
 * A cara é o comando (NIKKI 2). Não há barra em baixo: há a cara, a flutuar.
 *   · tocar: o campo único («escreve ou diz»)
 *   · manter: o mesmo campo, já a ouvir
 *   · arrastar para cima: os destinos abrem em arco à volta do dedo; largar em cima de um vai lá
 * Os olhos seguem o dedo; com o mês a puxar, os bigodes descaem. Teclado: Enter abre o campo; seta para cima abre
 * os destinos (que são botões a sério).
 */
export interface Dest { to: string; n: string }

export function Orb({ dests, tense }: { dests: Dest[]; tense?: boolean }) {
  const nav = useNavigate();
  const { open } = useOverlays();
  const [arc, setArc] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const st = useRef<{ x: number; y: number; t: number; long: ReturnType<typeof setTimeout> | null; moved: boolean } | null>(null);
  const R = 132, A0 = -160, A1 = -20; // o arco por cima da cara, em graus
  const angle = (k: number) => (A0 + ((A1 - A0) * k) / Math.max(1, dests.length - 1)) * (Math.PI / 180);
  const pos = (k: number) => ({ x: Math.cos(angle(k)) * R, y: Math.sin(angle(k)) * R });
  const say = (listen = false) => open(<div className="say-only"><Say listen={listen} /></div>);

  const down = (e: RPE<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, long: setTimeout(() => { if (st.current && !st.current.moved) { st.current = null; say(true); } }, 480) };
  };
  const move = (e: RPE<HTMLButtonElement>) => {
    const s = st.current; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    setLook({ x: Math.max(-1, Math.min(1, dx / 80)), y: Math.max(-1, Math.min(1, dy / 80)) });
    if (!s.moved && Math.hypot(dx, dy) > 14) { s.moved = true; if (s.long) clearTimeout(s.long); }
    if (s.moved && (dy < -24 || arc)) {
      if (!arc) setArc(true);
      let best: number | null = null, bd = 64;
      dests.forEach((_, k) => { const p = pos(k); const d = Math.hypot(dx - p.x, dy - p.y); if (d < bd) { bd = d; best = k; } });
      setHot(best);
    }
  };
  const up = () => {
    const s = st.current; st.current = null;
    setLook({ x: 0, y: 0 });
    if (s?.long) clearTimeout(s.long);
    if (arc) { const k = hot; setArc(false); setHot(null); if (k !== null) nav(dests[k].to); return; }
    if (s && !s.moved) say(false);
  };
  return (
    <div className={`orb-wrap${arc ? ' arc' : ''}`}>
      <div className="orb-arc" role="menu" aria-label="Destinos" aria-hidden={!arc}>
        {dests.map((d, k) => { const p = pos(k); return (
          <button key={d.to} type="button" role="menuitem" tabIndex={arc ? 0 : -1} className={`orb-dest${hot === k ? ' hot' : ''}`} style={{ ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--k' as string]: k }}
            onClick={() => { setArc(false); nav(d.to); }}>{d.n}</button>
        ); })}
      </div>
      <button type="button" className={`orb${tense ? ' tense' : ''}`} aria-label="NIKKI: tocar para escrever ou dizer; manter para ditar; arrastar para cima para ir a outro sítio"
        style={{ ['--lx' as string]: look.x, ['--ly' as string]: look.y }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { st.current = null; setArc(false); setHot(null); setLook({ x: 0, y: 0 }); }}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setArc(true); } if (e.key === 'Escape') setArc(false); }}
        onClick={(e) => { if (e.detail === 0) say(false); /* teclado (Enter/Espaço) */ }}>
        <Face h={26} mode="still" />
      </button>
    </div>
  );
}
