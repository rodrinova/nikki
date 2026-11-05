import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Face } from '@/brand/Face';
import { CountUp } from '@/ui/CountUp';
import { eur, parseAmount, toU } from '@/lib/money';
import { addDays, dayLabel, todayStr } from '@/lib/dates';
import { carNumbers, flipCar, flipPatch, totals, type RegWho, type SalvageCar, type SalvageLog, type SalvageStatus, type Who } from '@/lib/salvage';
import { Top } from './Home';
import { shortDate } from '@/lib/admin';

// Salvados: do Rodrigo (administração da app) e do sócio, o Pedro, que entra por uma ligação curta, sem conta, e vê e
// muda tudo o mesmo. Os dados guardam-se do lado do dono; a página do sócio vê-os ao contrário (flipCar).

const STATUS: Record<SalvageStatus, string> = { repair: 'Em reparação', selling: 'À venda', sold: 'Vendido' };
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`);
const money = (u: number) => `${eur(u, 0)}\u00a0€`;
const dt = (d: string) => shortDate(`${d}T12:00:00`);
/** «Volkswagen Golf VI 2012» (a marca é opcional). */
const full = (c: Pick<SalvageCar, 'name' | 'brand'>) => (c.brand ? `${c.brand} ${c.name}` : c.name);
const tone = (v: number | null) => (v === null || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'pos' : 'neg');
// Humor de oficina (o Rodrigo e o Pedro são amigos): uma frase escolhida pelo dia, para não mudar a cada toque.
const pick = (list: string[], seed = '') => { let h = 0; for (const ch of todayStr() + seed) h = (h * 31 + ch.charCodeAt(0)) | 0; return list[Math.abs(h) % list.length]; };
/** Uma frase curta sobre como está a correr o carro. */
function quip(x: ReturnType<typeof carNumbers>, c: SalvageCar, partner: string, mine = false) {
  // mine: quem vê é o mecânico (a página do sócio).
  if (x.roi !== null) {
    if (x.roi >= 0.5) return pick(['Negócio de mestre. Alguém paga o jantar.', `Isto já dá para um polo com o nome do ${partner}.`, 'Comprar barato, vender caro. A teoria funciona.'], c.id);
    if (x.roi >= 0.15) return pick(['Bom negócio. Brinda-se com bifanas.', mine ? `O ${partner} paga o café. Tu mereces.` : `O ${partner} merece pelo menos um café.`, 'Lucro honesto, mãos sujas.'], c.id);
    if (x.roi >= 0) return pick(['Ficou ela por ela. Ao menos divertiram-se.', 'Lucro tímido. Mas é lucro.'], c.id);
    return pick(['Este ensinou mais do que rendeu.', 'Prejuízo com estilo. Fica a história.', 'Um carro destes não se esquece. Infelizmente.'], c.id);
  }
  if (x.days > 120) return pick(['Já faz parte da mobília da oficina.', mine ? 'Já tem nome próprio. Tu sabes qual.' : `Já tem nome próprio. Pergunta ao ${partner}.`], c.id);
  if (x.hours >= 20) return pick([mine ? `${x.hours.toLocaleString('pt-PT')} horas. Já sonhas com este carro.` : `${x.hours.toLocaleString('pt-PT')} horas. O ${partner} já sonha com este carro.`, 'As horas sobem. A paciência desce.'], c.id);
  if (!c.logs.length) return pick(['Acabado de chegar. Ainda cheira a negócio.', 'Página em branco. Que comece a obra.'], c.id);
  return pick(['Em obras. Café a correr.', mine ? 'Nas tuas mãos. Boas mãos, garantes tu.' : `Nas mãos do ${partner}. Boas mãos, garante ele.`, 'Mais uma peça e fica como novo. Diz-se sempre.'], c.id);
}
const sign = (u: number) => `${u >= 0 ? '+' : '−'}${eur(Math.abs(u), 0)} €`;

type Cfg = { partner_name: string; hour_rate: number | string };
type LinkRow = { token: string; partner_name: string };
type Row = Record<string, unknown>;
type NewLog = { kind: 'part' | 'hours' | 'transfer'; amount: string | null; hours: number | null; note: string | null; paid_by: Who; on_date: string };
/** O que cada lado pode fazer: o dono pelas tabelas, o sócio pela ligação. Tudo do lado de quem vê. */
interface Api {
  side: 'owner' | 'partner';
  base: string;
  load(): Promise<{ cars: SalvageCar[]; cfg: Cfg; link: LinkRow | null; me: string } | null>;
  addCar(row: Row): Promise<string | null>;
  setCar(c: SalvageCar, patch: Row): Promise<string | null>;
  addLog(car: string, l: NewLog): Promise<string | null>;
  removeLog(id: string): Promise<string | null>;
  setCfg(rate: string, partnerName?: string): Promise<string | null>;
}
const msg = (r: { error: { message: string } | null }) => r.error?.message ?? null;

const ownerApi: Api = {
  side: 'owner', base: '/salvados',
  async load() {
    const [c, g, l, st] = await Promise.all([
      supabase.from('salvage_cars').select('*').order('bought_on', { ascending: false }),
      supabase.from('salvage_logs').select('*').is('removed_at', null).order('on_date', { ascending: false }),
      supabase.from('salvage_links').select('token, partner_name, revoked_at').is('revoked_at', null).limit(1).maybeSingle(),
      supabase.from('salvage_settings').select('partner_name, hour_rate').maybeSingle(),
    ]);
    const logs = (g.data ?? []) as (SalvageLog & { car_id: string })[];
    return {
      cars: ((c.data ?? []) as Omit<SalvageCar, 'logs'>[]).map((x) => ({ ...x, logs: logs.filter((y) => y.car_id === x.id) })),
      cfg: (st.data as Cfg | null) ?? { partner_name: 'Pedro', hour_rate: 40 },
      link: (l.data as LinkRow | null) ?? null, me: '',
    };
  },
  addCar: async (row) => msg(await supabase.from('salvage_cars').insert(row)),
  setCar: async (c, patch) => msg(await supabase.from('salvage_cars').update(patch).eq('id', c.id)),
  addLog: async (car, l) => msg(await supabase.from('salvage_logs').insert({ car_id: car, ...l })),
  removeLog: async (id) => msg(await supabase.from('salvage_logs').update({ removed_at: new Date().toISOString() }).eq('id', id)),
  async setCfg(rate, partnerName) {
    const name = (partnerName ?? 'Pedro').trim().slice(0, 40);
    const e = msg(await supabase.from('salvage_settings').upsert({ partner_name: name, hour_rate: rate, updated_at: new Date().toISOString() }));
    if (e) return e;
    await supabase.from('salvage_cars').update({ hour_rate: rate }).neq('status', 'sold');
    await supabase.from('salvage_links').update({ partner_name: name }).is('revoked_at', null);
    return null;
  },
};

/** O lado do sócio: tudo pela ligação, com os dados trocados para o lado dele. */
function linkApi(code: string): Api {
  const go = async (op: string, a: Row) => msg(await supabase.rpc('salvage_link_do', { t: code, op, a }));
  return {
    side: 'partner', base: `/p/${code}`,
    async load() {
      const { data } = await supabase.rpc('salvage_link_view', { t: code });
      const v = data as { partner: string; owner: string | null; rate: number | string; cars: SalvageCar[] } | null;
      if (!v) return null;
      return { cars: v.cars.map(flipCar), cfg: { partner_name: v.owner || 'Rodrigo', hour_rate: v.rate }, link: null, me: v.partner };
    },
    addCar: (row) => go('car_add', flipPatch(row)),
    setCar: (c, patch) => go('car_set', { ...flipPatch(patch, c.price), id: c.id }),
    addLog: (car, l) => go('log_add', { ...flipPatch(l), car_id: car }),
    removeLog: (id) => go('log_remove', { id }),
    setCfg: (rate) => go('rate_set', { hour_rate: rate }),
  };
}
const ApiCtx = createContext<Api>(ownerApi);
const useApi = () => useContext(ApiCtx);

/** Os carros, as definições e a ligação, do lado de quem vê (undefined: a abrir; null: ligação que já não abre). */
function useSalvage() {
  const api = useApi();
  const [v, setV] = useState<Awaited<ReturnType<Api['load']>> | undefined>(undefined);
  const load = useCallback(async () => { setV(await api.load()); }, [api]);
  useEffect(() => { load(); }, [load]);
  return { cars: v ? v.cars : v === null ? null : undefined, cfg: v?.cfg ?? { partner_name: 'Pedro', hour_rate: 40 }, link: v?.link ?? null, me: v?.me ?? '', reload: load };
}

/** O topo: na página do sócio não há NIKKI para onde voltar, só a lista dos carros. */
function STop({ title, right }: { title: string; right?: ReactNode }) {
  const api = useApi();
  const nav = useNavigate();
  const { pathname } = useLocation();
  if (api.side === 'owner') return <Top title={title} right={right} />;
  const atList = pathname.replace(/\/$/, '') === api.base;
  return (
    <>
      {atList ? <div className="salv-head"><span className="side-tok"><Face h={18} /></span><span className="s">NIKKI · Salvados</span></div>
        : <button className="back press" onClick={() => nav(api.base)}><Icon n="back" s={20} /><span>Carros</span></button>}
      <div className="titlebar"><h1 className="l">{title}</h1>{right}</div>
    </>
  );
}
const Gone = () => <div className="salv-page"><Face h={28} /><p className="l">Esta ligação já não abre.</p><p className="s">Pede uma nova ao sócio.</p></div>;

const linkUrl = (t: string) => `${location.origin}${(import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')}p/${t}`;

export function Salvage() {
  const api = useApi();
  const { cars, link, cfg, me, reload } = useSalvage();
  const { open } = useOverlays();
  const today = todayStr();
  const t = useMemo(() => (cars ? totals(cars, today) : null), [cars, today]);
  const partner = cfg.partner_name;
  if (cars === null) return <Gone />;
  if (!cars || !t) return <><STop title="Salvados" /><p className="s">A abrir…</p></>;
  return (
    <>
      <STop title={api.side === 'partner' ? `Olá, ${me}.` : 'Salvados'} right={<button className="tb press" onClick={() => open(<CarSheet rate={cfg.hour_rate} partner={partner} onDone={reload} />)}>+ Carro</button>} />
      {api.side === 'partner' && <p className="salv-quip">{pick(['Hoje é chave inglesa ou chave de fendas?', `Regista tudo, que o ${partner} é contabilista de bancada.`, 'Cada hora conta. Literalmente.', 'O café não se regista. Ainda.', 'Sócios a meias, contas às claras.'])}</p>}
      <section className="tile salv-hero" aria-label="Rentabilidade">
        <span className="s">Lucro dos vendidos · a tua metade</span>
        <span className="hero-n"><CountUp to={t.myProfit} fmt={(v) => eur(v, 0)} /><small>€</small></span>
        <div className="salv-stats">
          <span><b>{pct(t.roi)}</b><span className="s">retorno</span></span>
          <span><b>{pct(t.annual)}</b><span className="s">por ano</span></span>
          <span><b>{t.sold ? t.avgDays : '—'}</b><span className="s">dias até vender</span></span>
        </div>
        {t.open > 0 && <span className="pill">{money(t.invested)} teus em {t.open} {t.open === 1 ? 'carro' : 'carros'} por vender</span>}
      </section>
      <Account owe={t.owe} partner={partner} />
      {!cars.length ? <p className="s">A garagem está vazia e triste. Carrega em «+ Carro».</p> : (
        <div className="salv-list">{cars.map((c) => {
          const x = carNumbers(c, today);
          return (
            <Link key={c.id} className="tile salv-car press" to={`${api.base}/${c.id}`}>
              <span className="salv-top"><span className="st2"><span>{full(c)}</span>{c.plate && <span className="s">{c.plate}</span>}</span><span className={`pill st-${c.status}`}>{STATUS[c.status]}</span></span>
              {x.profit !== null
                ? <span className="salv-big up">{sign(x.profit)}<small>{pct(x.roi)} · {x.days} dias</small></span>
                : <span className="salv-big">{money(x.cost)}<small>custo até agora · {x.hours.toLocaleString('pt-PT')} h</small></span>}
            </Link>
          );
        })}</div>
      )}
      {api.side === 'owner' && <button className="tile salv-link press" onClick={() => open(<LinkSheet link={link} onDone={reload} />)}>
        <span className="ic"><Icon n="people" s={20} /></span>
        <span className="st2"><span>{link ? `Ligação do ${partner}` : 'Criar ligação para o mecânico'}</span><span className="s">{link ? 'A mesma página, sem conta' : 'Vê e muda tudo, sem conta'}</span></span>
        <Icon n="chev" s={16} />
      </button>}
      <button className="tile salv-link press" onClick={() => open(<SettingsSheet cfg={cfg} onDone={reload} />)}>
        <span className="ic"><Icon n="wrench" s={18} /></span>
        <span className="st2"><span>Definições</span><span className="s">{api.side === 'owner' ? `${partner} · ` : ''}{eur(toU(cfg.hour_rate), 0)} €/h</span></span>
        <Icon n="chev" s={16} />
      </button>
    </>
  );
}

/** A conta corrente com o mecânico, numa linha grande: quem deve a quem. */
function Account({ owe, partner, big }: { owe: number; partner: string; big?: boolean }) {
  const even = Math.abs(owe) < 500;
  return (
    <section className={`tile salv-acc${big ? ' big' : ''}`} aria-label="Conta corrente">
      <span className="s">Conta corrente com o {partner}</span>
      <p className="l">{even ? 'Estão quites.' : owe > 0 ? `O ${partner} adiantou mais ${money(owe)}` : `Adiantaste mais ${money(-owe)}`}</p>
      <span className="s">{even ? pick(['A amizade agradece.', 'Contas certas, amizade longa.']) : owe > 0 ? pick([`Transfere antes que ele cobre juros em bifanas.`, `Ele lembra-se de cada cêntimo.`, `O ${partner} está a ser simpático. Por enquanto.`]) : pick([`O ${partner} paga os cafés até acertar.`, 'Ficas com crédito na oficina.'])}</span>
    </section>
  );
}

export function SalvageCarScreen() {
  const { id = '' } = useParams();
  const api = useApi();
  const { cars, cfg, reload } = useSalvage();
  const { open, toast } = useOverlays();
  const c = cars?.find((x) => x.id === id);
  if (cars === null) return <Gone />;
  if (!cars) return <><STop title="Salvados" /><p className="s">A abrir…</p></>;
  if (!c) return <><STop title="Salvados" /><p className="s">Este carro já não existe.</p></>;
  const x = carNumbers(c, todayStr());
  const partner = cfg.partner_name;
  const add = (kind: 'part' | 'hours' | 'transfer') => open(<LogSheet onSave={async (l) => { const e = await api.addLog(c.id, l); if (!e) reload(); return e; }} mechanic={api.side === 'owner' ? 'partner' : 'me'} partner={partner} kind={kind} />);
  const row = (k: string, v: number, d: string) => <div key={k}><span className="st2"><span>{k}</span><span className="s">{d}</span></span><span className="v">{v === 0 ? '—' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`}</span></div>;
  const setStatus = async (s: SalvageStatus) => {
    if (s === 'sold') return open(<SellSheet car={c} partner={partner} onDone={reload} />);
    const e = await api.setCar(c, { status: s, sold_on: null, sold_for: null });
    if (e) toast(e); else reload();
  };
  const del = async (l: SalvageLog) => {
    const e = await api.removeLog(l.id);
    if (e) toast(e); else { reload(); toast('Registo tirado.'); }
  };
  return (
    <>
      <STop title={full(c)} right={<button type="button" className="tb press" onClick={() => open(<CarInfoSheet car={c} onDone={reload} />)}>Editar</button>} />
      {c.plate && <span className="salv-plate">{c.plate}</span>}
      <div className="seg" role="group" aria-label="Estado">
        {(['repair', 'selling', 'sold'] as SalvageStatus[]).map((s) => <button key={s} type="button" className="press" aria-pressed={c.status === s} onClick={() => setStatus(s)}>{STATUS[s]}</button>)}
      </div>
      {/* Custos (compra + peças + mão de obra), retorno (a venda) e lucro; por baixo, as métricas com cor. */}
      <section className="tile salv-sum" aria-label="Resultado">
        <span><span className="s">Custos</span><b><CountUp to={x.cost} fmt={(v) => eur(v, 0)} /> €</b></span>
        <span><span className="s">Retorno</span><b>{x.sale === null ? '—' : money(x.sale)}</b></span>
        <span className={tone(x.profit)}><span className="s">Lucro</span><b>{x.profit === null ? '—' : sign(x.profit)}</b></span>
      </section>
      <div className="salv-metrics" aria-label="Métricas">
        {x.profit !== null ? <>
          <span className={tone(x.roi)}><b>{pct(x.roi)}</b> retorno</span>
          <span className={tone(x.annual)}><b>{pct(x.annual)}</b> por ano</span>
          <span className={tone(x.profit)}><b>{sign(Math.round(x.profit / 2))}</b> teus</span>
          <span><b>{x.days}</b> {x.days === 1 ? 'dia' : 'dias'}</span>
        </> : <>
          <span><b>{x.days}</b> {x.days === 1 ? 'dia' : 'dias'}</span>
          <span><b>{money(x.cost)}</b> para empatar</span>
          {x.cost > 0 && <span className="pos"><b>{money(Math.round(x.cost * 1.2))}</b> para +20%</span>}
        </>}
      </div>
      <p className="salv-quip">{quip(x, c, partner, api.side === 'partner')}</p>
      <Account owe={x.owe} partner={partner} big />
      {/* Numa linha, de onde vêm os custos: tocar na compra divide-a. */}
      <div className="salv-strip" role="group" aria-label="Custos">
        <button type="button" className="press" onClick={() => open(<PriceSheet car={c} partner={partner} onDone={reload} />)}><span className="s">Compra</span><b>{money(x.price)}</b></button>
        <button type="button" className="press" onClick={() => open(<RegSheet car={c} partner={partner} onDone={reload} />)}><span className="s">Registo</span><b>{x.reg ? money(x.reg) : '+'}</b></button>
        <span><span className="s">Peças</span><b>{money(x.partsMe + x.partsPartner)}</b></span>
        <span><span className="s">Obra</span><b>{money(x.labor)}</b><span className="s">{x.hours.toLocaleString('pt-PT')} h</span></span>
      </div>
      <button type="button" className="salv-dates press" onClick={() => open(<CarInfoSheet car={c} onDone={reload} />)}>
        <Icon n="cal" s={14} /><span>Comprado a {dt(c.bought_on)}{c.sold_on ? ` · vendido a ${dt(c.sold_on)}` : ''}</span><span className="s">Mudar</span>
      </button>
      <details className="salv-why">
        <summary className="press">De onde vem a conta corrente</summary>
        <div className="tile card rows salv-break" aria-label="De onde vem">
        {row('Compra', x.parts.fromPrice, x.priceMe * 2 === x.price ? 'metade cada um' : `pagaste ${money(x.priceMe)} de ${money(x.price)}`)}
        {x.reg > 0 && row('Registo', x.parts.fromReg, regWho(c.reg_paid_by, partner))}
        {row('Peças', x.parts.fromParts, x.partsMe || x.partsPartner ? `metade de ${[x.partsPartner ? `${money(x.partsPartner)} do ${partner}` : '', x.partsMe ? `${money(x.partsMe)} teus` : ''].filter(Boolean).join(' e ')}` : 'ainda nenhuma')}
        {row('Horas', x.parts.fromHours, `metade de ${x.hours.toLocaleString('pt-PT')} h × ${eur(toU(c.hour_rate), 0)} €/h`)}
        {row('Transferências', x.parts.fromTransfers, x.sentMe || x.sentPartner ? `${money(x.sentMe)} tuas${x.sentPartner ? ` · ${money(x.sentPartner)} do ${partner}` : ''}` : 'ainda nenhuma')}
        {x.sale !== null && row('Venda', x.parts.fromSale, `metade de ${money(x.sale)}, que recebeu ${c.sale_to === 'me' ? 'tu' : `o ${partner}`}`)}
        </div>
      </details>
      {c.status !== 'sold' && <div className="salv-add">
        <button className="btn quiet press" onClick={() => add('part')}>+ Peça</button>
        <button className="btn quiet press" onClick={() => add('hours')}>+ Horas</button>
        <button className="btn press" onClick={() => add('transfer')}>+ Transferência</button>
      </div>}
      {c.status === 'sold' && Math.abs(x.owe) >= 500 && <button className="btn wide press" onClick={() => add('transfer')}>Registar o acerto <Icon n="arrow" s={20} /></button>}
      <Logs logs={c.logs} partner={partner} onDelete={c.status === 'sold' ? undefined : del} />
    </>
  );
}

/** Os registos, cada tipo na sua lista: peças (o que se comprou), horas e transferências entre os dois. */
function Logs({ logs, partner, onDelete }: { logs: SalvageLog[]; partner: string; onDelete?: (l: SalvageLog) => void }) {
  if (!logs.length) return <p className="s">Ainda sem peças nem horas. Está tudo a beber café.</p>;
  const of = (k: SalvageLog['kind']) => logs.filter((l) => l.kind === k);
  const parts = of('part'), hours = of('hours'), sent = of('transfer');
  const x = (l: SalvageLog) => onDelete && <button type="button" className="x-btn press" aria-label="Tirar" onClick={() => onDelete(l)}><Icon n="close" s={14} /></button>;
  const sum = (ls: SalvageLog[]) => ls.reduce((t, l) => t + toU(l.amount ?? 0), 0);
  const list = (title: string, total: string, ls: SalvageLog[], line: (l: SalvageLog) => [string, string, string]) => ls.length > 0 && (
    <section className="salv-log" aria-label={title}>
      <p className="salv-log-h"><span>{title}</span><span>{total}</span></p>
      <div className="tile card">{ls.map((l) => { const [a, sub, v] = line(l); return (
        <div key={l.id} className="salv-log-r"><span className="st2"><span>{a}</span>{sub && <span className="s">{sub}</span>}</span><span className="v">{v}{x(l)}</span></div>
      ); })}</div>
    </section>
  );
  const who = (w: Who) => (w === 'me' ? 'tu' : partner);
  return <>
    {list('Peças', money(sum(parts)), parts, (l) => [l.note || 'Peça', l.paid_by === 'me' ? 'pagaste tu' : `pagou o ${partner}`, money(toU(l.amount ?? 0))])}
    {list('Horas', `${hours.reduce((t, l) => t + Number(l.hours ?? 0), 0).toLocaleString('pt-PT')} h`, hours, (l) => [l.note || 'Trabalho', `${dayLabel(l.on_date)} · ${who(l.paid_by)}`, `${Number(l.hours).toLocaleString('pt-PT')} h`])}
    {list('Transferências', money(sum(sent)), sent, (l) => [l.paid_by === 'me' ? `Tu → ${partner}` : `${partner} → tu`, dayLabel(l.on_date), money(toU(l.amount ?? 0))])}
  </>;
}

/** Registar uma peça ou horas: botões grandes, quase sem escrever. */
function LogSheet({ onSave, mechanic, partner, kind: k0 }: { onSave: (l: NewLog) => Promise<string | null>; mechanic: Who; partner: string; kind: NewLog['kind'] }) {
  const { close, toast } = useOverlays();
  const [kind, setKind] = useState(k0);
  const [amt, setAmt] = useState('');
  const [hrs, setHrs] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState<Who>('me');
  const [day, setDay] = useState<'hoje' | 'ontem'>('hoje');
  const [on, setOn] = useState(todayStr());
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = kind !== 'hours' ? parseAmount(amt) : null;
    if (kind !== 'hours' && !a) return setErr(kind === 'part' ? 'Quanto custou?' : 'Quanto foi?');
    if (kind === 'hours' && !hrs) return setErr('Quantas horas?');
    if (kind === 'part' && !note.trim()) return setErr('Que peça?');
    // As peças ficam com o dia do registo; as horas, hoje ou ontem; as transferências, o dia em que foram feitas.
    const d = kind === 'transfer' ? on : kind === 'hours' && day === 'ontem' ? addDays(todayStr(), -1) : todayStr();
    const r = await onSave({ kind, amount: a, hours: kind === 'hours' ? hrs : null, note: note.trim() || null, paid_by: kind === 'hours' ? mechanic : paid, on_date: d });
    if (r) return setErr(r);
    close(); toast(kind === 'part' ? `${note.trim()}: ${eur(toU(a!))} €. ${pick(['Mais uma.', 'Peça a peça.', 'A conta cresce.'])}` : kind === 'transfer' ? `Transferência: ${eur(toU(a!))} €. ${pick(['A amizade agradece.', 'Contas em dia, amigos para sempre.'])}` : `${hrs} h registadas. ${pick(['Mãos de ouro.', 'Suor contabilizado.', 'Isto não se faz sozinho.'])}`, { ok: true });
  }
  const chip = (on: boolean, t: string, f: () => void) => <button type="button" key={t} className="press" aria-pressed={on} onClick={f}>{t}</button>;
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="seg" role="group" aria-label="O quê">{chip(kind === 'part', 'Peça', () => setKind('part'))}{chip(kind === 'hours', 'Horas', () => setKind('hours'))}{chip(kind === 'transfer', 'Transferência', () => { setKind('transfer'); setPaid('me'); })}</div>
      {kind !== 'hours'
        ? <input className="field quick" inputMode="decimal" autoFocus placeholder="0,00 €" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(''); }} aria-label={kind === 'part' ? 'Valor da peça' : 'Valor da transferência'} />
        : <div className="salv-hours" role="group" aria-label="Horas">{[1, 2, 3, 4, 6, 8].map((h) => chip(hrs === h, `${h} h`, () => { setHrs(h); setErr(''); }))}</div>}
      {kind === 'part' && <input className="field" maxLength={80} placeholder="Que peça? (ex.: farol esq. LED Golf VI)" value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} aria-label="Peça" />}
      {kind === 'hours' && <div className="chips wrap" role="group" aria-label="Sugestões">
        {['Chapa', 'Pintura', 'Mecânica', 'Montagem', 'Limpeza'].map((n) => chip(note === n, n, () => setNote(note === n ? '' : n)))}
      </div>}
      {kind === 'transfer' && <div className="seg" role="group" aria-label="Quem transferiu">{chip(paid === 'me', `Transferi ao ${partner}`, () => setPaid('me'))}{chip(paid === 'partner', `O ${partner} transferiu-me`, () => setPaid('partner'))}</div>}
      {kind === 'part' && <div className="seg" role="group" aria-label="Quem pagou">{chip(paid === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paid === 'partner', `Pagou o ${partner}`, () => setPaid('partner'))}</div>}
      {kind === 'hours' && <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}</div>}
      {kind === 'transfer' && <label className="s salv-date">Feita a <input className="field" type="date" max={todayStr()} value={on} onChange={(e) => setOn(e.target.value || todayStr())} /></label>}
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function CarSheet({ onDone, rate, partner }: { onDone: () => void; rate: number | string; partner: string }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const [reg, setReg] = useState('');
  const [regBy, setRegBy] = useState<RegWho>('half');
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [price, setPrice] = useState('');
  const [split, setSplit] = useState<'half' | 'me' | 'partner'>('half');
  const [on, setOn] = useState(todayStr());
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const p = parseAmount(price);
    if (!name.trim()) return setErr('Que modelo é? (ex.: Golf VI 2012)');
    if (!p) return setErr('Por quanto foi comprado?');
    const me = split === 'half' ? null : split === 'me' ? p : '0';
    const r = reg.trim() ? parseAmount(reg) : null;
    if (reg.trim() && !r) return setErr('O registo não parece um valor.');
    const error = await api.addCar({ name: name.trim().slice(0, 60), brand: brand.trim().slice(0, 30) || null, plate: plateOf(plate), price: p, price_me: me, price_paid_by: split === 'partner' ? 'partner' : 'me', hour_rate: rate, bought_on: on, reg_cost: r, reg_paid_by: regBy });
    if (error) return setErr(error);
    onDone(); close(); toast(`${full({ name: name.trim(), brand: brand.trim() })}: na oficina. Que comece a aventura.`, { ok: true });
  }
  const chip = (on: boolean, t: string, f: () => void) => <button type="button" key={t} className="press" aria-pressed={on} onClick={f}>{t}</button>;
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Carro novo</p>
      <div className="salv-two">
        <input className="field" autoFocus placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca" />
        <input className="field" placeholder="Modelo (Golf VI 2012)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Modelo" />
      </div>
      <input className="field" placeholder="Matrícula (AA-00-BB)" autoCapitalize="characters" value={plate} onChange={(e) => setPlate(e.target.value)} aria-label="Matrícula" />
      <input className="field quick" inputMode="decimal" placeholder="Compra · 0 €" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Preço de compra" />
      <label className="s salv-date">Comprado a <input className="field" type="date" max={todayStr()} value={on} onChange={(e) => setOn(e.target.value || todayStr())} /></label>
      <div className="seg" role="group" aria-label="Quem pagou">{chip(split === 'half', 'A meias', () => setSplit('half'))}{chip(split === 'me', 'Paguei eu', () => setSplit('me'))}{chip(split === 'partner', `Pagou o ${partner}`, () => setSplit('partner'))}</div>
      <input className="field" inputMode="decimal" placeholder="Registo · 0 € (se já se sabe)" value={reg} onChange={(e) => setReg(e.target.value)} aria-label="Custo do registo" />
      {reg.trim() && <div className="seg" role="group" aria-label="Quem pagou o registo">{chip(regBy === 'half', 'A meias', () => setRegBy('half'))}{chip(regBy === 'me', 'Paguei eu', () => setRegBy('me'))}{chip(regBy === 'partner', `Pagou o ${partner}`, () => setRegBy('partner'))}</div>}
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

/** As datas de compra e de venda (contam para os dias e para o retorno anualizado). */
function CarInfoSheet({ car, onDone }: { car: SalvageCar; onDone: () => void }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const [brand, setBrand] = useState(car.brand ?? '');
  const [name, setName] = useState(car.name);
  const [plate, setPlate] = useState(car.plate ?? '');
  const [b, setB] = useState(car.bought_on);
  const [sv, setSv] = useState(car.sold_on ?? '');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast('Falta o modelo.');
    if (sv && sv < b) return toast('A venda não pode ser antes da compra.');
    const info = { name: name.trim().slice(0, 60), brand: brand.trim().slice(0, 30) || null, plate: plateOf(plate), bought_on: b };
    const error = await api.setCar(car, car.status === 'sold' ? { ...info, sold_on: sv || car.sold_on } : info);
    if (error) return toast(error);
    onDone(); close(); toast('Guardado.', { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">O carro</p>
      <div className="salv-two">
        <input className="field" placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca" />
        <input className="field" placeholder="Modelo" value={name} onChange={(e) => setName(e.target.value)} aria-label="Modelo" />
      </div>
      <input className="field" placeholder="Matrícula (AA-00-BB)" autoCapitalize="characters" value={plate} onChange={(e) => setPlate(e.target.value)} aria-label="Matrícula" />
      <label className="s salv-date">Comprado a <input className="field" type="date" max={todayStr()} value={b} onChange={(e) => setB(e.target.value || b)} /></label>
      {car.status === 'sold' && <label className="s salv-date">Vendido a <input className="field" type="date" min={b} max={todayStr()} value={sv} onChange={(e) => setSv(e.target.value)} /></label>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

/** A matrícula em maiúsculas, sem espaços a mais (ou nada). */
const plateOf = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 12) || null;

/** Quanto pagou cada um da compra (por omissão, metade). */
function PriceSheet({ car, partner, onDone }: { car: SalvageCar; partner: string; onDone: () => void }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const x = carNumbers(car, todayStr());
  const [mine, setMine] = useState(String((x.priceMe / 100_000).toFixed(2)).replace('.', ','));
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = mine.trim() === '0' || mine.trim() === '0,00' ? '0' : parseAmount(mine);
    if (a === null || toU(a) > x.price) return toast(`Entre 0 e ${money(x.price)}.`);
    const error = await api.setCar(car, { price_me: a });
    if (error) return toast(error);
    onDone(); close(); toast('Guardado.', { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Compra · {money(x.price)}</p>
      <span className="s">Quanto pagaste tu (o resto foi do {partner})</span>
      <input className="field quick" inputMode="decimal" autoFocus value={mine} onChange={(e) => setMine(e.target.value)} aria-label="Quanto pagaste" />
      <div className="chips" role="group" aria-label="Atalhos">
        {[['Metade', x.price / 2], ['Tudo', x.price], ['Nada', 0]].map(([l, v]) => <button key={l as string} type="button" className="press" onClick={() => setMine(((v as number) / 100_000).toFixed(2).replace('.', ','))}>{l as string}</button>)}
      </div>
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

/** Definições dos salvados: o nome do sócio e o valor/hora (vale para os carros ainda por vender). */
function SettingsSheet({ cfg, onDone }: { cfg: Cfg; onDone: () => void }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const [name, setName] = useState(cfg.partner_name);
  const [rate, setRate] = useState(String(cfg.hour_rate).replace('.', ','));
  async function save(e: FormEvent) {
    e.preventDefault();
    const r = parseAmount(rate);
    if (!name.trim() || !r) return toast('Falta o nome ou o valor por hora.');
    const bad = await api.setCfg(r, api.side === 'owner' ? name : undefined);
    if (bad) return toast(bad);
    onDone(); close(); toast('Guardado. Os carros por vender passam a contar com este valor.', { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Definições</p>
      {api.side === 'owner' && <><span className="s">O sócio</span>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do sócio" /></>}
      <span className="s">Valor por hora do mecânico (conta metade a cada um)</span>
      <input className="field quick" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Valor por hora" />
      <div className="chips" role="group" aria-label="Atalhos">{[30, 35, 40, 45, 50].map((v) => <button key={v} type="button" className="press" aria-pressed={rate === String(v)} onClick={() => setRate(String(v))}>{v} €</button>)}</div>
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function SellSheet({ car, partner, onDone }: { car: SalvageCar; partner: string; onDone: () => void }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const [v, setV] = useState('');
  const [to, setTo] = useState<Who>('me');
  const [on, setOn] = useState(todayStr());
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = parseAmount(v);
    if (!a) return setErr('Por quanto foi vendido?');
    const error = await api.setCar(car, { status: 'sold', sold_for: a, sold_on: on < car.bought_on ? car.bought_on : on, sale_to: to });
    if (error) return setErr(error);
    onDone(); close(); toast(`${full(car)}: vendido. Hoje há jantar.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Vendido</p>
      <input className="field quick" inputMode="decimal" autoFocus placeholder="Venda · 0 €" value={v} onChange={(e) => setV(e.target.value)} aria-label="Valor da venda" />
      <label className="s salv-date">Vendido a <input className="field" type="date" min={car.bought_on} max={todayStr()} value={on} onChange={(e) => setOn(e.target.value || todayStr())} /></label>
      <div className="seg" role="group" aria-label="Quem recebeu"><button type="button" className="press" aria-pressed={to === 'me'} onClick={() => setTo('me')}>Recebi eu</button><button type="button" className="press" aria-pressed={to === 'partner'} onClick={() => setTo('partner')}>Recebeu o {partner}</button></div>
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function LinkSheet({ link, onDone }: { link: { token: string; partner_name: string } | null; onDone: () => void }) {
  const { close, toast } = useOverlays();
  const nav = useNavigate();
  const make = async () => {
    if (link) await supabase.from('salvage_links').update({ revoked_at: new Date().toISOString() }).eq('token', link.token);
    const { error } = await supabase.from('salvage_links').insert({ partner_name: link?.partner_name ?? 'Pedro' });
    if (error) return toast(error.message);
    onDone(); close(); toast(link ? 'Ligação nova. A antiga deixou de abrir.' : 'Ligação criada.', { ok: true });
  };
  const off = async () => {
    if (!link) return;
    const { error } = await supabase.from('salvage_links').update({ revoked_at: new Date().toISOString() }).eq('token', link.token);
    if (error) return toast(error.message);
    onDone(); close(); toast('Ligação desligada.');
  };
  const share = async () => {
    if (!link) return;
    const url = linkUrl(link.token), text = `${link.partner_name}, a nossa página dos salvados (a mesma que a minha):`;
    try { if (navigator.share) { await navigator.share({ title: 'NIKKI · Salvados', text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Ligação copiada.', { ok: true }); } catch { toast(url); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{link ? `Ligação do ${link.partner_name}` : 'Ligação para o mecânico'}</p>
      <p className="s">A mesma página que a tua, sem conta: carros, contas, peças, horas e transferências.</p>
      {link ? <>
        <button className="btn wide press" onClick={share}>Enviar a ligação <Icon n="arrow" s={20} /></button>
        <p className="s salv-url">{linkUrl(link.token).replace(/^https?:\/\//, '')}</p>
        <button className="btn quiet wide press" onClick={() => { close(); nav(`/p/${link.token}`); }}>Ver como o {link.partner_name} vê <Icon n="arrow" s={20} /></button>
        <button className="btn quiet wide press" onClick={make}>Trocar a ligação <Icon n="arrow" s={20} /></button>
        <button className="back press" onClick={off}>Desligar</button>
      </> : <button className="btn wide press" onClick={make}>Criar ligação <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

/** A página do sócio (sem conta): a mesma que a do dono, vista do lado dele. Abre por /p/<código> (e as antigas /s/). */
export function SalvageLinkPage() {
  const { code = '', token = '', id } = useParams();
  const api = useMemo(() => linkApi(code || token), [code, token]);
  return <ApiCtx.Provider value={api}>{id ? <SalvageCarScreen /> : <Salvage />}</ApiCtx.Provider>;
}

/** Quem pagou o registo, numa frase. */
const regWho = (w: RegWho | undefined, partner: string) => (!w || w === 'half' ? 'a meias' : w === 'me' ? 'pagaste tu' : `pagou o ${partner}`);

/** O registo do carro: quanto foi e quem pagou. */
function RegSheet({ car, partner, onDone }: { car: SalvageCar; partner: string; onDone: () => void }) {
  const api = useApi();
  const { close, toast } = useOverlays();
  const [v, setV] = useState(car.reg_cost ? String(car.reg_cost).replace('.', ',') : '');
  const [by, setBy] = useState<RegWho>(car.reg_paid_by ?? 'half');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = v.trim() ? parseAmount(v) : null;
    if (v.trim() && !a) return toast('Não parece um valor.');
    const error = await api.setCar(car, { reg_cost: a, reg_paid_by: by });
    if (error) return toast(error);
    onDone(); close(); toast(a ? `Registo: ${eur(toU(a))} €. Papelada paga, carro legal.` : 'Sem registo.', { ok: true });
  }
  const chip = (on: boolean, t: string, f: () => void) => <button type="button" key={t} className="press" aria-pressed={on} onClick={f}>{t}</button>;
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Registo do carro</p>
      <input className="field quick" inputMode="decimal" autoFocus placeholder="0,00 €" value={v} onChange={(e) => setV(e.target.value)} aria-label="Custo do registo" />
      <div className="seg" role="group" aria-label="Quem pagou">{chip(by === 'half', 'A meias', () => setBy('half'))}{chip(by === 'me', 'Paguei eu', () => setBy('me'))}{chip(by === 'partner', `Pagou o ${partner}`, () => setBy('partner'))}</div>
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}
