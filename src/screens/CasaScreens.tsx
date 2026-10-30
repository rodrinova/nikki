// Os ecrãs de Casa que só se abrem pela rota: carregam-se à parte, quando se abrem.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type BillRow, type DeadlineRow, type ExpenseRow, type HomeRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { How } from '@/ui/Year';
import { eur, parseAmount, toU, type Split } from '@/lib/money';
import { addDays, dayLabel, monthName, todayStr } from '@/lib/dates';
import { store } from '@/lib/store';
import { warrantyState } from '@/lib/chores';
import { KINDS, billStats, imiNext, invoiceToLink, usageLabel, type BillKind, type BillPayment, type BillStats } from '@/lib/home';
import { Top } from './Home';
import { Loading, later } from '@/ui/lazy';
import { dt, EVERY, categoryOf, TENURE, useCasa, useBillDeadline, BillSheet, BillEntry, billEntry, BillFields, useSaveBill, PaidSheet, ContractSheet } from './Casa';

const YearBlocks = later(() => import('./CasaYear'), 'YearBlocks');
import { ChoresSection, WarrantiesSection } from './CasaCare';

// Casa: contas fixas (com consumos e faturas que cobrem vários meses), despesas por confirmar, prazos e contratos.
// Regras em docs/CALCULOS.md, secção 6c.

const when = (d: string) => (d <= addDays(todayStr(), 6) ? dayLabel(d) : dt(d));
const pct = (v: number) => (Math.round(v * 100) === 0 ? 'igual' : `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`);
const everyLabel = (n: number) => (n === 1 ? 'todos os meses' : n === 12 ? 'uma vez por ano' : `a cada ${n} meses`);
/** A casa escolhida (todas ou uma), lembrada neste aparelho para o painel e cada ecrã da Casa. */
function useSel(): [string, (v: string) => void] {
  const [sel, set] = useState(() => store.get('nikki_casa_sel') ?? 'all');
  return [sel, (v) => { set(v); store.set('nikki_casa_sel', v); }];
}

function HomeChips({ c, sel, setSel }: { c: ReturnType<typeof useCasa>; sel: string; setSel: (v: string) => void }) {
  if (c.places.length < 2) return null;
  return (
    <div className="chips" role="group" aria-label="Que casa">
      <button className="press" aria-pressed={sel === 'all'} onClick={() => setSel('all')}>Todas</button>
      {c.places.map((h) => <button key={h.id} className="press" aria-pressed={sel === h.id} onClick={() => setSel(h.id)}>{h.name}</button>)}
    </div>
  );
}

const PARTS = ['contas', 'ano', 'prazos', 'tarefas', 'manutencao', 'garantias', 'casas'] as const;
type Part = (typeof PARTS)[number];

/** A Casa: o resumo, «Ler fatura» e um quadrado por cada parte (com um número vivo), em vez de uma página sem fim. */
export function Casa() {
  const [sel0, setSel] = useSel();
  const c0 = useCasa('all');
  const sel = sel0 === 'all' || c0.places.some((h) => h.id === sel0) ? sel0 : 'all';
  const c = useCasa(sel);
  const { chores, warranties } = useHouse();
  if (!c.ready) return <><Top title="Casa" /><Loading /></>;
  if (!c.places.length) return <CasaSetup />;
  const here = sel === 'all' ? null : sel;
  const today = todayStr();
  const inHome = (h: string | null | undefined) => !here || (h && c.places.some((p) => p.id === h) ? h : c.first) === here;
  const tasks = chores.rows.filter((x) => !x.archived && x.kind === 'task' && inHome(x.home_id));
  const maint = chores.rows.filter((x) => !x.archived && x.kind === 'maintenance' && inHome(x.home_id)).sort((a, b) => a.next_on.localeCompare(b.next_on));
  const gar = warranties.rows.filter((w) => !w.archived && inHome(w.home_id)).map((w) => warrantyState(w.bought_on, Number(w.years), today));
  const yearTotal = c.year.reduce((t, y) => t + y.year, 0);
  const tiles: [Part, string, string, string, boolean][] = [
    ['contas', 'coins', 'Contas fixas', c.pending.length ? `${c.pending.length} por confirmar` : `${c.active.length} ${c.active.length === 1 ? 'conta' : 'contas'}`, c.pending.length > 0],
    ['ano', 'bars', 'Por ano', yearTotal ? `${eur(yearTotal, 0)} €` : 'sem contas', false],
    ['prazos', 'bell', 'Prazos', c.deadlines.length ? `${c.deadlines.length} · ${dt(c.deadlines[0].due_on)}` : 'nenhum', c.deadlines.some((d) => d.due_on <= addDays(today, d.remind_days ?? 7))],
    ['tarefas', 'check', 'Tarefas', tasks.length ? `${tasks.filter((x) => x.next_on <= today).length} para hoje · ${tasks.length}` : 'nenhuma', false],
    ['manutencao', 'umbrella', 'Manutenção', maint.length ? `próxima ${dt(maint[0].next_on)}` : 'escolher', maint.some((x) => x.next_on <= addDays(today, 14))],
    ['garantias', 'doc', 'Garantias', gar.length ? `${gar.filter((g) => g.state !== 'ended').length} a decorrer${gar.some((g) => g.state === 'soon') ? ` · ${gar.filter((g) => g.state === 'soon').length} a acabar` : ''}` : 'nenhuma', gar.some((g) => g.state === 'soon')],
    ['casas', 'house', c.places.length > 1 ? 'As casas' : 'A casa', `${c.places.length} ${c.places.length === 1 ? 'casa' : 'casas'}${c.archived.length ? ` · ${c.archived.length} arquivada${c.archived.length === 1 ? '' : 's'}` : ''}`, false],
  ];
  return (
    <>
      <Top title="Casa" />
      <HomeChips c={c0} sel={sel} setSel={setSel} />
      <div className="swap">
        <p className="xl">{eur(c.total, 0)}<small>€</small></p>
        <p className="s" style={{ marginTop: 8 }}>por mês em contas fixas{c.estimated ? ', com os valores normais onde ainda não há faturas' : ''}{c.yoy !== null ? ` · ${c.yoy && Math.round(c.yoy * 100) ? `${pct(c.yoy)} que` : 'igual a'} há um ano` : ''}</p>
      </div>
      <div className="casa-tiles">{tiles.map(([k, ic, t, d, hot]) => (
        <Link key={k} className={`tile ctile press${hot ? ' hot' : ''}`} to={`/casa/${k}`}><Icon n={ic} s={22} /><span className="l">{t}</span><span className="s">{d}</span></Link>
      ))}</div>
    </>
  );
}

