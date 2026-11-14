import type React from 'react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { flushSync } from 'react-dom';
import './n2.css';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useAgendaItems } from '@/data/agenda';
import { addDays, daysInMonth, monthKey, monthName, nextMonth, prevMonth, todayStr } from '@/lib/dates';
import { eur, monthlySeries, partOf, toU } from '@/lib/money';
import { driver, expected } from '@/lib/forecast';
import { compose, stories } from '@/lib/front';
import { useShopPresence } from '@/data/presence';
import { store } from '@/lib/store';
import { seenKey } from '@/screens/Housekeeping';
import { buckets, LEVELS, type Ghost, type Level } from '@/lib/thread';
import { ExpenseDetail, INVEST, catLabel, catNormals, useLedger, useMonth } from '@/screens/Money';
import { useOverlays } from '@/ui/overlays';
import { Face } from '@/brand/Face';
import { Odometer } from './Odometer';
import { Now, useSpaceVals } from '@/screens/Home';
import { MODULES } from '@/lib/modules';
import { Icon } from '@/ui/Icon';
import { GuideOnce } from '@/ui/Tour';
import { isV3, useN2 } from './shell';
import { DayArc, DotCols, Dots, Gauge, MonthDial, Ruler } from './Viz';

// NIKKI 2 (protótipo): «a revista da casa». Escuro, como hoje; um serifado de jornal (Newsreader) para títulos e
// números e a Albert Sans para o resto; a estrutura faz o trabalho das caixas (réguas, colunas, secções numeradas);
// cada número tem rótulo e comparação; os gráficos escrevem os valores em cima dos dados; o movimento só orienta.
// Só para quem administra a app e para a demonstração.

/** O «€» nunca fica sozinho na linha seguinte. */
const nb = (t: string) => t.replace(/ €/g, '\u00a0€').replace(/(\d) (\d)/g, '$1\u00a0$2');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Valores curtos para o gráfico (cabem numa coluna estreita): 878 · 1,3k. */
const k1 = (u: number): string => { if (u < 0) return `−${k1(-u)}`; const e = u / 100_000; return e >= 1000 ? `${(e / 1000).toFixed(1).replace('.', ',').replace(',0', '')}k` : `${Math.round(e)}`; };

/** A luz segue o dedo: cada cartão de vidro acende onde lhe tocam. */
const glow = (e: { target: EventTarget; clientX: number; clientY: number }) => {
  const c = (e.target as HTMLElement).closest?.('.cd,.dayc') as HTMLElement | null; if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
  if (c.classList.contains('cd')) c.style.setProperty('--ty', `${(((e.clientX - r.left) / r.width - 0.5) * 9).toFixed(2)}deg`); if (c.classList.contains('cd')) c.style.setProperty('--tx', `${((0.5 - (e.clientY - r.top) / r.height) * 9).toFixed(2)}deg`);
};

/** O cartão abre-se e vira ecrã: o cartão tocado e o ecrã de destino partilham o mesmo nome de transição. */
function openFrom(e: React.MouseEvent<HTMLElement>, to: string, nav: (to: string) => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const card = e.currentTarget, root = document.documentElement;
  card.style.setProperty('view-transition-name', 'front');
  try {
    d.startViewTransition(() => { card.style.removeProperty('view-transition-name'); root.classList.add('vt', 'vt-open'); flushSync(() => nav(to)); })
      .finished.finally(() => root.classList.remove('vt', 'vt-open'));
  } catch { card.style.removeProperty('view-transition-name'); root.classList.remove('vt', 'vt-open'); nav(to); }
}


