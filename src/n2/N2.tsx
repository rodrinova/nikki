import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import './n2.css';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useAgendaItems } from '@/data/agenda';
import { addDays, monthKey, monthName, nextMonth, prevMonth, todayStr } from '@/lib/dates';
import { eur, monthlySeries, toU } from '@/lib/money';
import { driver, expected } from '@/lib/forecast';
import { compose, stories } from '@/lib/front';
import { glance } from '@/lib/glance';
import { explainCats, explainPace, explainYear } from '@/lib/explain';
import { useShopPresence } from '@/data/presence';
import { store } from '@/lib/store';
import { seenKey } from '@/screens/Housekeeping';
import { buckets, LEVELS, type Ghost, type Level } from '@/lib/thread';
import { INVEST, catLabel, catNormals, useLedger, useMonth } from '@/screens/Money';
import { Face } from '@/brand/Face';
import { Odometer } from './Odometer';
import { Orb, type Dest } from './Orb';
import { Now, useSpaceVals } from '@/screens/Home';
import { MODULES } from '@/lib/modules';
import { Icon } from '@/ui/Icon';
import { Aurora, DayArc, Dots, Gauge, Ruler } from './Viz';

// NIKKI 2 (protótipo): «a revista da casa». Escuro, como hoje; um serifado de jornal (Newsreader) para títulos e
// números e a Albert Sans para o resto; a estrutura faz o trabalho das caixas (réguas, colunas, secções numeradas);
// cada número tem rótulo e comparação; os gráficos escrevem os valores em cima dos dados; o movimento só orienta.
// Só para quem administra a app e para a demonstração.

const NAV = [
  { to: '/n2', n: 'Hoje' }, { to: '/n2/tempo', n: 'Agenda' }, { to: '/n2/casa', n: 'Casa' },
];
const DESTS: Dest[] = NAV;
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
};

function useN2() {
  useEffect(() => { document.body.classList.add('n2'); try { sessionStorage.setItem('nikki:n2', '1'); } catch { /* sem armazenamento */ } return () => document.body.classList.remove('n2'); }, []);
}