/** Cada parte da Casa no seu ecrã. */
export function CasaPart() {
  const { part } = useParams();
  const [sel0, setSel] = useSel();
  const c0 = useCasa('all');
  const sel = sel0 === 'all' || c0.places.some((h) => h.id === sel0) ? sel0 : 'all';
  const c = useCasa(sel);
  const { open } = useOverlays();
  if (!PARTS.includes(part as Part)) return <><Top title="Casa" /><p className="s">Esta parte não existe.</p></>;
  if (!c.ready) return <><Top title="Casa" /><Loading /></>;
  const here = sel === 'all' ? null : sel, many = c.places.length > 1;
  const homeOf = (h: string | null) => (h && c.places.some((p) => p.id === h) ? h : c.first);
  const chips = part !== 'casas' && <HomeChips c={c0} sel={sel} setSel={setSel} />;
  switch (part as Part) {
    case 'contas': return (
      <>
        <Top title="Contas fixas" right={<button className="tb press" onClick={() => open(<BillSheet home={here ?? c.first} />)}>Nova conta</button>} />
        {chips}
        {c.pending.length > 0 && <Pending items={c.pending} />}
        {c.active.length ? <div className="bills">{c.active.map((b) => <BillCard key={b.id} b={b} s={c.stats.get(b.id)!} next={c.dues.find((d) => d.b.id === b.id)} place={many && sel === 'all' ? c.places.find((h) => h.id === c.homeOf(b))?.name : undefined} />)}</div>
          : <button className="tile hint-card press" onClick={() => open(<BillSheet home={here ?? c.first} />)}><span className="st2"><span>Juntar a primeira conta</span><span className="s">Luz, água, internet, renda… A NIKKI liga-lhe as despesas sozinha. Tu só pagas (isso, infelizmente, continua contigo).</span></span><Icon n="arrow" s={16} /></button>}
        <How>
          <p className="s">€ por mês: cada fatura reparte-se pelos meses que cobre, à proporção dos dias (uma de 2 meses vale metade em cada; um acerto entra nos meses que corrige). Média dos meses com faturas nos últimos 12, sem o mês a decorrer.</p>
          <p className="s">Que conta é: pelo fornecedor ou pelas palavras na nota, pelo valor (que pode variar até ±35% do normal) e pelo dia. Se houver dúvida, por exemplo duas contas do mesmo fornecedor, a NIKKI pergunta.</p>
          <p className="s">Preço por kWh ou m³: tudo o que se pagou ÷ o consumo das faturas com consumo, nos últimos 12 meses, comparado com os 12 anteriores.</p>
        </How>
      </>
    );
    case 'ano': return <><Top title="Por ano" />{chips}<YearBlocks c={c} all={sel === 'all'} /></>;
    case 'prazos': return <><Top title="Prazos e contratos" />{chips}<Deadlines list={c.deadlines} /></>;
    case 'tarefas': return <><Top title="Tarefas" />{chips}<ChoresSection kind="task" home={here} homeOf={homeOf} /></>;
    case 'manutencao': return <><Top title="Manutenção" />{chips}<ChoresSection kind="maintenance" home={here} homeOf={homeOf} /></>;
    case 'garantias': return <><Top title="Garantias" />{chips}<WarrantiesSection home={here} homeOf={homeOf} /></>;
    case 'casas': return (
      <>
        <Top title={many ? 'As casas' : 'A casa'} />
        <section className="stack" aria-label="As casas">
          {c.places.map((h) => {
            const tenure = TENURE.find(([k]) => k === h.tenure)?.[1];
            return <Link key={h.id} className="tile hint-card press" to={`/casa/arranque/${h.id}`}><span className="st2"><span>{h.name}{tenure ? ` · ${tenure.toLowerCase()}` : ''}{h.imi && Number(h.imi) ? ` · IMI ${eur(toU(h.imi), 0)} € por ano` : ''}</span><span className="s">Mudar ou juntar contas e prazos</span></span><Icon n="arrow" s={16} /></Link>;
          })}
          <Link className="btn quiet wide press" to="/casa/nova">Juntar outra casa <Icon n="plus" s={18} /></Link>
        </section>
        {c.archived.length > 0 && <section className="stack" aria-label="Casas arquivadas">
          <span className="s">Arquivadas</span>
          <div className="tile card rows">{c.archived.map((h) => <Link key={h.id} className="press" to={`/casa/arranque/${h.id}`}><span className="st2"><span>{h.name}</span><span className="s">O histórico fica; fora dos custos</span></span><Icon n="arrow" s={16} /></Link>)}</div>
        </section>}
      </>
    );
  }
}