/** O cabeçalho da revista: a cara, a edição (o dia do ano) e a data; por baixo, os destinos, sempre à vista. */
export function Masthead({ pill }: { pill?: boolean } = {}) {
  const v3 = isV3();
  const { me, partner } = useSession();
  const d = new Date();
  return (
    <header className={`mh${pill ? ' mh-p' : ''}`}>
      <div className="mh-top">
        <Link to="/historia" className="mh-face press" aria-label="NIKKI: a história"><Face h={18} mode="still" /></Link>
        <span className="mh-ed">{cap(d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
        {v3 && <Link to="/v3/procurar" className="mh-find press" aria-label="Procurar em tudo"><Icon n="ask" s={18} /></Link>}
        <Link to="/nos" className="mh-us press" aria-label={v3 ? 'Conta' : 'Nós'}>
          <i style={{ ['--c' as string]: me?.color }}>{me?.name?.[0]}</i>{partner && <i style={{ ['--c' as string]: partner.color }}>{partner.name?.[0]}</i>}
        </Link>
      </div>
    </header>
  );
}

/** Uma secção numerada, com a régua por cima. */
function Sec({ n, t, aside, children, className }: { n: string; t: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sec${className ? ` ${className}` : ''}`} aria-label={t}>
      <header className="sec-h">{n && <span className="sec-n">{n}</span>}<span className="sec-t">{t}</span>{aside && <span className="sec-a">{aside}</span>}</header>
      {children}
    </section>
  );
}

/**
 * As frentes da casa, lado a lado e com o mesmo peso: o dinheiro é uma delas. Cada linha tem o seu sinal (um número
 * e a legenda). No Hoje (short) só aparecem as que pedem atenção; na Casa, todas.
 */
function useFrontRows(money: { total: number; pct: number | null }) {
  const { val, on } = useSpaceVals();
  const hot: Record<string, boolean> = {
    compras: Number(val.compras[0]) > 0, casa: val.casa[1] === 'por confirmar' || /aviso/.test(val.casa[1] ?? ''), housekeeping: val.housekeeping[0] === 'hoje',
    eventos: /^\d+$/.test(val.eventos[0]) && Number(val.eventos[0]) <= 14 && !/depois/.test(val.eventos[1] ?? ''),
  };
  const rows = [
    { k: 'dinheiro', to: isV3() ? '/v3/dinheiro' : '/n2/dinheiro', ic: 'coins', n: 'Dinheiro', v: `${eur(money.total, 0)} €`, u: money.pct === null ? '' : money.pct >= 10 ? `+${Math.round(money.pct)}%` : money.pct <= -10 ? `−${Math.round(-money.pct)}%` : 'normal', hot: money.pct !== null && money.pct >= 10 },
    ...MODULES.filter((x) => x.k !== 'contas' && x.k !== 'agenda' && on(x.k)).map((x) => ({ k: x.k as string, to: x.to, ic: x.ic, n: x.k === 'housekeeping' ? 'Ajuda em casa' : x.name, v: val[x.k]?.[0] ?? '—', u: val[x.k]?.[1] ?? '', hot: !!hot[x.k] })),
  ];
  return rows;
}

function Fronts({ money, short }: { money: { total: number; pct: number | null }; short?: boolean }) {
  const rows = useFrontRows(money);
  const nav = useNavigate();
  const list = short ? rows.filter((r) => r.hot || r.k === 'dinheiro').slice(0, 2) : rows;
  const viz = (r: (typeof rows)[number]) => {
    const n = Number(r.v);
    if (r.k === 'dinheiro') return <Ruler pct={money.pct} />;
    if (r.k === 'patrimonio' && Number.isFinite(n)) return <Gauge v={n} />;
    if ((r.k === 'compras' || r.k === 'casa' || r.k === 'objetivos') && Number.isFinite(n)) return <Dots n={n} hot={r.hot ? Math.min(n, 24) : 0} />;
    return <span className="cd-ic"><Icon n={r.ic as never} s={30} w={1.1} /></span>;
  };
  return (
    <div className="cards">
      {list.map((r, k) => (
        <Link key={r.k} to={r.to} onClick={(e) => openFrom(e, r.to, nav)} className={`cd press${r.hot ? ' hot' : ''}`} style={{ ['--i' as string]: k }} aria-label={`${r.n}: ${r.v} ${r.u}`}>
          <span className="cd-h"><span>{r.n}</span><Icon n="arrow" s={14} /></span>
          <span className="cd-g">{viz(r)}</span>
          <span className="cd-v"><Odometer value={r.v} />{r.u && <small>{r.u}</small>}</span>
        </Link>
      ))}
    </div>
  );
}

/** Casa: a porta para todas as frentes. */
export function N2Casa() {
  useN2();
  const m = useMonth();
  const money = { total: m.total, pct: m.pace.fresh ? null : m.pace.pct };
  return (
    <div className="n2-page n2v" onPointerMove={glow}>
      <Masthead pill />
      <Fronts money={money} />
    </div>
  );
}

export function N2Home() {
  useN2();
  const { me, partner, house } = useSession();
  const { spendRows, deadlines, hk, hkMessages, shop, on } = useHouse();
  const m = useMonth();
  const L = useLedger();
  const today = todayStr();
  const items = useAgendaItems(today, addDays(today, 7));
  const hhmm = (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();
  const todayIts = items.filter((i) => i.day === today && i.kind !== 'due').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const pct = m.pace.fresh ? null : m.pace.pct;
  const daily = useMemo(() => spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), [spendRows]);
  const why = useMemo(() => {
    if (m.pace.fresh || m.pace.pct < 10 || !me) return null;
    const c = driver(m.dailyByCat, catNormals(daily, me.id, today), m.pace.share);
    return c ? catLabel(c) : null;
  }, [m, daily, me, today]);
  const { here } = useShopPresence(on('compras') ? house?.id : undefined, me?.id, true);
  const hkCard = on('housekeeping') ? hk.rows.find((r) => !r.archived) : undefined;
  const seen = store.get(seenKey(house?.id, me?.id)) ?? '';
  const hkNew = hkCard ? hkMessages.rows.filter((x) => x.author_id === hkCard.profile_id && x.created_at > seen).length : 0;
  const front = useMemo(() => compose(stories({
    today, hhmm,
    month: { pct, why, total: m.total, normal: m.normal, name: monthName(m.key) },
    deadlines: deadlines.rows.filter((d) => !d.paid_at && (on('casa') || (d.car_id && on('garagem')))).map((d) => ({ title: d.title, due_on: d.due_on, amount: d.amount ? Number(d.amount) * 100_000 : null })),
    events: items.map((i) => ({ title: i.title, day: i.day, time: i.time, endTime: i.endTime, kind: i.kind })),
    birthdays: items.filter((i) => i.kind === 'birthday').map((i) => ({ title: i.title, day: i.day })),
    missing: me ? expected(daily, me.id, today).map((x) => ({ note: x.note, day: x.day, amount: x.amount, kind: x.kind })) : [],
    live: partner && here[partner.id] ? { name: partner.name, left: shop.rows.filter((i) => !i.done).length } : null,
    messages: hkCard && hkNew ? { from: hkCard.name, n: hkNew } : null,
    balance: L ? { lead: L.lead, v: L.v, even: L.even } : null,
  })), [today, hhmm, pct, why, m.total, m.normal, m.key, deadlines.rows, on, items, me, daily, partner, here, shop.rows, hkCard, hkNew, L]);
  const { lead, calm } = front; // os números e as breves saíram do Hoje: já estão em «O teu dia» e em «A fazer»
  const nowH = Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3)) / 60;
  const hOf = (t: string) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
  const next = todayIts.find((i) => i.time && i.time > hhmm) ?? null;
  const [scrub, setScrub] = useState<number | null>(null);
  const hNow = scrub ?? nowH;
  const hm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 / 5) * 5).padStart(2, '0')}`;
  // a percorrer: o que está a decorrer nessa hora, ou o que vem a seguir a ela
  const shown = scrub === null ? next : todayIts.find((i) => i.time && hOf(i.time) <= scrub && hOf(i.endTime ?? i.time) + (i.endTime ? 0 : 1) > scrub) ?? null;
  return (
    <div className="n2-page n2v" onPointerMove={glow}>
      <Masthead pill />
      <section className={`dayc${calm ? '' : ' live'}${scrub !== null ? ' scrub' : ''}${hNow < 7 || hNow >= 20.5 ? ' night' : ''}`} style={{ ['--sx' as string]: `${50 - Math.cos((Math.PI * hNow) / 24) * 40}%`, ['--sy' as string]: Math.sin((Math.PI * hNow) / 24).toFixed(3) }}
        aria-label={shown ? `${scrub !== null ? 'Às' : 'A seguir, às'} ${shown.time}: ${shown.title}` : 'Sem nada marcado'}>
        <Link to="/n2/tempo" className="dayc-go press" aria-label="Abrir a agenda"><Icon n="arrow" s={16} /></Link>
        <span className="cd-h"><span>{scrub !== null ? 'Nessa hora' : next ? 'A seguir' : 'Hoje'}</span></span>
        <span className="dayc-v">{scrub !== null ? <span>{hm(scrub)}</span> : <Odometer value={next?.time ?? hhmm} />}<small>{shown ? shown.title : 'livre'}</small></span>
        <DayArc now={hNow} marks={todayIts.filter((i) => i.time).map((i) => hOf(i.time!))} onScrub={setScrub} />
        <span className="dayc-l">{scrub !== null ? 'Larga para voltar a agora' : nb(lead.head)}</span>
      </section>
      <Fronts money={{ total: m.total, pct }} short />
      <Sec n="" t="A fazer" className="plain lite"><Now /></Sec>
    </div>
  );
}

/** Dinheiro, como numa página de economia: o número do mês, onde se gastou (tabela), 12 meses (com valores) e os movimentos. */
export function N2Money({ bare }: { bare?: boolean } = {}) {
  useN2();
  const { me, partner } = useSession();
  const { spendRows, expenses } = useHouse();
  const [sp, setSp] = useSearchParams();
  const cur = monthKey(todayStr());
  const q = sp.get('mes');
  const key = q && /^\d{4}-\d{2}$/.test(q) && q <= cur ? q : cur;
  const setKey = (k: string) => setSp(k === cur ? {} : { mes: k }, { replace: true });
  const m = useMonth(key);
  const daily = useMemo(() => spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), [spendRows]);
  const catN = useMemo(() => (me ? catNormals(daily, me.id, todayStr()) : {}), [daily, me]);
  const series = useMemo(() => monthlySeries(daily, me?.id ?? '', todayStr(), 12).months, [daily, me?.id]);
  const cats = m.dailyByCat.filter(([, v]) => v > 0).slice(0, 7);
  const cmax = Math.max(1, ...cats.map(([c, v]) => Math.max(v, catN[c] ?? 0)));
  const fcast = m.current && !m.pace.fresh ? m.pace.forecast : 0;
  const moves = expenses.rows.filter((e) => monthKey(e.spent_on) === key).sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));
  const pct = m.current ? (m.pace.fresh ? null : m.pace.pct) : m.normal ? Math.round((m.everyday / m.normal - 1) * 100) : null;
  const perDay = useMemo(() => {
    const d = Array.from({ length: daysInMonth(key) }, () => 0);
    if (me) for (const e of daily) if (monthKey(e.spent_on) === key) d[Number(e.spent_on.slice(8, 10)) - 1] += partOf(e, me.id);
    return d;
  }, [daily, key, me]);
  const [n, setN] = useState(8);
  const [pick, setPick] = useState<number | null>(null);
  const name = (id: string | null) => (id === me?.id ? 'tu' : id === partner?.id ? partner?.name ?? '' : '');
  const { open } = useOverlays();
  const body = (
    <>
      <div className="mnav">
        <button type="button" className="press" aria-label="Mês anterior" onClick={() => setKey(prevMonth(key))}>‹</button>
        <span>{cap(monthName(key))}{key.slice(0, 4) !== cur.slice(0, 4) ? ` ${key.slice(0, 4)}` : ''}</span>
        <button type="button" className="press" aria-label="Mês seguinte" disabled={key >= cur} onClick={() => setKey(nextMonth(key))}>›</button>
      </div>
      <section className="dayc mcard" aria-label={`${monthName(key)}: ${eur(m.total, 0)} €`}>
        <MonthDial days={perDay} today={m.current ? Number(todayStr().slice(8, 10)) : null} pick={pick} onPick={setPick}>
          {pick ? <><small className="day">dia {pick}</small><span className="dayc-v"><span>{eur(perDay[pick - 1] ?? 0, 0)}</span><small>€</small></span></> : <span className="dayc-v"><Odometer value={eur(m.total, 0)} /><small>€</small></span>}
          {!pick && pct !== null && <span className={`chip-d${pct >= 10 ? ' up' : pct <= -10 ? ' down' : ''}`}>{pct > 0 ? '+' : pct < 0 ? '−' : ''}{Math.abs(pct)}%</span>}
        </MonthDial>
        <div className="tri">
          <span><small>Dia a dia</small><b>{eur(m.everyday, 0)} €</b></span>
          <span><small>À parte</small><b>{eur(m.events, 0)} €</b></span>
          <span><small>{fcast ? 'Previsão' : 'Normal'}</small><b>{fcast ? eur(fcast, 0) : m.normal ? eur(m.normal, 0) : '—'} €</b></span>
        </div>
      </section>

      <section className="cd wide" aria-label="Onde">
        <span className="cd-h"><span>Onde</span></span>
        {cats.length ? cats.slice(0, 6).map(([c, v], k) => {
          const nn = catN[c] ?? 0, over = nn > 0 && v > nn * 1.1;
          return (
            <div key={c} className={`cap${over ? ' hot' : ''}`} style={{ ['--w' as string]: `${Math.max(4, (v / cmax) * 100)}%`, ['--k' as string]: k }}>
              <i />{nn > 0 && <b style={{ left: `${(nn / cmax) * 100}%` }} />}
              <span>{catLabel(c)}</span><em>{eur(v, 0)} €</em>
            </div>
          );
        }) : <p className="note">—</p>}
      </section>

      <section className="cd wide" aria-label="Doze meses">
        <span className="cd-h"><span>12 meses</span>{m.normal ? <span>normal {eur(m.normal, 0)} €</span> : null}</span>
        <DotCols normal={m.normal} onPick={setKey} cols={series.map((x) => ({ key: x.key, label: monthName(x.key).slice(0, 1).toUpperCase(), v: x.total, ghost: x.current && fcast > x.total ? fcast : 0, cur: x.current, sel: x.key === key }))} />
      </section>

      <GuideOnce k="dinheiro" />
      <Link to="/dinheiro" className="more press" style={{ alignSelf: 'center' }}>Todas as despesas, acertos e categorias</Link>
      <Sec n="" t={`Movimentos`} aside={<span className="sec-k">{moves.length}</span>}>
        <table className="tbl mv">
          <tbody>{moves.slice(0, n).map((e) => (
            <tr key={e.id} className="press" style={{ cursor: 'pointer' }} onClick={() => open(<ExpenseDetail e={e} label={e.note || catLabel(e.category)} />)}>
              <td className="num d">{Number(e.spent_on.slice(8, 10))}</td>
              <td>{e.note || catLabel(e.category)}<small>{e.split === 'shared' ? (e.paid_by === me?.id ? 'Partilhada' : `Pagou ${name(e.paid_by)}`) : e.split === 'mine' ? (e.paid_by === me?.id ? 'Minha' : name(e.paid_by)) : `De ${name(e.other_id)}`}</small></td>
              <td className="r num">{eur(toU(e.amount))} €</td>
            </tr>
          ))}</tbody>
        </table>
        {moves.length > n && <button type="button" className="more press" onClick={() => setN(n + 20)}>Mais {Math.min(20, moves.length - n)} de {moves.length - n}</button>}
      </Sec>
    </>
  );
  return bare ? body : <div className="n2-page n2v"><Masthead />{body}</div>;
}


