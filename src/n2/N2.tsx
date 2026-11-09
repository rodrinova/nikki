import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import './n2.css';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useAgendaItems } from '@/data/agenda';
import { addDays, monthKey, monthName, nextMonth, prevMonth, todayStr } from '@/lib/dates';
import { eur, monthlySeries, toU } from '@/lib/money';
import { driver, expected } from '@/lib/forecast';
import { buckets, LEVELS, type Ghost, type Level } from '@/lib/thread';
import { INVEST, catLabel, catNormals, useLedger, useMonth } from '@/screens/Money';
import { Face } from '@/brand/Face';
import { Odometer } from './Odometer';
import { Orb, type Dest } from './Orb';
import { MonthPoster } from './MonthPoster';
import { Now } from '@/screens/Home';

// NIKKI 2 (protótipo): «a revista da casa». Escuro, como hoje; um serifado de jornal (Newsreader) para títulos e
// números e a Albert Sans para o resto; a estrutura faz o trabalho das caixas (réguas, colunas, secções numeradas);
// cada número tem rótulo e comparação; os gráficos escrevem os valores em cima dos dados; o movimento só orienta.
// Só para quem administra a app e para a demonstração.

const NAV = [
  { to: '/n2', n: 'Hoje' }, { to: '/n2/dinheiro', n: 'Dinheiro' }, { to: '/n2/tempo', n: 'Tempo' }, { to: '/espacos', n: 'Casa' }, { to: '/nos', n: 'Nós' },
];
const DESTS: Dest[] = NAV;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Valores curtos para o gráfico (cabem numa coluna estreita): 878 · 1,3k. */
const k1 = (u: number) => { const e = u / 100_000; return e >= 1000 ? `${(e / 1000).toFixed(1).replace('.', ',').replace(',0', '')}k` : `${Math.round(e)}`; };

function useN2() {
  useEffect(() => { document.body.classList.add('n2'); return () => document.body.classList.remove('n2'); }, []);
}

