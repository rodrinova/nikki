import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Face } from '@/brand/Face';
import { Icon } from './Icon';
import type { Card } from '@/lib/story';

const DUR = 5500;

/**
 * Histórias em ecrã inteiro (a semana da casa, o vosso ano): um cartão de cada vez, com as barras de progresso em
 * cima. Toque à direita avança, à esquerda volta; manter o dedo pausa; as setas do teclado e o Esc também servem.
 * No fim, a cara pisca o olho.
 */
export function Stories({ cards, title, onClose }: { cards: Card[]; title: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef<{ t: number; x: number } | null>(null);
  const next = () => (i < cards.length - 1 ? setI(i + 1) : onClose());
  const prev = () => setI((k) => Math.max(0, k - 1));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight' || e.key === ' ') next(); else if (e.key === 'ArrowLeft') prev(); };
    addEventListener('keydown', k);
    document.body.classList.add('story-open');
    return () => { removeEventListener('keydown', k); document.body.classList.remove('story-open'); };
  });
  const c = cards[i], last = i === cards.length - 1;
  return createPortal(
    <div className="story" role="dialog" aria-modal="true" aria-label={title}
      onPointerDown={(e) => { held.current = { t: Date.now(), x: e.clientX }; setPaused(true); }}
      onPointerUp={(e) => {
        const h = held.current; held.current = null; setPaused(false);
        if (!h || Date.now() - h.t > 300 || (e.target as HTMLElement).closest('.st-x')) return;
        if (h.x < innerWidth * 0.3) prev(); else next();
      }}
      onPointerCancel={() => { held.current = null; setPaused(false); }}>
      <div className="st-bars" aria-hidden="true">{cards.map((x, j) => (
        <span key={x.k + j} className="st-bar"><i className={j < i ? 'full' : j === i ? 'run' : ''} style={j === i ? { animationDuration: `${DUR}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined} onAnimationEnd={j === i ? next : undefined} /></span>
      ))}</div>
      <div className="st-top"><span className="s">{title}</span><button type="button" className="st-x press" aria-label="Fechar" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}><Icon n="close" s={18} /></button></div>
      <div className={`st-card k-${c.k}`} key={i} aria-live="polite">
        <span className="st-eyebrow">{c.eyebrow}</span>
        <span className={`st-big${c.big.length > 9 ? ' long' : ''}`}>{c.big}{c.unit && <small>{c.unit}</small>}</span>
        <span className="st-line">{c.line}</span>
        {c.foot && <span className="st-foot">{c.foot}</span>}
        {last && <span className="st-face"><Face h={44} mode="wink" /></span>}
      </div>
      <span className="sr">{`${i + 1} de ${cards.length}`}</span>
    </div>,
    document.body,
  );
}