function Pending({ items }: { items: ReturnType<typeof useCasa>['pending'] }) {
  const { open, toast } = useOverlays();
  const { house } = useSession();
  const { billPayments } = useHouse();
  async function notFixed(e: ExpenseRow) {
    const { error } = await supabase.from('bill_payments').insert({ household_id: house!.id, bill_id: null, expense_id: e.id, amount: null, period_from: e.spent_on, period_to: e.spent_on });
    if (error) return toast(error.message);
    billPayments.reload();
  }
  return (
    <section className="stack" aria-label="Por confirmar">
      <span className="s">Por confirmar</span>
      <div className="tile card rows">{items.map(({ e, m }) => (
        <div key={e.id} className="pend">
          <span className="st2"><span>{e.note || e.category} · {eur(toU(e.amount))} €</span><span className="s">{dt(e.spent_on)} · {m.sure ? `parece ${m.sure.name}${invoiceToLink(m.sure.id, toU(e.amount), e.spent_on, billPayments.rows) ? ' (a fatura lida)' : ''}` : `é ${m.ask.map((b) => b.name).join(' ou ')}?`}</span></span>
          <div className="chips" role="group" aria-label="Que conta">
            {(m.sure ? [m.sure] : m.ask).map((b) => <button key={b.id} className="press" onClick={() => open(<PaySheet bill={b} expense={e} />)}>{m.sure ? 'É' : b.name}</button>)}
            <button className="press" onClick={() => notFixed(e)}>Não é fixa</button>
          </div>
        </div>
      ))}</div>
    </section>
  );
}

function Bars({ s }: { s: BillStats }) {
  const max = Math.max(...s.series.map((x) => Math.abs(x.amount ?? 0)), 1);
  return (
    <div className="wk mc mini" aria-hidden="true">{s.series.map((x) => <span key={x.month}><i style={{ height: x.amount ? `${Math.max(6, (Math.abs(x.amount) / max) * 100)}%` : 2 }} className={x.amount ? '' : 'zero'} /></span>)}</div>
  );
}

function BillCard({ b, s, next, place }: { b: BillRow; s: BillStats; next?: { on: string; amount: number | null; invoice: boolean }; place?: string }) {
  return (
    <Link className="tile bill press" to={`/casa/conta/${b.id}`}>
      <span className="st2"><span>{b.name}</span><span className="s">{place ? `${place} · ` : ''}{b.provider ?? KINDS[b.kind].label} · {everyLabel(b.every_months)}</span></span>
      <span className="bill-v"><b>{s.perMonth !== null ? `${eur(s.perMonth, 0)} €` : s.typical ? `~${eur(Math.round(s.typical / b.every_months), 0)} €` : '—'}</b><span className="s">por mês{s.perMonth === null ? (s.typical ? ' · valor normal' : ' · sem faturas') : s.yoy !== null ? ` · ${pct(s.yoy)}` : ''}</span></span>
      {b.unit && s.usageMonth !== null && <span className="s">{usageLabel(s.usageMonth, b.unit)} por mês{s.unitPrice !== null ? ` · ${eur(s.unitPrice).replace(/(,\d\d)\d*$/, '$1')} €/${b.unit === 'm3' ? 'm³' : 'kWh'}` : ''}{s.priceChange !== null && s.priceChange > 0.1 ? <span className="warn"> · preço {pct(s.priceChange)}</span> : null}</span>}
      <Bars s={s} />
      {next && (next.invoice
        ? <span className="s"><span className="warn">A pagar {next.amount !== null ? `${eur(next.amount)} €` : ''}</span> até {when(next.on)} · fatura lida</span>
        : <span className="s">Próxima: {when(next.on)}{next.amount ? ` · cerca de ${eur(next.amount, 0)} €` : ''}</span>)}
    </Link>
  );
}

function Deadlines({ list }: { list: DeadlineRow[] }) {
  const { open } = useOverlays();
  return (
    <section className="stack" aria-label="Prazos e contratos">
      <div className="wbar"><span className="s">Avisam um mês antes (IMI, seguros, contratos)</span><button className="tb press" onClick={() => open(<DeadlineSheet />)}>Novo prazo</button></div>
      {list.length ? <div className="tile card rows">{list.map((d) => (
        <div key={d.id}>
          <span className="st2"><span>{d.title}</span><span className="s">{d.kind === 'insurance' ? 'renova ' : d.kind === 'contract' ? 'acaba ' : 'até '}{when(d.due_on)}{d.amount ? ` · ${eur(toU(d.amount))} €` : ''}{d.kind === 'insurance' || d.kind === 'contract' ? ' · um mês antes: pedir propostas e renegociar' : d.recurrence === 'yearly' ? ' · todos os anos' : ''}</span></span>
          {d.kind === 'contract' ? <button className="tb press" onClick={() => open(<ContractSheet d={d} />)}>Tratado</button> : <button className="tb press" onClick={() => open(<PaidSheet d={d} />)}>Paguei</button>}
        </div>
      ))}</div> : <p className="s">Sem prazos. Junta o IMI, o seguro da casa ou o fim de uma fidelização: a NIKKI avisa um mês antes e tu poupas o susto.</p>}
    </section>
  );
}

