import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@/n2/n2.css';
import { Face } from '@/brand/Face';
import { Icon } from './Icon';
import { Aurora } from '@/n2/Aurora';
import { DayArc, Dots, Gauge, MonthDial, Ruler } from '@/n2/Viz';
import { FRONTS, STEPS, guideKey, type GuideKey } from '@/lib/guide';
import { store } from '@/lib/store';
import { useSession } from '@/data/session';

// O guia: cenas curtas em ecrã inteiro, sempre em movimento. Toca à direita para avançar, à esquerda para voltar;
// manter o dedo pausa. As cenas avançam sozinhas, exceto as que pedem uma escolha.

interface Scene { k: string; ms?: number; body: (go: () => void) => ReactNode }

function Deck({ scenes, label, onClose }: { scenes: Scene[]; label: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef<{ t: number; x: number } | null>(null);
  const next = () => (i < scenes.length - 1 ? setI(i + 1) : onClose());
  const prev = () => setI((k) => Math.max(0, k - 1));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); };
    addEventListener('keydown', k);
    document.body.classList.add('story-open');
    return () => { removeEventListener('keydown', k); document.body.classList.remove('story-open'); };
  });
  const c = scenes[i];
  return createPortal(
    <div className="tour n2v" role="dialog" aria-modal="true" aria-label={label}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; held.current = { t: Date.now(), x: e.clientX }; setPaused(true); }}
      onPointerUp={(e) => { const h = held.current; held.current = null; setPaused(false); if (!h || Date.now() - h.t > 320) return; if (h.x < innerWidth * 0.28) prev(); else if (c.ms) next(); void e; }}
      onPointerCancel={() => { held.current = null; setPaused(false); }}>
      <Aurora />
      <div className="tour-bars" aria-hidden="true">{scenes.map((s, j) => (
        <span key={s.k}><i className={j < i ? 'full' : j === i && c.ms ? 'run' : ''} style={j === i && c.ms ? { animationDuration: `${c.ms}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined} onAnimationEnd={j === i ? next : undefined} /></span>
      ))}</div>
      <button type="button" className="tour-x press" onClick={onClose}>{i < scenes.length - 1 ? 'Saltar' : 'Fechar'}</button>
      <div className="tour-scene" key={c.k} aria-live="polite">{c.body(next)}</div>
    </div>,
    document.body,
  );
}

const Say = ({ t, d }: { t: string; d?: string }) => <div className="tour-say"><h2>{t}</h2>{d && <p>{d}</p>}</div>;
/** A barra de baixo em miniatura, com um destino aceso. */
const Dock = ({ hot }: { hot: number }) => (
  <div className="tour-dock" aria-hidden="true">
    {(['home', 'cal', 'plus', 'grid', 'chat'] as const).map((n, k) => <span key={n} className={`${k === 2 ? 'add ' : ''}${k === hot ? 'hot' : ''}`} style={{ ['--k' as string]: k }}><Icon n={n} s={22} /></span>)}
  </div>
);
/** Um texto que se escreve sozinho, como no campo do «+». */
const Typed = ({ text }: { text: string }) => <div className="tour-type"><span style={{ ['--n' as string]: text.length }}>{text}</span></div>;
const VIZ: Record<string, ReactNode> = {
  dinheiro: <MonthDial days={[6, 2, 0, 9, 4, 0, 7, 3, 0, 5, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} today={11} />,
  compras: <Dots n={10} hot={10} />, casa: <Ruler pct={4} />, objetivos: <Dots n={3} />, patrimonio: <Gauge v={62} />,
};
const Glyph = ({ k, ic }: { k: string; ic: string }) => <div className={`tour-glyph g-${k}`}>{VIZ[k] ?? <span className="tour-orb"><Icon n={ic as never} s={54} w={1} /></span>}</div>;

/**
 * A volta à casa, para quem chega: quem é a NIKKI, onde está tudo, o que faz cada frente (em rajada), o dia a dia,
 * e no fim a escolha do que a casa usa. `picked`/`toggle` vêm de quem sabe ligar e desligar módulos.
 */
export function Tour({ picked, toggle, canPick, onClose }: { picked: (k: string) => boolean; toggle: (k: string) => void; canPick: boolean; onClose: () => void }) {
  const scenes: Scene[] = [
    { k: 'ola', ms: 3600, body: () => <><div className="tour-face"><Face h={120} /></div><Say t="Olá. Eu sou a NIKKI." d="Ponho ordem na vida da casa." /></> },
    { k: 'barra', ms: 4200, body: () => <><div className="tour-labels">{['Hoje', 'Agenda', 'Registar', 'Casa', 'Ideias'].map((l, k) => <b key={l} style={{ ['--k' as string]: k }}>{l}</b>)}</div><Dock hot={-1} /><Say t="Está tudo aqui em baixo." d="Cinco botões. Sempre no mesmo sítio." /></> },
    { k: 'hoje', ms: 4200, body: () => <><div className="tour-glyph"><DayArc now={10.5} marks={[9, 13, 18.75]} /></div><Dock hot={0} /><Say t="Hoje" d="O teu dia e o que há a fazer." /></> },
    { k: 'mais', ms: 4600, body: () => <><Typed text="12 almoço ontem" /><Dock hot={2} /><Say t="O + regista tudo" d="Escreve como falas. Ela percebe." /></> },
    { k: 'agenda', ms: 3600, body: () => <><div className="tour-week">{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, k) => <span key={k} style={{ ['--k' as string]: k }}><small>{d}</small><i className={k === 2 ? 'now' : k === 4 || k === 5 ? 'on' : ''} /></span>)}</div><Dock hot={1} /><Say t="Agenda" d="A semana dos dois." /></> },
    { k: 'casa', ms: 3600, body: () => <><div className="tour-grid">{FRONTS.slice(0, 6).map((f, k) => <span key={f.k} style={{ ['--k' as string]: k }}><Icon n={f.ic as never} s={24} /></span>)}</div><Dock hot={3} /><Say t="Casa" d="Cada frente no seu cartão." /></> },
    ...FRONTS.map((f): Scene => ({ k: `f-${f.k}`, ms: 2700, body: () => <><Glyph k={f.k} ic={f.ic} /><Say t={f.n} d={f.one} /></> })),
    { k: 'dia', ms: 6200, body: () => <><ol className="tour-day">{[['De manhã', 'abre o Hoje'], ['Gastaste?', 'toca no +'], ['Falta leite?', 'junta às compras'], ['Ao domingo', 'vê a semana']].map(([a, b], k) => <li key={a} style={{ ['--k' as string]: k }}><small>{a}</small><b>{b}</b></li>)}</ol><Say t="O dia a dia" /></> },
    { k: 'escolher', body: (go) => (
      <>
        <Say t="O que é que esta casa usa?" d={canPick ? 'Liga só o que faz falta. Muda-se quando quiseres.' : 'Quem criou a casa escolhe. Podes ver o que está ligado.'} />
        <div className="tour-pick">{FRONTS.map((f, k) => {
          const lit = f.always || picked(f.k);
          return <button key={f.k} type="button" className={`press${lit ? ' on' : ''}`} aria-pressed={lit} disabled={f.always || !canPick} style={{ ['--k' as string]: k }} onClick={() => toggle(f.k)}><Icon n={f.ic as never} s={22} /><span>{f.n}</span></button>;
        })}</div>
        <button type="button" className="tour-go press" onClick={go}>Está escolhido <Icon n="arrow" s={18} /></button>
      </>
    ) },
    { k: 'fim', body: () => <><div className="tour-face"><Face h={96} mode="wink" /></div><Say t="Está feito." d="Cada frente explica-se quando a abrires pela primeira vez." /><button type="button" className="tour-go press" onClick={onClose}>Começar <Icon n="arrow" s={18} /></button></> },
  ];
  return <Deck scenes={scenes} label="Guia da NIKKI" onClose={onClose} />;
}

/** Três passos de «como se faz» dentro de uma frente. */
export function ModuleGuide({ k, onClose }: { k: GuideKey; onClose: () => void }) {
  const f = FRONTS.find((x) => x.k === k), steps = STEPS[k];
  if (!f || !steps) return null;
  const scenes: Scene[] = [
    { k: 'capa', ms: 2600, body: () => <><Glyph k={f.k} ic={f.ic} /><Say t={f.n} d={f.one} /></> },
    ...steps.map((s, j): Scene => ({ k: `s${j}`, ms: 5200, body: () => <><div className="tour-step"><b>{j + 1}</b><i /></div>{s.eg && <Typed text={s.eg} />}<Say t={s.t} d={s.d} /></> })),
    { k: 'fim', body: () => <><Glyph k={f.k} ic={f.ic} /><Say t="É isto." d="O resto descobre-se a usar." /><button type="button" className="tour-go press" onClick={onClose}>Vamos <Icon n="arrow" s={18} /></button></> },
  ];
  return <Deck scenes={scenes} label={`Como funciona: ${f.n}`} onClose={onClose} />;
}

/** Mostra o guia de uma frente a primeira vez que a pessoa lá entra (e sempre que for pedido com `nikki:guide`). */
export function GuideOnce({ k }: { k: GuideKey }) {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!me) return;
    if (!store.get(guideKey(me.id, k)) && !document.querySelector('.tour')) setOpen(true);
    const again = (e: Event) => { if ((e as CustomEvent).detail === k) setOpen(true); };
    addEventListener('nikki:guide', again);
    return () => removeEventListener('nikki:guide', again);
  }, [me, k]);
  if (!open || !me) return null;
  return <ModuleGuide k={k} onClose={() => { store.set(guideKey(me.id, k), '1'); setOpen(false); }} />;
}
