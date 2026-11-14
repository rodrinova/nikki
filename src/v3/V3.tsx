import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import '@/n2/n2.css';
import './v3.css';
import { useHouse } from '@/data/house';
import { Icon } from '@/ui/Icon';
import { eur, toU } from '@/lib/money';
import { addDays, monthKey, todayStr } from '@/lib/dates';
import { Masthead, N2Money } from '@/n2/N2';
import { useN2 } from '@/n2/shell';
import { Ledger, catLabel } from '@/screens/Money';
import { Wealth } from '@/screens/Wealth';
import { Goals } from '@/screens/Goals';

// NIKKI 3 (experiência, só para quem administra): três sítios e o +. Hoje (o que acontece), Dinheiro (o que se
// mexeu), Casa (as coisas de que cuidamos). Todas as coisas têm a mesma página: um número, o que vem a seguir,
// o que custou e os papéis. Os ecrãs completos de sempre continuam a um toque («Abrir tudo»).

const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
const inDays = (d: string, today: string) => Math.round((Date.parse(d + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 86_400_000);
const when = (d: string, today: string) => { const n = inDays(d, today); return n < 0 ? `há ${-n} d` : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 14 ? `${n} dias` : day(d); };

/** Dinheiro: Gastar (o mês, movimentos editáveis, entre nós) e Guardar (património e objetivos). */
export function V3Money() {
  useN2();
  const [tab, setTab] = useState<'gastar' | 'guardar'>('gastar');
  return (
    <div className="n2-page n2v">
      <Masthead />
      <div className="v3-seg" role="tablist" aria-label="Dinheiro">
        {(['gastar', 'guardar'] as const).map((t) => <button key={t} type="button" role="tab" className="press" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'gastar' ? 'Gastar' : 'Guardar'}</button>)}
      </div>
      {tab === 'gastar' ? <><N2Money bare /><section className="v3-embed" aria-label="Entre nós"><h2 className="v3-h">Entre nós</h2><Ledger embedded /></section></>
        : <div className="v3-embed"><Wealth /><Goals /></div>}
    </div>
  );
}

interface Thing { kind: string; id: string; n: string; ic: string; v: string; u: string; hot: boolean }

/** As coisas da casa, com o seu sinal: a(s) casa(s), cada carro, quem ajuda, cada evento, e tu. */
function useThings(): Thing[] {
  const { homes, cars, hk, occasions, deadlines, shop, gym, on } = useHouse();
  const today = todayStr(), soon = addDays(today, 30);
  return useMemo(() => {
    const due = (f: (d: (typeof deadlines.rows)[number]) => boolean) => deadlines.rows.filter((d) => !d.paid_at && d.due_on <= soon && f(d)).sort((a, b) => (a.due_on < b.due_on ? -1 : 1))[0];
    const out: Thing[] = [];
    const hs = homes.rows.filter((h) => !h.archived), left = shop.rows.filter((i) => !i.done).length;
    for (const h of hs.length ? hs : [{ id: 'casa', name: 'A casa' }]) { const d = due((x) => !x.car_id && (!x.home_id || x.home_id === h.id || hs.length < 2)); out.push({ kind: 'casa', id: h.id, n: hs.length > 1 ? h.name : 'A casa', ic: 'house', v: d ? when(d.due_on, today) : String(left), u: d ? d.title : left === 1 ? 'coisa por comprar' : 'coisas por comprar', hot: !!d && d.due_on <= addDays(today, 7) }); }
    if (on('garagem')) for (const c of cars.rows.filter((x) => !x.archived)) { const d = due((x) => x.car_id === c.id); out.push({ kind: 'carro', id: c.id, n: c.name, ic: 'car', v: d ? when(d.due_on, today) : '✓', u: d ? d.title : 'em dia', hot: !!d && d.due_on <= addDays(today, 7) }); }
    if (on('housekeeping')) for (const h of hk.rows.filter((x) => !x.archived)) out.push({ kind: 'ajuda', id: h.id, n: h.name, ic: 'broom', v: h.monthly_pay ? `${eur(toU(h.monthly_pay), 0)} €` : '—', u: 'por mês', hot: false });
    if (on('eventos')) for (const o of occasions.rows.filter((x) => !x.archived && !x.purchase)) { const n = o.on_date ? inDays(o.on_date, today) : null; out.push({ kind: 'evento', id: o.id, n: o.name, ic: 'gift', v: n === null ? '—' : n >= 0 ? String(n) : 'foi', u: n === null ? 'sem data' : n >= 0 ? (n === 1 ? 'dia' : 'dias') : day(o.on_date!), hot: n !== null && n >= 0 && n <= 14 }); }
    if (on('ginasio')) out.push({ kind: 'eu', id: 'eu', n: 'Eu', ic: 'pulse', v: String(gym.rows.length), u: gym.rows.length === 1 ? 'avaliação' : 'avaliações', hot: false });
    return out;
  }, [homes.rows, cars.rows, hk.rows, occasions.rows, deadlines.rows, shop.rows, gym.rows, on, today, soon]);
}

/** Casa: as coisas de que cuidamos, todas com a mesma cara. */
export function V3Casa() {
  useN2();
  const things = useThings();
  return (
    <div className="n2-page n2v">
      <Masthead />
      <div className="cards">
        {things.map((t, k) => (
          <Link key={t.kind + t.id} to={`/v3/coisa/${t.kind}/${t.id}`} className={`cd press${t.hot ? ' hot' : ''}`} style={{ ['--i' as string]: k }} aria-label={`${t.n}: ${t.v} ${t.u}`}>
            <span className="cd-h"><span>{t.n}</span><Icon n="arrow" s={14} /></span>
            <span className="cd-g"><span className="cd-ic"><Icon n={t.ic as never} s={30} w={1.1} /></span></span>
            <span className="cd-v"><span>{t.v}</span><small>{t.u}</small></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const Block = ({ t, aside, children }: { t: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="cd wide v3-block" aria-label={t}><span className="cd-h"><span>{t}</span>{aside}</span>{children}</section>
);
const Row = ({ a, b, c, to, hot }: { a: string; b?: string; c?: string; to?: string; hot?: boolean }) => {
  const body = <><span className="v3-a">{a}{b && <small>{b}</small>}</span>{c && <em className={hot ? 'hot' : ''}>{c}</em>}{to && <Icon n="chev" s={14} />}</>;
  return to ? <Link to={to} className="v3-row press">{body}</Link> : <div className="v3-row">{body}</div>;
};

/**
 * A página de uma coisa, sempre igual: o número, o que vem a seguir (prazos, tarefas, visitas), o que custou
 * (12 meses e os últimos movimentos) e os papéis. No fim, a porta para o ecrã completo de sempre.
 */
export function V3Thing() {
  useN2();
  const { kind = '', id = '' } = useParams();
  const { deadlines, chores, warranties, expenses, cars, hk, occasions, homes, shop, gym } = useHouse();
  const things = useThings();
  const t = things.find((x) => x.kind === kind && x.id === id);
  const today = todayStr(), y0 = monthKey(addDays(today, -365));
  if (!t) return <Navigate to="/v3/casa" replace />;
  const many = homes.rows.filter((h) => !h.archived).length > 1;
  const mine = (e: (typeof expenses.rows)[number]) => kind === 'carro' ? e.car_id === id : kind === 'evento' ? e.occasion_id === id : kind === 'casa' ? ['Casa', 'Contas', 'Supermercado'].includes(e.category) && !e.car_id && !e.occasion_id : false;
  const exp = expenses.rows.filter(mine).sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));
  const year = exp.filter((e) => monthKey(e.spent_on) >= y0).reduce((s, e) => s + toU(e.amount), 0);
  const next: { a: string; b?: string; c: string; hot: boolean; d: string }[] = [];
  for (const d of deadlines.rows) if (!d.paid_at && (kind === 'carro' ? d.car_id === id : kind === 'casa' ? !d.car_id && (!many || !d.home_id || d.home_id === id) : false)) next.push({ a: d.title, b: d.amount ? `${eur(toU(d.amount), 0)} €` : undefined, c: when(d.due_on, today), hot: d.due_on <= addDays(today, 7), d: d.due_on });
  if (kind === 'casa') for (const c of chores.rows) if (!c.archived && c.next_on <= addDays(today, 30)) next.push({ a: c.title, b: c.kind === 'maintenance' ? 'manutenção' : 'tarefa', c: when(c.next_on, today), hot: c.next_on <= today, d: c.next_on });
  const o = kind === 'evento' ? occasions.rows.find((x) => x.id === id) : undefined;
  if (o?.on_date) next.push({ a: o.name, b: o.place ?? undefined, c: when(o.on_date, today), hot: false, d: o.on_date });
  const h = kind === 'ajuda' ? hk.rows.find((x) => x.id === id) : undefined;
  next.sort((a, b) => (a.d < b.d ? -1 : 1));
  const car = kind === 'carro' ? cars.rows.find((c) => c.id === id) : undefined;
  const papers = kind === 'casa' ? warranties.rows.filter((w) => !w.archived && (!many || !w.home_id || w.home_id === id)) : [];
  const full = kind === 'carro' ? `/garagem/${id}` : kind === 'evento' ? `/eventos/${id}` : kind === 'ajuda' ? '/housekeeping' : kind === 'eu' ? '/ginasio' : '/casa';
  const left = shop.rows.filter((i) => !i.done).length;
  return (
    <div className="n2-page n2v">
      <Masthead />
      <Link to="/v3/casa" className="more press" style={{ alignSelf: 'flex-start' }}>‹ Casa</Link>
      <section className="dayc v3-hero" aria-label={t.n}>
        <span className="cd-h"><span>{t.n}</span><Icon n={t.ic as never} s={18} /></span>
        <span className="dayc-v"><span>{t.v}</span><small>{t.u}</small></span>
        {car?.plate && <span className="dayc-l" style={{ textAlign: 'left' }}>{car.plate}{car.insurer ? ` · ${car.insurer}` : ''}</span>}
        {o?.budget ? <span className="dayc-l" style={{ textAlign: 'left' }}>Orçamento {eur(toU(o.budget), 0)} € · gasto {eur(exp.reduce((s, e) => s + toU(e.amount), 0), 0)} €</span> : null}
      </section>

      {kind === 'casa' && <Block t="No dia a dia">
        <Row a="Compras" b={left ? `${left} por comprar` : 'lista vazia'} to="/compras" />
        <Row a="Contas fixas" b="luz, água, renda, internet" to="/casa/contas" />
        <Row a="Tarefas" to="/casa/tarefas" />
      </Block>}
      {kind === 'ajuda' && h && <Block t="No dia a dia">
        <Row a="Mensagens e lista da visita" to="/housekeeping" />
        <Row a="Tarefas da rotina" to="/housekeeping/tarefas" />
        <Row a="Pagamento" b={h.monthly_pay ? `${eur(toU(h.monthly_pay), 0)} € por mês` : undefined} to="/housekeeping/pagamento" />
      </Block>}
      {kind === 'eu' && <Block t="As tuas medidas"><Row a="Avaliações e evolução" b={`${gym.rows.length} registadas · só tu vês`} to="/ginasio" /></Block>}

      {(kind === 'casa' || kind === 'carro' || kind === 'evento') && <Block t="A seguir" aside={<span>{next.length}</span>}>
        {next.length ? next.slice(0, 6).map((x, k) => <Row key={k} a={x.a} b={x.b} c={x.c} hot={x.hot} />) : <p className="note">Nada à vista. Tudo em dia.</p>}
      </Block>}

      {(kind === 'casa' || kind === 'carro' || kind === 'evento') && <Block t="Dinheiro" aside={<span>{eur(year, 0)} € em 12 meses</span>}>
        {exp.length ? exp.slice(0, 5).map((e) => <Row key={e.id} a={e.note || catLabel(e.category)} b={day(e.spent_on)} c={`${eur(toU(e.amount))} €`} />) : <p className="note">Ainda sem despesas aqui.</p>}
        {exp.length > 5 && <Link to="/v3/dinheiro" className="more press" style={{ alignSelf: 'center' }}>Ver no Dinheiro</Link>}
      </Block>}

      {kind === 'casa' && <Block t="Papéis" aside={<span>{papers.length}</span>}>
        {papers.length ? papers.slice(0, 6).map((w) => <Row key={w.id} a={w.item} b={w.store ?? undefined} c={`${w.years} ${Number(w.years) === 1 ? 'ano' : 'anos'}`} to="/casa/garantias" />) : <Row a="Juntar uma garantia" to="/casa/garantias" />}
      </Block>}

      <Link to={full} className="tour-go press" style={{ alignSelf: 'center', textDecoration: 'none' }}>Abrir tudo <Icon n="arrow" s={18} /></Link>
    </div>
  );
}

/** Uma procura para tudo: despesas, eventos, prazos, tarefas, garantias, compras e coisas. */
export function V3Search() {
  useN2();
  const { expenses, events, deadlines, chores, warranties, shop, cars, occasions } = useHouse();
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = norm(q.trim());
  const groups = useMemo(() => {
    if (t.length < 2) return [];
    const has = (s?: string | null) => !!s && norm(s).includes(t);
    const g: { n: string; rows: { a: string; b?: string; c?: string; to: string }[] }[] = [
      { n: 'Coisas', rows: [...cars.rows.filter((c) => !c.archived && (has(c.name) || has(c.plate))).map((c) => ({ a: c.name, b: c.plate ?? undefined, to: `/v3/coisa/carro/${c.id}` })), ...occasions.rows.filter((o) => has(o.name)).map((o) => ({ a: o.name, b: o.on_date ? day(o.on_date) : undefined, to: `/v3/coisa/evento/${o.id}` }))] },
      { n: 'A seguir', rows: [...deadlines.rows.filter((d) => !d.paid_at && has(d.title)).map((d) => ({ a: d.title, b: 'prazo', c: day(d.due_on), to: d.car_id ? `/v3/coisa/carro/${d.car_id}` : '/casa/prazos' })), ...chores.rows.filter((c) => !c.archived && has(c.title)).map((c) => ({ a: c.title, b: c.kind === 'maintenance' ? 'manutenção' : 'tarefa', c: day(c.next_on), to: c.kind === 'maintenance' ? '/casa/manutencao' : '/casa/tarefas' })), ...events.rows.filter((e) => has(e.title)).slice(0, 8).map((e) => ({ a: e.title, b: 'agenda', c: day(e.starts_at.slice(0, 10)), to: '/n2/tempo' }))] },
      { n: 'Dinheiro', rows: expenses.rows.filter((e) => has(e.note) || has(catLabel(e.category))).sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1)).slice(0, 12).map((e) => ({ a: e.note || catLabel(e.category), b: day(e.spent_on), c: `${eur(toU(e.amount))} €`, to: `/v3/dinheiro?mes=${monthKey(e.spent_on)}` })) },
      { n: 'Papéis', rows: warranties.rows.filter((w) => has(w.item) || has(w.store)).map((w) => ({ a: w.item, b: w.store ?? undefined, to: '/casa/garantias' })) },
      { n: 'Compras', rows: shop.rows.filter((i) => !i.done && has(i.name)).map((i) => ({ a: i.name, b: 'na lista', to: '/compras' })) },
    ];
    return g.filter((x) => x.rows.length);
  }, [t, cars.rows, occasions.rows, deadlines.rows, chores.rows, events.rows, expenses.rows, warranties.rows, shop.rows]);
  return (
    <div className="n2-page n2v">
      <Masthead />
      <label className="mp-find"><Icon n="ask" s={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar em tudo (ex.: seguro, Golf, continente)" aria-label="Procurar em tudo" /></label>
      {t.length < 2 ? <p className="note">Uma procura para tudo: despesas, agenda, prazos, tarefas, garantias, compras e coisas.</p>
        : groups.length ? groups.map((g) => <Block key={g.n} t={g.n} aside={<span>{g.rows.length}</span>}>{g.rows.map((r, k) => <Row key={k} a={r.a} b={r.b} c={r.c} to={r.to} />)}</Block>)
          : <p className="note">Nada com «{q}».</p>}
    </div>
  );
}