export function BillScreen() {
  const { id } = useParams();
  const { bills, billPayments, expenses } = useHouse();
  const { open } = useOverlays();
  const { house } = useSession();
  const b = bills.rows.find((x) => x.id === id);
  const s = useMemo(() => (b ? billStats(b, billPayments.rows, todayStr()) : null), [b, billPayments.rows]);
  const [sel, setSel] = useState(11);
  const [all, setAll] = useState(false);
  if (!b || !s) return <><Top title="Casa" />{bills.loading ? <Loading /> : <p className="s">Esta conta já não existe.</p>}</>;
  const ps = billPayments.rows.filter((p) => p.bill_id === b.id).sort((x, y) => y.period_to.localeCompare(x.period_to) || y.created_at.localeCompare(x.created_at));
  const unit = b.unit === 'm3' ? 'm³' : 'kWh';
  const cur = s.series[sel];
  const max = Math.max(...s.series.map((x) => Math.abs(x.amount ?? 0)), 1);
  async function remove(p: BillPayment) {
    // Desligar a fatura (a despesa, se houver, fica no Dinheiro e volta a «por confirmar»).
    await supabase.from('bill_payments').delete().eq('id', p.id);
    billPayments.reload();
  }
  return (
    <>
      <Top title={b.name} right={<button className="tb press" onClick={() => open(<BillSheet bill={b} />)}>Editar</button>} />
      <p className="s">{b.provider ? `${b.provider} · ` : ''}{everyLabel(b.every_months)}{b.due_day ? ` · dia ${b.due_day}` : ''}{b.contract_ends_on ? ` · ${b.kind === 'seguro' ? 'renova' : 'fidelização até'} ${dt(b.contract_ends_on)}` : ''}</p>
      <div className="kpis">
        <div className="tile kpi"><span className="l">{s.perMonth !== null ? `${eur(s.perMonth, 0)} €` : '—'}</span><span className="s">por mês<br />{s.months ? `média de ${s.months} ${s.months === 1 ? 'mês' : 'meses'}` : 'ainda sem faturas'}</span></div>
        <div className="tile kpi"><span className="l">{s.yoy !== null ? pct(s.yoy) : '—'}</span><span className="s">que há um ano<br />{s.yoy !== null ? 'nos mesmos meses' : 'falta um ano de faturas'}</span></div>
        {b.unit && <div className="tile kpi"><span className="l">{s.usageMonth !== null ? usageLabel(s.usageMonth, b.unit) : '—'}</span><span className="s">por mês<br />consumo</span></div>}
        {b.unit && <div className="tile kpi"><span className="l">{s.unitPrice !== null ? (s.unitPrice / 100_000).toFixed(unit === 'kWh' ? 3 : 2).replace('.', ',') : '—'}</span><span className="s">€/{unit}<br />{s.priceChange !== null ? `${pct(s.priceChange)} que no ano anterior` : 'tudo incluído'}</span></div>}
      </div>
      {s.priceChange !== null && s.priceChange > 0.1 && <p className="s why"><span className="dot" aria-hidden="true" /><span>O preço por {unit} subiu {Math.round(s.priceChange * 100)}% num ano. Vale a pena comparar tarifários no simulador da ERSE e, se houver melhor, mudar (sem custos e sem cortes).</span></p>}
      {s.series.some((x) => x.amount) && <section className="tile pane" aria-label="Por mês" style={{ minHeight: 0 }}>
        <div className="pane-top"><span className="s">Por mês</span><span className="s">{monthName(cur.month)}: {cur.amount !== null ? `${eur(cur.amount, 0)} €` : 'sem fatura'}</span></div>
        <div className="wk mc" role="group" aria-label="Últimos 12 meses">{s.series.map((x, j) => (
          <button key={x.month} type="button" className={`press${j === sel ? ' on' : ''}`} aria-label={`${monthName(x.month)}: ${x.amount !== null ? `${eur(x.amount, 0)} €` : 'sem fatura'}`} onClick={() => setSel(j)}><i style={{ height: x.amount ? `${Math.max(6, (Math.abs(x.amount) / max) * 100)}%` : 2 }} className={x.amount ? '' : 'zero'} /></button>
        ))}</div>
        <div className="wk-axis s"><span>{monthName(s.series[0].month).slice(0, 3)}</span><span>{monthName(s.series[11].month).slice(0, 3)}</span></div>
        <p className="s">Faturas de vários meses e acertos repartidos pelos meses que cobrem.</p>
      </section>}
      <div className="actions"><button className="btn quiet press" onClick={() => open(<PaySheet bill={b} />)}>Juntar um pagamento</button></div>
      <section className="stack" aria-label="Faturas">
        <div className="wbar"><span className="s">Faturas</span><span className="s">{ps.length}</span></div>
        {ps.length ? <div className="tile card rows">{(all ? ps : ps.slice(0, 12)).map((p) => {
          const e = p.expense_id ? expenses.rows.find((x) => x.id === p.expense_id) : null;
          return (
            <div key={p.id} className="mv">
              <span className="mv-t"><span>{p.adjustment ? 'Acerto' : 'Fatura'} · {p.period_from.slice(0, 7) === p.period_to.slice(0, 7) ? monthName(p.period_to.slice(0, 7)) : `${dt(p.period_from)} → ${dt(p.period_to)}`}</span>
                <span className="s">{p.usage !== null && b.unit ? `${usageLabel(Number(p.usage), b.unit)} · ` : ''}{e ? `paga ${dt(e.spent_on)}` : p.expense_id ? 'paga' : p.source !== 'manual' && Number(p.amount) > 0 ? `por pagar${p.due_on ? ` até ${dt(p.due_on)}` : ''}` : 'sem despesa'}{p.source && p.source !== 'manual' ? ` · lida ${p.source === 'pdf' ? 'do PDF' : 'da foto'}` : ''}</span></span>
              <span className="mv-v inline"><span>{eur(toU(p.amount!))} €</span>{house && <button className="x-btn press" aria-label="Desligar esta fatura" onClick={() => remove(p)}><Icon n="close" s={14} /></button>}</span>
            </div>
          );
        })}</div> : <p className="s">Ainda sem faturas. As despesas com {b.provider ?? b.name} na nota ligam-se sozinhas. Magia, só que com regras.</p>}
        {!all && ps.length > 12 && <button className="btn quiet wide press" onClick={() => setAll(true)}>Ver as {ps.length} faturas</button>}
      </section>
    </>
  );
}