/** O cabeçalho da revista: a cara, a edição (o dia do ano) e a data; por baixo, os destinos, sempre à vista. */
function Masthead() {
  const { me, partner } = useSession();
  const { pathname } = useLocation();
  const d = new Date();
  const ed = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return (
    <header className="mh">
      <div className="mh-top">
        <Link to="/" className="mh-face press" aria-label="Voltar à NIKKI de todos os dias"><Face h={18} mode="still" /></Link>
        <span className="mh-ed">Edição {ed} · {d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <Link to="/nos" className="mh-us press" aria-label="Nós">
          <i style={{ ['--c' as string]: me?.color }}>{me?.name?.[0]}</i>{partner && <i style={{ ['--c' as string]: partner.color }}>{partner.name?.[0]}</i>}
        </Link>
      </div>
      <nav className="mh-nav" aria-label="Secções">
        {NAV.map((x) => <Link key={x.to} to={x.to} className="press" aria-current={pathname === x.to ? 'page' : undefined}>{x.n}</Link>)}
      </nav>
    </header>
  );
}

/** Uma secção numerada, com a régua por cima. */
function Sec({ n, t, aside, children, className }: { n: string; t: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sec${className ? ` ${className}` : ''}`} aria-label={t}>
      <header className="sec-h"><span className="sec-n">{n}</span><span className="sec-t">{t}</span>{aside && <span className="sec-a">{aside}</span>}</header>
      {children}
    </section>
  );
}

/** Um número com rótulo e comparação: o essencial de uma linha de dados. */
function Fig({ label, value, unit, note, to, tone }: { label: string; value: string; unit?: string; note?: ReactNode; to?: string; tone?: 'up' | 'down' }) {
  const body = <>
    <span className="fig-l">{label}</span>
    <span className="fig-v">{value}{unit && <small>{unit}</small>}</span>
    {note && <span className={`fig-n${tone ? ` ${tone}` : ''}`}>{note}</span>}
  </>;
  return to ? <Link to={to} className="fig press">{body}</Link> : <div className="fig">{body}</div>;
}

/** O ritmo do mês em lâminas, com os valores escritos: o que já foi, o normal até hoje e a previsão. */
function Pace({ m }: { m: ReturnType<typeof useMonth> }) {
  const p = m.pace;
  if (p.fresh || p.blocks === undefined || !m.normal) return <p className="note">O ritmo aparece ao fim do primeiro mês completo.</p>;
  const normalToday = m.normal * p.share;
  return (
    <div className="pace">
      <div className="blades" role="img" aria-label={`Até ao dia ${p.day}: ${eur(m.everyday, 0)} € gastos; num mês normal, até hoje, ${eur(normalToday, 0)} €.`}>
        {Array.from({ length: p.days }, (_, j) => <i key={j} className={`${j < (p.blocks ?? 0) ? (j < p.day ? 'f' : 'a') : ''}${j === p.day - 1 ? ' now' : ''}`} style={{ ['--j' as string]: j }} />)}
      </div>
      <div className="pace-scale" aria-hidden="true"><span>dia 1</span><span className="pace-now" style={{ left: `${((p.day - 0.5) / p.days) * 100}%` }}>hoje, dia {p.day}</span><span>dia {p.days}</span></div>
      <dl className="pace-dl">
        <div><dt>Dia a dia, até hoje</dt><dd>{eur(m.everyday, 0)} €</dd></div>
        {m.events > 0 && <div><dt>À parte (eventos e compras grandes)</dt><dd>{eur(m.events, 0)} €</dd></div>}
        <div><dt>Num mês normal, até hoje</dt><dd>{eur(normalToday, 0)} €</dd></div>
        <div><dt>Previsão para o mês</dt><dd>{eur(p.forecast, 0)} €</dd></div>
      </dl>
      <p className="note">Cada lâmina é um dia de um mês normal. Brancas: já passaram. Laranja: dias que ainda não chegaram, mas já estão gastos.</p>
    </div>
  );
}

export function N2Home() {
  useN2();
  const { me, partner } = useSession();
  const { spendRows } = useHouse();
  const m = useMonth();
  const L = useLedger();
  const today = todayStr(), tmw = addDays(today, 1);
  const items = useAgendaItems(today, tmw);
  const hhmm = (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();
  const todayIts = items.filter((i) => i.day === today && i.kind !== 'due').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const nx = todayIts.find((i) => !i.time || (i.endTime ?? i.time) > hhmm) ?? null;
  const tmIts = items.filter((i) => i.day === tmw && i.kind !== 'due').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const pct = m.pace.fresh ? null : m.pace.pct;
  const why = useMemo(() => {
    if (m.pace.fresh || m.pace.pct < 10 || !me) return null;
    const c = driver(m.dailyByCat, catNormals(spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), me.id, today), m.pace.share);
    return c ? catLabel(c) : null;
  }, [m, spendRows, me, today]);
  const mood = pct === null ? 'Mês a começar.' : pct <= -10 ? 'Mês tranquilo.' : pct < 10 ? 'Mês no ritmo.' : pct < 25 ? 'Mês a puxar.' : 'Mês quente.';
  const next = nx ? `${nx.title}${nx.time ? ` às ${nx.time}` : ''}.` : tmIts[0] ? `Amanhã, ${tmIts[0].title.toLowerCase()}${tmIts[0].time ? ` às ${tmIts[0].time}` : ''}.` : 'Dia livre.';
  const prev = prevMonth(monthKey(today));
  const daily = useMemo(() => spendRows.filter((e) => e.category !== INVEST && !e.occasion_id), [spendRows]);
  const [poster, setPoster] = useState(false);
  const left = todayIts.filter((i) => !i.time || (i.endTime ?? i.time) > hhmm).length;
  return (
    <div className="n2-page">
      <Masthead />
      <h1 className="lead">{mood} <span>{next}</span></h1>

      <div className="figs">
        <Fig label={`${cap(monthName(m.key))}${partner ? ', a tua parte' : ''}`} value={eur(m.total, 0)} unit="€" to="/n2/dinheiro"
          note={pct === null ? 'primeiro mês' : `${pct === 0 ? 'no ritmo habitual' : `${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'} do habitual`}${why ? `, sobretudo ${why.toLowerCase()}` : ''}`} tone={pct !== null && pct >= 10 ? 'up' : pct !== null && pct <= -10 ? 'down' : undefined} />
        {partner && L && <Fig label="Entre nós" value={L.even ? '0' : eur(Math.abs(L.v), 0)} unit="€" to="/dinheiro?ver=entre-nos" note={L.even ? 'em equilíbrio' : L.lead.toLowerCase()} />}
        <Fig label="Hoje na agenda" value={String(todayIts.length)} note={todayIts.length ? (left ? `${left} ainda por acontecer` : 'já tudo feito') : 'nada marcado'} to="/n2/tempo" />
      </div>

      <div className="cols">
        <Sec n="01" t="Ritmo do mês" aside={<Link to="/n2/dinheiro" className="more press">Dinheiro</Link>}><Pace m={m} /></Sec>
        <Sec n="02" t="A seguir" aside={<Link to="/n2/tempo" className="more press">Tempo</Link>}>
          <ol className="tt">
            {[...todayIts.map((i) => ({ i, d: 'Hoje' })), ...tmIts.map((i) => ({ i, d: 'Amanhã' }))].slice(0, 6).map(({ i, d }, k) => (
              <li key={k} className={i.day === today && i.time && (i.endTime ?? i.time) <= hhmm ? 'past' : ''}>
                <span className="tt-t num">{i.time ?? '—'}</span>
                <span className="tt-w">{i.title}<small>{d}{i.note ? ` · ${i.note}` : ''}</small></span>
              </li>
            ))}
            {!todayIts.length && !tmIts.length && <li><span className="tt-t">—</span><span className="tt-w">Hoje e amanhã sem nada marcado.</span></li>}
          </ol>
        </Sec>
      </div>

      <Sec n="03" t="A NIKKI lembra" className="plain"><Now /></Sec>

      <Sec n="04" t={`A capa de ${monthName(prev)}`}>
        <button type="button" className="cover press" onClick={() => setPoster(true)}>
          <MonthPoster small expenses={daily} who={me?.id ?? ''} monthKey={prev} me={me?.color} other={partner?.color} />
          <span className="cover-c"><span>Cada dia é uma lâmina, tão comprida quanto se gastou, às cores das categorias.</span><span className="more">Ver a capa</span></span>
        </button>
      </Sec>
      {poster && (
        <div className="over" role="dialog" aria-modal="true" aria-label={`A capa de ${monthName(prev)}`} onClick={(e) => { if (e.target === e.currentTarget) setPoster(false); }}>
          <MonthPoster expenses={daily} who={me?.id ?? ''} monthKey={prev} me={me?.color} other={partner?.color} />
          <button type="button" className="more press" onClick={() => setPoster(false)}>Fechar</button>
        </div>
      )}
      <Orb dests={DESTS} tense={pct !== null && pct >= 15} />
    </div>
  );
}

/** Dinheiro, como numa página de economia: o número do mês, onde se gastou (tabela), 12 meses (com valores) e os movimentos. */
export function N2Money() {
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
  const smax = Math.max(1, m.normal ?? 0, ...series.map((x) => x.total), fcast);
  const moves = expenses.rows.filter((e) => monthKey(e.spent_on) === key).sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));
  const pct = m.current ? (m.pace.fresh ? null : m.pace.pct) : m.normal ? Math.round((m.everyday / m.normal - 1) * 100) : null;
  const [n, setN] = useState(8);
  const name = (id: string | null) => (id === me?.id ? 'tu' : id === partner?.id ? partner?.name ?? '' : '');
  const s = m.current ? 1 : 0;
  return (
    <div className="n2-page">
      <Masthead />
      <div className="mnav">
        <button type="button" className="press" aria-label="Mês anterior" onClick={() => setKey(prevMonth(key))}>‹</button>
        <span>{cap(monthName(key))}{key.slice(0, 4) !== cur.slice(0, 4) ? ` ${key.slice(0, 4)}` : ''}</span>
        <button type="button" className="press" aria-label="Mês seguinte" disabled={key >= cur} onClick={() => setKey(nextMonth(key))}>›</button>
      </div>
      <div className="hero">
        <span className="fig-l">{partner ? 'A tua parte' : 'Total'} em {monthName(key)}</span>
        <span className="hero-v"><Odometer value={eur(m.total, 0)} /><small>€</small></span>
        <span className={`fig-n${pct !== null && pct >= 10 ? ' up' : pct !== null && pct <= -10 ? ' down' : ''}`}>
          {pct === null ? 'O primeiro mês: daqui para a frente compara-se.' : `${pct === 0 ? 'No ritmo habitual' : `${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'} do habitual`}${m.current && !m.pace.fresh ? `, até dia ${m.pace.day}` : ''}.`}
        </span>
        <span className="fig-n">O teu normal: {m.normal ? `${eur(m.normal, 0)} €` : '—'} por mês.{m.events > 0 ? ` Mais ${eur(m.events, 0)} € em eventos, à parte.` : ''}</span>
      </div>

      {m.current && <Sec n="01" t="Ritmo"><Pace m={m} /></Sec>}

      <Sec n={`0${1 + s}`} t="Onde" aside={<span className="sec-k">face ao teu normal</span>}>
        {cats.length ? (
          <table className="tbl">
            <thead><tr><th>Categoria</th><th aria-label="Barra" /><th className="r">{m.current ? 'Até hoje' : 'No mês'}</th><th className="r">{m.current ? 'do normal' : 'Δ'}</th></tr></thead>
            <tbody>{cats.map(([c, v]) => {
              const nn = catN[c] ?? 0, d = nn > 0 && !m.current ? Math.round((v / nn - 1) * 100) : null;
              return (
                <tr key={c}>
                  <td>{catLabel(c)}</td>
                  <td className="bar"><i style={{ width: `${(v / cmax) * 100}%` }} />{nn > 0 && <b style={{ left: `${(nn / cmax) * 100}%` }} title={`Normal: ${eur(nn, 0)} €`} />}</td>
                  <td className="r num">{eur(v, 0)} €</td>
                  <td className={`r num${d !== null && d >= 5 ? ' up' : d !== null && d <= -5 ? ' down' : ''}`}>{d === null ? (nn ? `${Math.round((v / nn) * 100)}%` : '—') : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}%`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <p className="note">Nada em {monthName(key)}.</p>}
        <p className="note">O traço vertical em cada barra é o normal da categoria.</p>
      </Sec>

      <Sec n={`0${2 + s}`} t="Doze meses" aside={m.normal ? <span className="sec-k">normal {eur(m.normal, 0)} €</span> : undefined}>
        <div className="c12s" role="img" aria-label={`Doze meses: ${series.map((x) => `${monthName(x.key)} ${eur(x.total, 0)} €`).join(', ')}.`}>
          {m.normal && <span className="c12-norm" style={{ bottom: `calc(22px + (100% - 44px) * ${m.normal / smax})` }}><em>normal</em></span>}
          {series.map((x) => {
            const fc = x.current && fcast > x.total ? fcast : 0;
            return (
              <button key={x.key} type="button" className={`c12${x.key === key ? ' sel' : ''}${x.current ? ' cur' : ''}`} onClick={() => setKey(x.key)} aria-label={`${monthName(x.key)}: ${eur(x.total, 0)} €`}>
                <span className="c12-v num">{x.total ? k1(x.total) : ''}</span>
                <span className="c12-b">
                  {fc > 0 && <i className="fc" style={{ height: `${(fc / smax) * 100}%` }} />}
                  <i style={{ height: `${(x.total / smax) * 100}%` }} />
                </span>
                <span className="c12-m">{monthName(x.key).slice(0, 3)}</span>
              </button>
            );
          })}
        </div>
        {fcast > 0 && <p className="note">No mês a decorrer, o tracejado é a previsão: {eur(fcast, 0)} €.</p>}
      </Sec>

      <Sec n={`0${3 + s}`} t={`Movimentos de ${monthName(key)}`} aside={<span className="sec-k">{moves.length}</span>}>
        <table className="tbl mv">
          <tbody>{moves.slice(0, n).map((e) => (
            <tr key={e.id}>
              <td className="num d">{Number(e.spent_on.slice(8, 10))}</td>
              <td>{e.note || catLabel(e.category)}<small>{e.split === 'shared' ? (e.paid_by === me?.id ? 'Partilhada' : `Pagou ${name(e.paid_by)}`) : e.split === 'mine' ? (e.paid_by === me?.id ? 'Minha' : name(e.paid_by)) : `De ${name(e.other_id)}`}</small></td>
              <td className="r num">{eur(toU(e.amount))} €</td>
            </tr>
          ))}</tbody>
        </table>
        {moves.length > n && <button type="button" className="more press" onClick={() => setN(n + 20)}>Mais {Math.min(20, moves.length - n)} de {moves.length - n}</button>}
      </Sec>
      <Orb dests={DESTS} tense={pct !== null && pct >= 15} />
    </div>
  );
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
    <div className="n2-page"
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
              {level === 3 && !r.future && r.spend > 0
                ? <MonthPoster small expenses={daily} who={me?.id ?? ''} monthKey={r.key} />
                : level > 0 && r.spend > 0 && <i className="tb-bar" style={{ width: `${Math.max(4, (r.spend / max) * 100)}%` }} />}
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
      <Orb dests={DESTS} />
    </div>
  );
}