/**
 * O fio do tempo: o mesmo tempo a quatro escalas. Afastar dois dedos (ou Ctrl + roda, ou as teclas − e +) muda de
 * escala, a partir do ponto onde estão os dedos. O «agora» é uma régua laranja; o futuro tem os fantasmas.
 */
export function N2Time() {
  useN2();
  const { me } = useSession();
  const { spendRows, deadlines } = useHouse();
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
  const pinch = useRef<{ d: number; done: boolean } | null>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { nowRef.current?.scrollIntoView({ block: 'center' }); }, [level]);
  useEffect(() => {
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); if (Math.abs(e.deltaY) > 4) zoom((level + (e.deltaY > 0 ? 1 : -1)) as Level, { x: e.clientX, y: e.clientY }); };
    const key = (e: KeyboardEvent) => { if (e.key === '-') zoom((level + 1) as Level); if (e.key === '+' || e.key === '=') zoom((level - 1) as Level); };
    addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', key);
    return () => { removeEventListener('wheel', wheel); removeEventListener('keydown', key); };
  });
  return (
    <div className="n2-page n2v"
      onTouchStart={(e) => { if (e.touches.length === 2) { const [a, b] = [e.touches[0], e.touches[1]]; pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), done: false }; } }}
      onTouchMove={(e) => {
        const p = pinch.current; if (!p || p.done || e.touches.length !== 2) return;
        const [a, b] = [e.touches[0], e.touches[1]], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), at = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        if (d / p.d > 1.3) { p.done = true; zoom((level - 1) as Level, at); } else if (d / p.d < 0.75) { p.done = true; zoom((level + 1) as Level, at); }
      }}
      onTouchEnd={() => { pinch.current = null; }}>
      <Masthead />
      <div className="levels" role="tablist" aria-label="Escala">
        {LEVELS.map((x, k) => <button key={x} type="button" role="tab" aria-selected={k === level} className="press" onClick={() => zoom(k as Level)}>{x}</button>)}
      </div>
      <p className="note">Afasta ou junta dois dedos para mudar de escala.</p>
      <div className={`thread z-${dir}`} key={level} style={{ transformOrigin: focus }}>
        {rows.map((r) => (
          <div key={r.key} ref={r.now ? nowRef : undefined} className={`tb-row${r.now ? ' now' : ''}${r.future ? ' fut' : ''}`}>
            <span className="tb-l"><span>{r.label}</span>{r.sub && <small>{r.sub}</small>}</span>
            <span className="tb-m">
              {level > 0 && r.spend > 0 && <i className="tb-bar" style={{ width: `${Math.max(4, (r.spend / max) * 100)}%` }} />}
              {level > 0 && r.spend > 0 && <span className="num">{eur(r.spend, 0)} €</span>}
            </span>
            <span className="tb-r">
              {(() => {
                // Nas escalas largas, o que se repete junta-se («Treino ×4») e o raro vem primeiro (é o que se lembra).
                const g = new Map<string, { i: (typeof r.items)[number]; n: number }>();
                for (const i of r.items) { const x = g.get(i.title); if (x) x.n++; else g.set(i.title, { i, n: 1 }); }
                const list = level <= 1 ? [...g.values()] : [...g.values()].sort((a, b) => a.n - b.n);
                const capN = level === 0 ? 4 : 2;
                return <>
                  {list.slice(0, capN).map(({ i, n }, k) => <span key={k} className={`it t-${i.kind}`}>{level === 0 && i.time ? <b className="num">{i.time} </b> : null}{i.title}{n > 1 ? ` ×${n}` : ''}</span>)}
                  {list.length > capN && <span className="it more">e mais {list.length - capN}</span>}
                </>;
              })()}
              {r.ghosts.slice(0, 2).map((g, k) => <span key={`g${k}`} className="it ghost">≈ {g.title}{g.amount ? ` · ${eur(g.amount, 0)} €` : ''}</span>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