// ───────────────────────── arranque ─────────────────────────

interface Draft { on: boolean; provider: string; value: string; day: string; every: number; date: string }
const SETUP: { k: BillKind; extra?: string; for?: HomeRow['tenure'][] }[] = [
  { k: 'luz' }, { k: 'gas' }, { k: 'agua' }, { k: 'internet', extra: 'Fidelização até' }, { k: 'telemovel' },
  { k: 'renda', for: ['arrendada'] }, { k: 'credito', for: ['credito'] }, { k: 'condominio' }, { k: 'seguro', extra: 'Renova em' },
];

/**
 * Ao ligar a Casa, ao juntar outra casa (/casa/nova) ou para mudar uma (/casa/arranque/:id): nome, como é, as contas
 * fixas e os prazos. Tudo opcional.
 */
export function CasaSetup() {
  const { id } = useParams();
  const { house, me } = useSession();
  const { homes, bills, deadlines } = useHouse();
  const { toast } = useOverlays();
  const nav = useNavigate();
  const ensure = useBillDeadline();
  const places = homes.rows.filter((h) => !h.archived);
  const home = id ? homes.rows.find((h) => h.id === id) : undefined;
  const isNew = !home;
  const { open } = useOverlays();
  const [name, setName] = useState(home?.name ?? (places.length ? '' : 'Casa'));
  const [tenure, setTenure] = useState<HomeRow['tenure']>(home?.tenure ?? null);
  const [imi, setImi] = useState(home?.imi && Number(home.imi) ? String(home.imi).replace('.', ',') : '');
  const [track, setTrack] = useState<boolean | null>(home ? !!home.track_usage : null);
  const firstId = [...places].sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0]?.id;
  const have = new Set(home ? bills.rows.filter((b) => !b.archived && (b.home_id ?? firstId) === home.id).map((b) => b.kind) : []);
  const [d, setD] = useState<Record<string, Draft>>(() => Object.fromEntries(SETUP.map((x) => [x.k, { on: false, provider: '', value: '', day: '', every: x.k === 'seguro' ? 12 : 1, date: '' }])));
  const [err, setErr] = useState('');
  const set = (k: string, p: Partial<Draft>) => setD((o) => ({ ...o, [k]: { ...o[k], ...p } }));
  const owns = tenure === 'propria' || tenure === 'credito';
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const label = name.trim() || (places.length ? '' : 'Casa');
    if (!label) return setErr('Falta o nome desta casa (ex.: Praia, Casa dos pais).');
    const imiV = owns && imi.trim() ? parseAmount(imi) : null;
    if (owns && imi.trim() && !imiV) return setErr('O IMI escreve-se assim: 320 ou 318,40.');
    if (track === null) return setErr('Falta responder: acompanhar os consumos de água, luz e gás?');
    const rows = [];
    for (const x of SETUP) {
      const v = d[x.k];
      if (!v.on || have.has(x.k) || (x.for && !x.for.includes(tenure))) continue;
      const value = v.value.trim() ? parseAmount(v.value) : null;
      if (v.value.trim() && !value) return setErr(`O valor de ${KINDS[x.k].label} escreve-se assim: 61,40.`);
      const day = v.day.trim() ? Number(v.day) : null;
      if (day !== null && !(day >= 1 && day <= 31)) return setErr('O dia é de 1 a 31.');
      // Noutra casa, o nome da casa entra no nome e nas palavras da conta (para distinguir as duas luzes da EDP).
      const other = places.length > 0 && (isNew || home!.id !== firstId);
      rows.push({ household_id: house!.id, kind: x.k, name: other ? `${KINDS[x.k].label} · ${label}`.slice(0, 40) : KINDS[x.k].label, keywords: other ? label.toLowerCase() : null, provider: v.provider.trim() || null, every_months: v.every, due_day: day, expected: value, unit: track ? KINDS[x.k].unit : null, contract_ends_on: v.date || null, created_by: me!.id });
    }
    const saved = home
      ? await supabase.from('homes').update({ name: label.slice(0, 40), tenure, imi: imiV, track_usage: track }).eq('id', home.id).select('*').single()
      : await supabase.from('homes').insert({ household_id: house!.id, name: label.slice(0, 40), tenure, imi: imiV, track_usage: track, updated_at: new Date().toISOString() }).select('*').single();
    // Mudou de ideias numa casa que já tinha contas: as de água, luz e gás passam a ter (ou deixam de ter) consumo.
    if (home && !!home.track_usage !== track) for (const b of bills.rows.filter((x) => !x.archived && (x.home_id ?? firstId) === home.id && KINDS[x.kind].unit))
      await supabase.from('bills').update({ unit: track ? KINDS[b.kind].unit : null }).eq('id', b.id);
    if (saved.error) return setErr(saved.error.message);
    const hid = (saved.data as HomeRow).id;
    for (const r of rows) Object.assign(r, { home_id: hid });
    if (rows.length) {
      const res = await supabase.from('bills').insert(rows).select('*');
      if (res.error) return setErr(res.error.message);
      for (const b of (res.data ?? []) as BillRow[]) await ensure(b);
    }
    // IMI: as prestações que faltam (uma, duas ou três, consoante o valor), a repetir todos os anos.
    if (imiV && !deadlines.rows.some((x) => x.kind === 'imi' && !x.paid_at && (x.home_id ?? firstId) === hid)) {
      const plan = imiNext(toU(imiV), todayStr());
      const split = toU(imiV) > 100 * 100_000; // em prestações: o nome diz o mês
      const of = places.length > 1 || isNew && places.length ? ` · ${label}` : '';
      await supabase.from('deadlines').insert(plan.map((p) => ({ household_id: house!.id, home_id: hid, title: `IMI${of}${split ? ` · ${monthName(p.due_on.slice(0, 7))}` : ''}`, due_on: p.due_on, amount: (p.amount / 100_000).toFixed(2), recurrence: 'yearly', kind: 'imi', remind_days: 30, created_by: me!.id })));
      deadlines.reload();
    }
    homes.reload(); bills.reload();
    toast(rows.length ? `${rows.length} ${rows.length === 1 ? 'conta' : 'contas'} na Casa. As despesas com estes nomes ligam-se sozinhas.` : 'Guardado.', { ok: true });
    nav('/casa');
  }
  if (home?.archived) return <ArchivedHome home={home} />;
  return (
    <>
      <Top title={home ? home.name : places.length ? 'Outra casa' : 'Casa'} />
      {isNew && <p className="s" style={{ fontSize: 'var(--t-m)' }}>{places.length ? 'A casa de férias, a dos pais… Cada conta fica na sua casa, e o ano aparece por casa e no total.' : 'Umas perguntas para a NIKKI conhecer a casa. Tudo opcional: o que faltar, ela aprende com as despesas.'}</p>}
      <form className="form" onSubmit={save}>
        <label>Nome da casa<input value={name} onChange={(e) => setName(e.target.value)} placeholder={places.length ? 'ex.: Praia' : 'Casa'} maxLength={40} /></label>
        <span className="s">A casa é</span>
        <div className="seg" role="group" aria-label="A casa é">{TENURE.map(([k, l]) => <button key={k} type="button" className="press" aria-pressed={tenure === k} onClick={() => setTenure(k)}>{l}</button>)}</div>
        {owns && <label>IMI por ano (€)<input inputMode="decimal" value={imi} onChange={(e) => setImi(e.target.value)} placeholder="ex.: 320" /></label>}
        {owns && <p className="s">Até 100 € paga-se em maio; até 500 €, em maio e novembro; acima, em maio, agosto e novembro. A NIKKI avisa um mês antes.</p>}
        <span className="s">Acompanhar os consumos de água, luz e gás?</span>
        <div className="seg" role="group" aria-label="Acompanhar os consumos">
          <button type="button" className="press" aria-pressed={track === true} onClick={() => setTrack(true)}>Sim</button>
          <button type="button" className="press" aria-pressed={track === false} onClick={() => setTrack(false)}>Não, só os valores</button>
        </div>
        {track !== null && <p className="s">{track
          ? 'Para isso a NIKKI precisa das faturas: quando registares a despesa da luz, da água ou do gás, pede a fatura (foto ou PDF) e lê o consumo e o período. A foto não fica guardada.'
          : 'Sem faturas: a NIKKI reconhece as despesas destas contas e conta só os valores.'}</p>}
        <span className="s">Contas fixas</span>
        <div className="tile card setup">{SETUP.filter((x) => !x.for || x.for.includes(tenure)).map((x) => {
          const v = d[x.k], done = have.has(x.k);
          return (
            <div key={x.k} className="setup-row">
              <button type="button" role="switch" aria-checked={done || v.on} aria-label={KINDS[x.k].label} disabled={done} className="sw-row press" onClick={() => set(x.k, { on: !v.on })}>
                <span>{KINDS[x.k].label}</span><span className="s">{done ? 'já está' : v.on ? '' : 'tocar para juntar'}</span><span className={`sw${done || v.on ? ' on' : ''}`} aria-hidden="true"><i /></span>
              </button>
              {v.on && !done && <div className="setup-in">
                <div className="two">
                  <label>{x.k === 'renda' ? 'Senhorio' : x.k === 'credito' ? 'Banco' : x.k === 'seguro' ? 'Seguradora' : x.k === 'condominio' ? 'Administração' : 'Fornecedor'}<input value={v.provider} onChange={(e) => set(x.k, { provider: e.target.value })} placeholder={x.k === 'luz' ? 'ex.: EDP' : x.k === 'agua' ? 'ex.: EPAL' : x.k === 'internet' ? 'ex.: MEO' : ''} maxLength={40} /></label>
                  <label>Valor normal (€)<input inputMode="decimal" value={v.value} onChange={(e) => set(x.k, { value: e.target.value })} placeholder="0,00" /></label>
                </div>
                <div className="two">
                  <label>Dia de pagamento<input inputMode="numeric" value={v.day} onChange={(e) => set(x.k, { day: e.target.value })} placeholder="ex.: 12" /></label>
                  {x.extra ? <label>{x.extra}<input type="date" value={v.date} onChange={(e) => set(x.k, { date: e.target.value })} /></label> : <span />}
                </div>
                {x.k !== 'seguro' && x.k !== 'renda' && x.k !== 'credito' && <div className="seg sm" role="group" aria-label="De quanto em quanto tempo">{EVERY.slice(0, 3).map(([n, l]) => <button key={n} type="button" className="press" aria-pressed={v.every === n} onClick={() => set(x.k, { every: n })}>{l}</button>)}</div>}
              </div>}
            </div>
          );
        })}</div>
        <p className="s">Seguro da casa e fidelizações: a NIKKI avisa um mês antes, para pedir propostas e renegociar com calma. O resto junta-se depois em «Nova conta».</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Feito <Icon n="check" s={20} /></button>
      </form>
      {home && <button className="back press" onClick={() => open(<ArchiveHome home={home} />)}>Arquivar esta casa (mudámos ou vendemos)</button>}
      {isNew && homes.rows.some((h) => h.archived) && <p className="s">Voltaram a uma casa que tinham? Está em Arquivadas, no fim do ecrã da Casa.</p>}
    </>
  );
}

