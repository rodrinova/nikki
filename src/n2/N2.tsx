import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './n2.css';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useAgendaItems } from '@/data/agenda';
import { useShopPresence } from '@/data/presence';
import { addDays, monthKey, monthName, prevMonth, todayStr } from '@/lib/dates';
import { eur } from '@/lib/money';
import { expected } from '@/lib/forecast';
import { buckets, LEVELS, type Ghost, type Level } from '@/lib/thread';
import { INVEST, catLabel, catNormals, useLedger, useMonth } from '@/screens/Money';
import { driver } from '@/lib/forecast';
import { LightField, type Light } from './LightField';
import { Odometer } from './Odometer';
import { Orb, type Dest } from './Orb';
import { MonthPoster } from './MonthPoster';
import { Now } from '@/screens/Home';

// NIKKI 2 (protótipo): luz em vez de caixas, a cara como comando e o tempo como eixo. Só para quem administra a
// app e para a demonstração; a NIKKI de todos os dias não muda.

const DESTS: Dest[] = [
  { to: '/n2', n: 'Hoje' }, { to: '/n2/tempo', n: 'Tempo' }, { to: '/dinheiro', n: 'Dinheiro' }, { to: '/espacos', n: 'Casa' }, { to: '/nos', n: 'Nós' },
];

/** As luzes do fundo: o mês (quente quando puxa), o sol pela hora, tu, e o outro (mais forte quando está nas compras). */
function useLights(heat: number, partnerHere: boolean): Light[] {
  const { me, partner } = useSession();
  const [h, setH] = useState(() => new Date().getHours() + new Date().getMinutes() / 60);
  useEffect(() => { const t = setInterval(() => setH(new Date().getHours() + new Date().getMinutes() / 60), 60_000); return () => clearInterval(t); }, []);
  return useMemo(() => {
    const day = Math.max(0, Math.min(1, (h - 6) / 16)); // 6h → 0, 22h → 1
    const up = Math.sin(Math.PI * day);
    const night = h < 6 || h >= 22;
    const L: Light[] = [
      { x: 0.12 + 0.76 * day, y: night ? 1.05 : 0.98 - 0.6 * up, r: 0.4, i: night ? 0.22 : 0.26 + 0.22 * up, c: '#FF7A1F' }, // o sol da casa
      { x: 0.86, y: 0.1, r: 0.3, i: Math.min(0.5, Math.max(0, heat - 0.5) * 1.4), c: '#D6463C' }, // o mês a puxar
      { x: 0.08, y: 0.72, r: 0.26, i: 0.2, c: me?.color ?? '#8EA6BD' },
    ];
    if (partner) L.push({ x: 0.9, y: 0.62, r: partnerHere ? 0.34 : 0.22, i: partnerHere ? 0.55 : 0.16, c: partner.color ?? '#D29B7A' });
    return L;
  }, [h, heat, partnerHere, me?.color, partner]);
}

function useN2Base() {
  const { me, partner, house } = useSession();
  const { on } = useHouse();
  const m = useMonth();
  const heat = m.pace.fresh ? 0.5 : Math.max(0, Math.min(1, 0.5 + m.pace.pct / 100));
  const { here } = useShopPresence(on('compras') ? house?.id : undefined, me?.id, true);
  const partnerHere = !!partner && !!here[partner.id];
  const lights = useLights(heat, partnerHere);
  useEffect(() => { document.body.classList.add('n2'); return () => document.body.classList.remove('n2'); }, []);
  return { m, heat, lights, partnerHere };
}

/** A frase do dia: como vai o mês e o que vem a seguir. */
function headline(pct: number | null, next: { title: string; time: string | null } | null, tomorrow: { title: string; time: string | null } | null) {
  const mood = pct === null ? 'Mês a começar.' : pct <= -10 ? 'Mês tranquilo.' : pct < 10 ? 'Mês no ritmo.' : pct < 25 ? 'Mês a puxar.' : 'Mês quente.';
  const what = next ? `${next.title}${next.time ? ` às ${next.time}` : ''}.` : tomorrow ? `Amanhã, ${tomorrow.title.toLowerCase()}${tomorrow.time ? ` às ${tomorrow.time}` : ''}.` : 'Dia livre.';
  return `${mood} ${what}`;
}