/** O cabeçalho da revista: a cara, a edição (o dia do ano) e a data; por baixo, os destinos, sempre à vista. */
function Masthead({ pill }: { pill?: boolean } = {}) {
  const { me, partner } = useSession();
  const { pathname } = useLocation();
  const d = new Date();
  return (
    <header className={`mh${pill ? ' mh-p' : ''}`}>
      <div className="mh-top">
        <Link to="/" className="mh-face press" aria-label="Voltar à NIKKI de todos os dias"><Face h={18} mode="still" /></Link>
        <span className="mh-ed">{cap(d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
        <Link to="/nos" className="mh-us press" aria-label="Nós">
          <i style={{ ['--c' as string]: me?.color }}>{me?.name?.[0]}</i>{partner && <i style={{ ['--c' as string]: partner.color }}>{partner.name?.[0]}</i>}
        </Link>
      </div>
      <nav className="mh-nav" aria-label="Secções">
        {NAV.map((x) => <Link key={x.to} to={x.to} className="press" aria-current={pathname === x.to || (x.to === '/n2/casa' && pathname === '/n2/dinheiro') ? 'page' : undefined}>{x.n}</Link>)}
      </nav>
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

/** O ritmo do mês em lâminas, com os valores escritos: o que já foi, o normal até hoje e a previsão. */
function Pace({ m }: { m: ReturnType<typeof useMonth> }) {
  const p = m.pace;
  if (p.fresh || p.blocks === undefined || !m.normal) return <p className="note">O ritmo aparece ao fim do primeiro mês completo.</p>;
  const normalToday = m.normal * p.share;
  return (
    <div className="pace">
      <p className="say">{nb(explainPace({ everyday: m.everyday, normal: m.normal, share: p.share, forecast: p.forecast, day: p.day }))}</p>
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

/**
 * O mês num relance: um calendário com o valor de cada dia escrito (a tua parte, dia a dia), os dias fora do normal
 * anotados com o que os pesou, e a frase que explica o mês. Lê-se de uma vez; não é uma imagem.
 */
function Glance({ expenses, monthKey: key, normal }: { expenses: Parameters<typeof glance>[0]; monthKey: string; normal: number | null }) {
  const { me } = useSession();
  const g = useMemo(() => glance(expenses, me?.id ?? '', key, todayStr(), normal), [expenses, me?.id, key, normal]);
  const out = new Map(g.outliers.map((d, i) => [d.day, i + 1]));
  return (
    <div className="gl">
      <p className="gl-say">{nb(g.sentence)}</p>
      <div className="gl-cal" role="table" aria-label={`O mês dia a dia: ${g.days.filter((d) => d.total).map((d) => `dia ${d.day}, ${eur(d.total, 0)} €`).join('; ')}`}>
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((w, i) => <span key={`w${i}`} className="gl-wd" aria-hidden="true">{w}</span>)}
        {Array.from({ length: g.lead }, (_, i) => <span key={`e${i}`} aria-hidden="true" />)}
        {g.days.map((d) => (
          <span key={d.day} aria-hidden="true" className={`gl-d${d.future ? ' fut' : ''}${d.today ? ' now' : ''}${out.has(d.day) ? ' out' : ''}${d.total < 0 ? ' neg' : ''}`}
            style={{ ['--a' as string]: g.max ? Math.max(0, Math.min(1, d.total / g.max)) : 0 }}>
            <small>{d.day}{out.has(d.day) && <sup>{out.get(d.day)}</sup>}</small>
            <b className="num">{d.future ? '' : d.total ? k1(d.total) : '·'}</b>
          </span>
        ))}
      </div>
      {g.outliers.length > 0 && (
        <ol className="gl-notes">{g.outliers.map((d, i) => <li key={d.day}><span className="num">{i + 1}</span><span>Dia {d.day}{d.note ? ` · ${d.note}` : ''}</span><span className="num">{eur(d.total, 0)} €</span></li>)}</ol>
      )}
    </div>
  );
}

/**
 * O Hoje que se compõe (lib/front.ts): cada assunto da casa tem um peso agora; o de mais peso é a manchete, os dois
 * seguintes são destaques com o seu número, e há até quatro breves. Num dia calmo a manchete diz isso mesmo.
 * Por baixo, o que não muda de lugar: o mês num relance, a agenda e o que há para resolver.
 */
/**
 * As frentes da casa, lado a lado e com o mesmo peso: o dinheiro é uma delas. Cada linha tem o seu sinal (um número
 * e a legenda). No Hoje (short) só aparecem as que pedem atenção; na Casa, todas.
 */
function Fronts({ money, short }: { money: { total: number; pct: number | null }; short?: boolean }) {
  const { val, on } = useSpaceVals();
  const hot: Record<string, boolean> = {
    compras: Number(val.compras[0]) > 0, casa: val.casa[1] === 'por confirmar' || /aviso/.test(val.casa[1] ?? ''), housekeeping: val.housekeeping[0] === 'hoje',
    eventos: /^\d+$/.test(val.eventos[0]) && Number(val.eventos[0]) <= 14 && !/depois/.test(val.eventos[1] ?? ''),
  };
  const rows = [
    { k: 'dinheiro', to: '/n2/dinheiro', ic: 'coins', n: 'Dinheiro', v: `${eur(money.total, 0)} €`, u: money.pct === null ? '' : money.pct >= 10 ? `+${Math.round(money.pct)}%` : money.pct <= -10 ? `−${Math.round(-money.pct)}%` : 'normal', hot: money.pct !== null && money.pct >= 10 },
    ...MODULES.filter((x) => x.k !== 'contas' && x.k !== 'agenda' && on(x.k)).map((x) => ({ k: x.k as string, to: x.to, ic: x.ic, n: x.k === 'housekeeping' ? 'Ajuda em casa' : x.name, v: val[x.k]?.[0] ?? '—', u: val[x.k]?.[1] ?? '', hot: !!hot[x.k] })),
  ];
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
        <Link key={r.k} to={r.to} className={`cd press${r.hot ? ' hot' : ''}`} style={{ ['--i' as string]: k }} aria-label={`${r.n}: ${r.v} ${r.u}`}>
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
  return (
    <div className="n2-page n2v" onPointerMove={glow}>
      <Aurora />
      <Masthead pill />
      <Fronts money={{ total: m.total, pct: m.pace.fresh ? null : m.pace.pct }} />
      <Orb dests={DESTS} />
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
  return (
    <div className="n2-page n2v" onPointerMove={glow}>
      <Aurora />
      <Masthead pill />
      <Link to="/n2/tempo" className={`dayc press${calm ? '' : ' live'}`} aria-label={next ? `A seguir: ${next.title}, às ${next.time}` : 'Hoje sem mais nada marcado'}>
        <span className="cd-h"><span>{next ? 'A seguir' : 'Hoje'}</span><Icon n="arrow" s={14} /></span>
        <span className="dayc-v"><Odometer value={next?.time ?? hhmm} /><small>{next ? next.title : 'livre'}</small></span>
        <DayArc now={nowH} marks={todayIts.filter((i) => i.time).map((i) => hOf(i.time!))} />
        <span className="dayc-l">{nb(lead.head)}</span>
      </Link>
      <Fronts money={{ total: m.total, pct }} short />
      <Sec n="" t="A fazer" className="plain lite"><Now /></Sec>
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
  // As frases que explicam os gráficos (lib/explain.ts): o que é notável e porquê; o resto cala-se.
  const catsSay = useMemo(() => (me ? explainCats({ byCat: m.dailyByCat, normals: catN, share: m.current && !m.pace.fresh ? m.pace.day / m.pace.days : 1, current: m.current, expenses: daily, who: me.id, key, label: catLabel }) : { text: '', marks: [] as string[], fixed: undefined as string | undefined }), [me, m, catN, daily, key]);
  const yearSay = useMemo(() => explainYear({ months: series, normal: m.normal, forecast: fcast || null, expenses: daily, who: me?.id ?? '' }), [series, m.normal, fcast, daily, me?.id]);
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
        <span className="dayc-v"><Odometer value={eur(m.total, 0)} /><small>€</small></span>
        <span className={`fig-n${pct !== null && pct >= 10 ? ' up' : pct !== null && pct <= -10 ? ' down' : ''}`}>
          {pct === null ? 'O primeiro mês: daqui para a frente compara-se.' : `${pct === 0 ? 'No ritmo habitual' : `${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'} do habitual`}${m.current && !m.pace.fresh ? `, até dia ${m.pace.day}` : ''}.`}
        </span>
        <span className="fig-n">O teu normal: {m.normal ? `${eur(m.normal, 0)} €` : '—'} por mês.{m.events > 0 ? ` Mais ${eur(m.events, 0)} € em eventos, à parte.` : ''}</span>
      </div>

      {m.current && <Sec n="01" t="Ritmo"><Pace m={m} /></Sec>}

      <Sec n={`0${1 + s}`} t="Dia a dia"><Glance expenses={daily} monthKey={key} normal={m.normal} /></Sec>

      <Sec n={`0${2 + s}`} t="Onde" aside={<span className="sec-k">face ao teu normal</span>}>
        {catsSay.text && <p className="say">{nb(catsSay.text)}</p>}
        {cats.length ? (
          <table className="tbl">
            <thead><tr><th>Categoria</th><th aria-label="Barra" /><th className="r">{m.current ? 'Até hoje' : 'No mês'}</th><th className="r">{m.current ? 'do normal' : 'Δ'}</th></tr></thead>
            <tbody>{cats.map(([c, v]) => {
              const nn = catN[c] ?? 0, d = nn > 0 && !m.current ? Math.round((v / nn - 1) * 100) : null;
              return (
                <tr key={c} className={catsSay.marks.includes(c) ? 'hl' : undefined}>
                  <td>{catLabel(c)}</td>
                  <td className="bar"><i style={{ width: `${(v / cmax) * 100}%` }} />{nn > 0 && <b style={{ left: `${(nn / cmax) * 100}%` }} title={`Normal: ${eur(nn, 0)} €`} />}</td>
                  <td className="r num">{eur(v, 0)} €</td>
                  <td className={`r num${d !== null && d >= 5 ? ' up' : d !== null && d <= -5 ? ' down' : ''}`}>{d === null ? (nn ? `${Math.round((v / nn) * 100)}%` : '—') : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}%`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <p className="note">Nada em {monthName(key)}.</p>}
        {catsSay.fixed && <p className="note">{nb(catsSay.fixed)}</p>}
        <p className="note">O traço vertical em cada barra é o normal da categoria.</p>
      </Sec>

      <Sec n={`0${3 + s}`} t="Doze meses" aside={m.normal ? <span className="sec-k">normal {eur(m.normal, 0)} €</span> : undefined}>
        <p className="say">{nb(yearSay.text)}</p>
        <div className="c12s" role="img" aria-label={`Doze meses: ${series.map((x) => `${monthName(x.key)} ${eur(x.total, 0)} €`).join(', ')}.`}>
          {m.normal && <span className="c12-norm" style={{ bottom: `calc(22px + (100% - 44px) * ${m.normal / smax})` }}><em>normal</em></span>}
          {series.map((x) => {
            const fc = x.current && fcast > x.total ? fcast : 0;
            return (
              <button key={x.key} type="button" className={`c12${x.key === key ? ' sel' : ''}${x.current ? ' cur' : ''}${yearSay.marks.includes(x.key) ? ' hl' : ''}`} onClick={() => setKey(x.key)} aria-label={`${monthName(x.key)}: ${eur(x.total, 0)} €`}>
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

      <Sec n={`0${4 + s}`} t={`Movimentos de ${monthName(key)}`} aside={<span className="sec-k">{moves.length}</span>}>
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
      <Orb dests={DESTS} />
    </div>
  );
}