/** Arquivar uma casa: o histórico fica; as contas saem dos custos e os prazos por pagar dessa casa saem. */
function ArchiveHome({ home }: { home: HomeRow }) {
  const { homes, bills, deadlines } = useHouse();
  const { close, toast } = useOverlays();
  const nav = useNavigate();
  const mine = bills.rows.filter((b) => b.home_id === home.id).map((b) => b.id);
  const open = deadlines.rows.filter((d) => !d.paid_at && (d.home_id === home.id || (d.bill_id && mine.includes(d.bill_id))));
  async function go() {
    const { error } = await supabase.from('homes').update({ archived: true }).eq('id', home.id);
    if (error) return toast(error.message);
    if (open.length) await supabase.from('deadlines').delete().in('id', open.map((d) => d.id));
    homes.reload(); deadlines.reload(); close(); nav('/casa');
    toast(`${home.name} arquivada. O histórico fica guardado.`, { ok: true });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Arquivar {home.name}?</p>
      <p className="s">As {mine.length} {mine.length === 1 ? 'conta' : 'contas'} e as faturas ficam guardadas, mas deixam de contar nos custos por mês e por ano, e as despesas novas já não se ligam a elas.{open.length ? ` ${open.length === 1 ? 'Sai o prazo' : `Saem os ${open.length} prazos`} por pagar desta casa (${open.map((d) => d.title).join(', ')}).` : ''}</p>
      <p className="s">Se voltarem a esta casa, está em Arquivadas, à espera.</p>
      <button className="btn wide press" onClick={go}>Arquivar <Icon n="check" s={20} /></button>
      <button className="btn quiet wide press" onClick={close}>Cancelar</button>
    </div>
  );
}