export function N2Home() {
  const { me, partner } = useSession();
  const { spendRows } = useHouse();
  const { m, lights, heat, partnerHere } = useN2Base();
  const L = useLedger();
  const today = todayStr(), tmw = addDays(today, 1);
  const items = useAgendaItems(today, tmw);
  const hhmm = (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();
  const nx = items.filter((i) => i.day === today && i.kind !== 'due' && (!i.time || (i.endTime ?? i.time) > hhmm)).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))[0] ?? null;
  const tm = items.filter((i) => i.day === tmw && i.kind !== 'due' && i.kind !== 'busy').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))[0] ?? null;
  const pct = m.pace.fresh ? null : m.pace.pct;
  const why = useMemo(() => {
    if (m.pace.fresh || m.pace.pct < 10 || !me) return null;
    const c = driver(m.dailyByCat, catNormals(spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), me.id, today), m.pace.share);
    return c ? catLabel(c) : null;
  }, [m, spendRows, me, today]);
  // O peso do número diz o mesmo que a luz: mais pesado quando o mês puxa.
  const weight = Math.round(360 + 380 * heat);
  const prev = prevMonth(monthKey(today));
  const [poster, setPoster] = useState(false);
  const daily = useMemo(() => spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), [spendRows]);
  return (
    <div className="n2-page">
      <LightField lights={lights} />
      <header className="n2-top">
        <Link to="/" className="n2-link press">NIKKI 1</Link>
        <span className="n2-date">{new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <Link to="/nos" className="n2-us press" aria-label="Nós">
          <i style={{ ['--c' as string]: me?.color }} />{partner && <i className={partnerHere ? 'here' : ''} style={{ ['--c' as string]: partner.color }} />}
        </Link>
      </header>

      <h1 className="n2-head">{headline(pct, nx && { title: nx.title, time: nx.time }, tm && { title: tm.title, time: tm.time })}</h1>

      <section className="n2-month" aria-label="O mês">
        <Link to="/dinheiro" className="n2-num press"><Odometer value={eur(m.total, 0)} weight={weight} /><small>€</small></Link>
        <p className="n2-sub">{partner ? 'A tua parte em ' : ''}{monthName(m.key)}{pct !== null ? ` · ${pct === 0 ? 'no ritmo' : `${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'}`}${why ? `, sobretudo ${why.toLowerCase()}` : ''}` : ''}</p>
        {!m.pace.fresh && m.pace.blocks !== undefined && (
          <div className="n2-blades" role="img" aria-label={`Ritmo: ${m.pace.blocks} dias de um mês normal já gastos, ao dia ${m.pace.day} de ${m.pace.days}.`}>
            {Array.from({ length: m.pace.days }, (_, j) => <i key={j} className={`${j < (m.pace.blocks ?? 0) ? (j < m.pace.day ? 'f' : 'a') : ''}${j === m.pace.day - 1 ? ' now' : ''}`} style={{ ['--j' as string]: j }} />)}
          </div>
        )}
        {partner && L && <Link to="/dinheiro?ver=entre-nos" className="n2-line press">Entre nós · {L.even ? 'em equilíbrio' : `${L.lead.toLowerCase()}, ${eur(Math.abs(L.v), 0)} €`}</Link>}
      </section>

      <section className="n2-plain" aria-label="A NIKKI lembra"><Now /></section>

      <section className="n2-row">
        <Link to="/n2/tempo" className="n2-door press"><span className="n2-k">O fio do tempo</span><span>Do dia ao ano, num gesto.</span></Link>
        <button type="button" className="n2-door press" onClick={() => setPoster(true)}>
          <MonthPoster small expenses={daily} who={me?.id ?? ''} monthKey={prev} me={me?.color} other={partner?.color} />
          <span className="n2-k">Cartaz de {monthName(prev)}</span>
        </button>
      </section>
      {poster && (
        <div className="n2-over" role="dialog" aria-modal="true" aria-label={`Cartaz de ${monthName(prev)}`} onClick={(e) => { if (e.target === e.currentTarget) setPoster(false); }}>
          <MonthPoster expenses={daily} who={me?.id ?? ''} monthKey={prev} me={me?.color} other={partner?.color} />
          <button type="button" className="n2-link press" onClick={() => setPoster(false)}>Fechar</button>
        </div>
      )}
      <Orb dests={DESTS} tense={pct !== null && pct >= 15} />
    </div>
  );
}

/**
 * O fio do tempo: o mesmo tempo a quatro escalas. Afastar dois dedos (ou Ctrl + roda, ou as teclas − e +) muda de
 * escala, a partir do ponto onde estão os dedos. O «agora» é uma linha de luz; o futuro tem os fantasmas.
 */
export function N2Time() {
  const { me } = useSession();
  const { spendRows, deadlines } = useHouse();
  const { lights } = useN2Base();
  const [level, setLevel] = useState<Level>(1);
  const [dir, setDir] = useState<'in' | 'out'>('out');
  const [focus, setFocus] = useState('50% 40%');
  const today = todayStr(), hour = new Date().getHours();
  const items = useAgendaItems(addDays(today, -400), addDays(today, 100));
  const daily = useMemo(() => spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), [spendRows]);
  const ghosts = useMemo<Ghost[]>(() => [
    ...(me ? expected(daily, me.id, today).map((x) => ({ day: x.day < today ? today : x.day, title: x.note, amount: x.amount })) : []),
    ...deadlines.rows.filter((d) => !d.paid_at && d.due_on >= today).map((d) => ({ day: d.due_on, title: d.title, amount: d.amount ? Number(d.amount) * 100_000 : undefined })),
  ], [daily, me, today, deadlines.rows]);
  const rows = useMemo(() => buckets(level, today, hour, { expenses: daily, who: me?.id ?? '', items: items.map((i) => ({ day: i.day, time: i.time, title: i.title, kind: i.kind })), ghosts }), [level, today, hour, daily, me?.id, items, ghosts]);
  const max = Math.max(1, ...rows.map((r) => r.spend));
  const zoom = (to: Level, at?: { x: number; y: number }) => {
    if (to === level || to < 0 || to > 3) return;
    setDir(to > level ? 'out' : 'in');
    if (at) setFocus(`${Math.round((at.x / innerWidth) * 100)}% ${Math.round((at.y / innerHeight) * 100)}%`);
    setLevel(to);
  };
  // Dois dedos: a distância entre eles decide (afastar = mais perto no tempo; juntar = mais longe).
  const pinch = useRef<{ d: number; done: boolean } | null>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { nowRef.current?.scrollIntoView({ block: 'center' }); }, [level]);
  useEffect(() => {
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); if (Math.abs(e.deltaY) > 4) zoom((level + (e.deltaY > 0 ? 1 : -1)) as Level, { x: e.clientX, y: e.clientY }); };
    const key = (e: KeyboardEvent) => { if (e.key === '-' ) zoom((level + 1) as Level); if (e.key === '+' || e.key === '=') zoom((level - 1) as Level); };
    addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', key);
    return () => { removeEventListener('wheel', wheel); removeEventListener('keydown', key); };
  });
  return (
    <div className="n2-page n2-time"
      onTouchStart={(e) => { if (e.touches.length === 2) { const [a, b] = [e.touches[0], e.touches[1]]; pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), done: false }; } }}
      onTouchMove={(e) => {
        const p = pinch.current; if (!p || p.done || e.touches.length !== 2) return;
        const [a, b] = [e.touches[0], e.touches[1]], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), at = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        if (d / p.d > 1.3) { p.done = true; zoom((level - 1) as Level, at); } else if (d / p.d < 0.75) { p.done = true; zoom((level + 1) as Level, at); }
      }}
      onTouchEnd={() => { pinch.current = null; }}>
      <LightField lights={lights} dim={0.7} />
      <header className="n2-top">
        <Link to="/n2" className="n2-link press">Hoje</Link>
        <span className="n2-date">O fio do tempo</span>
        <span />
      </header>
      <div className="n2-levels" role="tablist" aria-label="Escala">
        {LEVELS.map((n, k) => <button key={n} type="button" role="tab" aria-selected={k === level} className="press" onClick={() => zoom(k as Level)}>{n}</button>)}
      </div>
      <p className="n2-hint">Afasta ou junta dois dedos para mudar de escala.</p>
      <div className={`n2-thread z-${dir}`} key={level} style={{ transformOrigin: focus }}>
        {rows.map((r) => (
          <div key={r.key} ref={r.now ? nowRef : undefined} className={`n2-b${r.now ? ' now' : ''}${r.future ? ' fut' : ''}`}>
            <span className="n2-bl"><span>{r.label}</span>{r.sub && <small>{r.sub}</small>}</span>
            <span className="n2-bm">
              {level === 3 && !r.future && r.spend > 0
                ? <MonthPoster small expenses={daily} who={me?.id ?? ''} monthKey={r.key} />
                : level > 0 && r.spend > 0 && <i className="n2-blade" style={{ ['--w' as string]: `${Math.max(r.spend ? 4 : 0, (r.spend / max) * 100)}%` }} />}
              {level > 0 && r.spend > 0 && <span className="n2-amt">{eur(r.spend, 0)} €</span>}
            </span>
            <span className="n2-br">
              {(() => {
                // Nas escalas largas, o que se repete junta-se («Treino ×4») e o raro vem primeiro (é o que se lembra).
                const g = new Map<string, { i: (typeof r.items)[number]; n: number }>();
                for (const i of r.items) { const x = g.get(i.title); if (x) x.n++; else g.set(i.title, { i, n: 1 }); }
                const list = level <= 1 ? [...g.values()] : [...g.values()].sort((a, b) => a.n - b.n);
                const cap = level === 0 ? 4 : 2;
                return <>
                  {list.slice(0, cap).map(({ i, n }, k) => <span key={k} className={`n2-it t-${i.kind}`}>{level === 0 && i.time ? `${i.time} ` : ''}{i.title}{n > 1 ? ` ×${n}` : ''}</span>)}
                  {list.length > cap && <span className="n2-it more">e mais {list.length - cap}</span>}
                </>;
              })()}
              {r.ghosts.slice(0, 2).map((g, k) => <span key={`g${k}`} className="n2-it ghost">≈ {g.title}{g.amount ? ` · ${eur(g.amount, 0)} €` : ''}</span>)}
            </span>
          </div>
        ))}
      </div>
      <Orb dests={DESTS} />
    </div>
  );
}