/** Uma casa arquivada: o que custou, e voltar a pô-la na Casa (as contas voltam; o IMI e os contratos voltam a avisar). */
function ArchivedHome({ home }: { home: HomeRow }) {
  const { me, house } = useSession();
  const { homes, bills, billPayments, deadlines } = useHouse();
  const { toast } = useOverlays();
  const nav = useNavigate();
  const ensure = useBillDeadline();
  const list = bills.rows.filter((b) => b.home_id === home.id && !b.archived);
  const ps = billPayments.rows.filter((p) => p.bill_id && list.some((b) => b.id === p.bill_id) && p.amount !== null);
  const last = ps.reduce((m, p) => (p.period_to > m ? p.period_to : m), '');
  async function restore() {
    const { error } = await supabase.from('homes').update({ archived: false }).eq('id', home.id);
    if (error) return toast(error.message);
    for (const b of list) await ensure(b);
    if (home.imi && Number(home.imi) > 0) {
      const plan = imiNext(toU(home.imi), todayStr()), split = toU(home.imi) > 100 * 100_000;
      await supabase.from('deadlines').insert(plan.map((p) => ({ household_id: house!.id, home_id: home.id, title: `IMI · ${home.name}${split ? ` · ${monthName(p.due_on.slice(0, 7))}` : ''}`, due_on: p.due_on, amount: (p.amount / 100_000).toFixed(2), recurrence: 'yearly', kind: 'imi', remind_days: 30, created_by: me!.id })));
    }
    homes.reload(); deadlines.reload(); nav('/casa');
    toast(`${home.name} de volta à Casa.`, { ok: true });
  }
  return (
    <>
      <Top title={home.name} />
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>Arquivada. {list.length} {list.length === 1 ? 'conta' : 'contas'} e {ps.length} {ps.length === 1 ? 'fatura' : 'faturas'} guardadas{last ? `, a última de ${monthName(last.slice(0, 7))} de ${last.slice(0, 4)}` : ''}. Fora dos custos e do reconhecimento das despesas.</p>
      {list.length > 0 && <div className="tile card rows">{list.map((b) => <Link key={b.id} className="press" to={`/casa/conta/${b.id}`}><span className="st2"><span>{b.name}</span><span className="s">{b.provider ?? KINDS[b.kind].label}</span></span><Icon n="arrow" s={16} /></Link>)}</div>}
      <button className="btn wide press" onClick={restore}>Voltar a pôr na Casa <Icon n="arrow" s={20} /></button>
    </>
  );
}

// ───────────────────────── folhas ─────────────────────────

/** Registar uma fatura de uma conta (com a despesa) ou ligar uma despesa que já existe. */
function PaySheet({ bill, expense }: { bill: BillRow; expense?: ExpenseRow }) {
  const { me, partner, house, myShare } = useSession();
  const { expenses, billPayments, homes } = useHouse();
  const { close, toast } = useOverlays();
  const saveBill = useSaveBill();
  const [amt, setAmt] = useState(expense ? String(expense.amount).replace('.', ',') : '');
  const [credit, setCredit] = useState(false);
  const [f, setF] = useState<BillEntry>({ ...billEntry(), pick: bill.id });
  const [day, setDay] = useState(todayStr());
  const [err, setErr] = useState('');
  const spent_on = expense?.spent_on ?? day;
  const v = parseAmount(amt);
  const firstHome = homes.rows.filter((h) => !h.archived).sort((x, y) => x.updated_at.localeCompare(y.updated_at))[0];
  const c = { show: true, active: [bill], m: { sure: bill, ask: [] }, bill, track: !!bill.unit && !!homes.rows.find((h) => h.id === (bill.home_id ?? firstHome?.id))?.track_usage, payments: billPayments.rows };
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!v) return setErr('Quanto foi?');
    let id = expense?.id ?? null;
    // Um acerto a favor (devolução) não é despesa: fica só na conta, a abater.
    if (!expense && !(f.adj && credit)) {
      const split: Split = !partner || bill.owner_id === me?.id ? 'mine' : bill.owner_id === null ? 'shared' : 'other';
      const { data, error } = await supabase.from('expenses').insert({
        household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: categoryOf(bill.kind), spent_on,
        split, other_id: split === 'mine' ? null : partner!.id, payer_share: split === 'shared' ? myShare : null, note: `${bill.provider ?? bill.name}${f.adj ? ' · acerto' : ''}`.slice(0, 120),
      }).select('id').single();
      if (error) return setErr(error.message);
      id = (data as { id: string }).id;
      expenses.reload();
    }
    const e2 = await saveBill(c, f, id, v, spent_on, f.adj && credit ? -1 : 1);
    if (e2) return setErr(e2);
    close();
    toast(`${bill.name}: ${f.adj && credit ? '−' : ''}${eur(toU(v))} €${f.adj ? ' (acerto)' : ''}.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{bill.name}{expense ? ` · ${dt(expense.spent_on)}` : ''}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor" value={amt} readOnly={!!expense} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} autoFocus={!expense} /><span className="l">€</span></div>
      <BillFields c={c} f={f} set={(x) => setF({ ...x, pick: x.pick === 'none' ? bill.id : x.pick })} amount={v ? toU(v) : 0} spent_on={spent_on} />
      {!expense && f.adj && <div className="seg" role="group" aria-label="Acerto"><button type="button" className="press" aria-pressed={!credit} onClick={() => setCredit(false)}>A pagar</button><button type="button" className="press" aria-pressed={credit} onClick={() => setCredit(true)}>A favor</button></div>}
      {!expense && <input className="field" type="date" value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} aria-label="Dia do pagamento" />}
      {err && <p className="err">{err}</p>}
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}

const DL: [string, NonNullable<DeadlineRow['kind']>][] = [['IMI', 'imi'], ['Seguro', 'insurance'], ['Contrato', 'contract'], ['Outro', 'other']];

function DeadlineSheet() {
  const { me, house } = useSession();
  const { deadlines } = useHouse();
  const { close, toast } = useOverlays();
  const [kind, setKind] = useState<NonNullable<DeadlineRow['kind']>>('other');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(addDays(todayStr(), 30));
  const [amt, setAmt] = useState('');
  const [yearly, setYearly] = useState(true);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const t = title.trim() || DL.find(([, k]) => k === kind)![0];
    const a = amt.trim() ? parseAmount(amt) : null;
    if (amt.trim() && !a) return setErr('O valor escreve-se assim: 148,37.');
    const { error } = await supabase.from('deadlines').insert({ household_id: house!.id, title: t.slice(0, 60), due_on: due, amount: a, recurrence: yearly ? 'yearly' : 'none', kind, remind_days: kind === 'other' ? 7 : 30, created_by: me!.id });
    if (error) return setErr(error.message);
    deadlines.reload(); close(); toast(`${t}: ${when(due)}.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Novo prazo · Casa</p>
      <div className="chips" role="group" aria-label="O quê">{DL.map(([l, k]) => <button key={k} type="button" className="press" aria-pressed={kind === k} onClick={() => { setKind(k); setYearly(k !== 'contract'); }}>{l}</button>)}</div>
      <div className="form">
        <label>O quê<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'contract' ? 'ex.: fim da fidelização MEO' : kind === 'insurance' ? 'ex.: seguro da casa' : kind === 'imi' ? 'IMI' : 'ex.: revisão da caldeira'} maxLength={60} /></label>
        <div className="two">
          <label>{kind === 'contract' ? 'Acaba em' : kind === 'insurance' ? 'Renova em' : 'Até'}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <label>Valor (€, opcional)<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0,00" /></label>
        </div>
        <div className="seg" role="group" aria-label="Repete"><button type="button" className="press" aria-pressed={yearly} onClick={() => setYearly(true)}>Todos os anos</button><button type="button" className="press" aria-pressed={!yearly} onClick={() => setYearly(false)}>Só uma vez</button></div>
      </div>
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || (kind === 'other' ? 'A NIKKI avisa uma semana antes.' : 'A NIKKI avisa um mês antes.')}</span></p>
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}
