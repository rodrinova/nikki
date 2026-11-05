import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Face } from '@/brand/Face';
import { CountUp } from '@/ui/CountUp';
import { eur, parseAmount, toU } from '@/lib/money';
import { addDays, dayLabel, todayStr } from '@/lib/dates';
import { carNumbers, totals, type SalvageCar, type SalvageLog, type SalvageStatus, type Who } from '@/lib/salvage';
import { Top } from './Home';
import { shortDate } from '@/lib/admin';

// Salvados: só para a administração da app (o Rodrigo). O mecânico regista peças e horas por uma ligação secreta.

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
function quip(x: ReturnType<typeof carNumbers>, c: SalvageCar, partner: string) {
  if (x.roi !== null) {
    if (x.roi >= 0.5) return pick(['Negócio de mestre. Alguém paga o jantar.', `Isto já dá para um polo com o nome do ${partner}.`, 'Comprar barato, vender caro. A teoria funciona.'], c.id);
    if (x.roi >= 0.15) return pick(['Bom negócio. Brinda-se com bifanas.', `O ${partner} merece pelo menos um café.`, 'Lucro honesto, mãos sujas.'], c.id);
    if (x.roi >= 0) return pick(['Ficou ela por ela. Ao menos divertiram-se.', 'Lucro tímido. Mas é lucro.'], c.id);
    return pick(['Este ensinou mais do que rendeu.', 'Prejuízo com estilo. Fica a história.', 'Um carro destes não se esquece. Infelizmente.'], c.id);
  }
  if (x.days > 120) return pick(['Já faz parte da mobília da oficina.', `Já tem nome próprio. Pergunta ao ${partner}.`], c.id);
  if (x.hours >= 20) return pick([`${x.hours.toLocaleString('pt-PT')} horas. O ${partner} já sonha com este carro.`, 'As horas sobem. A paciência desce.'], c.id);
  if (!c.logs.length) return pick(['Acabado de chegar. Ainda cheira a negócio.', 'Página em branco. Que comece a obra.'], c.id);
  return pick(['Em obras. Café a correr.', `Nas mãos do ${partner}. Boas mãos, garante ele.`, 'Mais uma peça e fica como novo. Diz-se sempre.'], c.id);
}
const sign = (u: number) => `${u >= 0 ? '+' : '−'}${eur(Math.abs(u), 0)} €`;

/** Os carros e a ligação do mecânico (do dono). */
function useSalvage() {
  const [cars, setCars] = useState<SalvageCar[] | null>(null);
  const [link, setLink] = useState<{ token: string; partner_name: string } | null>(null);
  const [cfg, setCfg] = useState<{ partner_name: string; hour_rate: number | string }>({ partner_name: 'Pedro', hour_rate: 40 });
  const load = useCallback(async () => {
    const [c, g, l, st] = await Promise.all([
      supabase.from('salvage_cars').select('*').order('bought_on', { ascending: false }),
      supabase.from('salvage_logs').select('*').order('on_date', { ascending: false }),
      supabase.from('salvage_links').select('token, partner_name, revoked_at').is('revoked_at', null).limit(1).maybeSingle(),
      supabase.from('salvage_settings').select('partner_name, hour_rate').maybeSingle(),
    ]);
    if (st.data) setCfg(st.data as { partner_name: string; hour_rate: number | string });
    const logs = (g.data ?? []) as (SalvageLog & { car_id: string })[];
    setCars(((c.data ?? []) as Omit<SalvageCar, 'logs'>[]).map((x) => ({ ...x, logs: logs.filter((y) => y.car_id === x.id) })));
    setLink((l.data as { token: string; partner_name: string } | null) ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { cars, link, cfg, reload: load };
}

const linkUrl = (t: string) => `${location.origin}${(import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')}s/${t}`;

export function Salvage() {
  const { cars, link, cfg, reload } = useSalvage();
  const { open } = useOverlays();
  const today = todayStr();
  const t = useMemo(() => (cars ? totals(cars, today) : null), [cars, today]);
  const partner = cfg.partner_name;
  if (!cars || !t) return <><Top title="Salvados" /><p className="s">A abrir…</p></>;
  return (
    <>
      <Top title="Salvados" right={<button className="tb press" onClick={() => open(<CarSheet rate={cfg.hour_rate} partner={partner} onDone={reload} />)}>+ Carro</button>} />
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
            <Link key={c.id} className="tile salv-car press" to={`/salvados/${c.id}`}>
              <span className="salv-top"><span className="st2"><span>{full(c)}</span>{c.plate && <span className="s">{c.plate}</span>}</span><span className={`pill st-${c.status}`}>{STATUS[c.status]}</span></span>
              {x.profit !== null
                ? <span className="salv-big up">{sign(x.profit)}<small>{pct(x.roi)} · {x.days} dias</small></span>
                : <span className="salv-big">{money(x.cost)}<small>custo até agora · {x.hours.toLocaleString('pt-PT')} h</small></span>}
            </Link>
          );
        })}</div>
      )}
      <button className="tile salv-link press" onClick={() => open(<LinkSheet link={link} onDone={reload} />)}>
        <span className="ic"><Icon n="people" s={20} /></span>
        <span className="st2"><span>{link ? `Ligação do ${partner}` : 'Criar ligação para o mecânico'}</span><span className="s">{link ? 'Peças e horas, sem conta' : 'Ele regista peças e horas, sem conta'}</span></span>
        <Icon n="chev" s={16} />
      </button>
      <button className="tile salv-link press" onClick={() => open(<SettingsSheet cfg={cfg} onDone={reload} />)}>
        <span className="ic"><Icon n="wrench" s={18} /></span>
        <span className="st2"><span>Definições</span><span className="s">{partner} · {eur(toU(cfg.hour_rate), 0)} €/h</span></span>
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
  const { cars, cfg, reload } = useSalvage();
  const { open, toast } = useOverlays();
  const c = cars?.find((x) => x.id === id);
  if (!cars) return <><Top title="Salvados" /><p className="s">A abrir…</p></>;
  if (!c) return <><Top title="Salvados" /><p className="s">Este carro já não existe.</p></>;
  const x = carNumbers(c, todayStr());
  const partner = cfg.partner_name;
  const add = (kind: 'part' | 'hours' | 'transfer') => open(<LogSheet onSave={async (l) => { const { error } = await supabase.from('salvage_logs').insert({ car_id: c.id, ...l }); if (error) return error.message; reload(); return null; }} ownerSide partner={partner} kind={kind} />);
  const row = (k: string, v: number, d: string) => <div key={k}><span className="st2"><span>{k}</span><span className="s">{d}</span></span><span className="v">{v === 0 ? '—' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`}</span></div>;
  const setStatus = async (s: SalvageStatus) => {
    if (s === 'sold') return open(<SellSheet car={c} onDone={reload} />);
    const { error } = await supabase.from('salvage_cars').update({ status: s, sold_on: null, sold_for: null }).eq('id', c.id);
    if (error) toast(error.message); else reload();
  };
  const del = async (l: SalvageLog) => {
    const { error } = await supabase.from('salvage_logs').delete().eq('id', l.id);
    if (error) toast(error.message); else reload();
  };
  return (
    <>
      <Top title={full(c)} right={<button type="button" className="tb press" onClick={() => open(<CarInfoSheet car={c} onDone={reload} />)}>Editar</button>} />
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
      <p className="salv-quip">{quip(x, c, partner)}</p>
      <Account owe={x.owe} partner={partner} big />
      {/* Numa linha, de onde vêm os custos: tocar na compra divide-a. */}
      <div className="salv-strip" role="group" aria-label="Custos">
        <button type="button" className="press" onClick={() => open(<PriceSheet car={c} partner={partner} onDone={reload} />)}><span className="s">Compra</span><b>{money(x.price)}</b></button>
        <span><span className="s">Peças</span><b>{money(x.partsMe + x.partsPartner)}</b></span>
        <span><span className="s">Mão de obra</span><b>{money(x.labor)}</b><span className="s">{x.hours.toLocaleString('pt-PT')} h</span></span>
      </div>
      <button type="button" className="salv-dates press" onClick={() => open(<CarInfoSheet car={c} onDone={reload} />)}>
        <Icon n="cal" s={14} /><span>Comprado a {dt(c.bought_on)}{c.sold_on ? ` · vendido a ${dt(c.sold_on)}` : ''}</span><span className="s">Mudar</span>
      </button>
      <div className="tile card rows salv-break" aria-label="De onde vem">
        {row('Compra', x.parts.fromPrice, 'metade cada um')}
        {row('Peças', x.parts.fromParts, `metade de ${money(x.partsPartner)} que pagou o ${partner}${x.partsMe ? ` e de ${money(x.partsMe)} teus` : ''}`)}
        {row('Horas', x.parts.fromHours, `${x.hours.toLocaleString('pt-PT')} h × ${eur(toU(c.hour_rate) / 2, 0)} € (a tua metade)`)}
        {row('Transferências', x.parts.fromTransfers, x.sentMe || x.sentPartner ? `${money(x.sentMe)} tuas${x.sentPartner ? ` · ${money(x.sentPartner)} do ${partner}` : ''}` : 'ainda nenhuma')}
        {x.sale !== null && row('Venda', x.parts.fromSale, `metade de ${money(x.sale)}, que recebeu ${c.sale_to === 'me' ? 'tu' : `o ${partner}`}`)}
      </div>
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

function Logs({ logs, partner, onDelete }: { logs: SalvageLog[]; partner: string; onDelete?: (l: SalvageLog) => void }) {
  if (!logs.length) return <p className="s">Ainda sem peças nem horas. Está tudo a beber café.</p>;
  return (
    <div className="tile card rows">{logs.map((l) => (
      <div key={l.id}>
        <span className="st2"><span>{l.kind === 'hours' ? `${Number(l.hours).toLocaleString('pt-PT')} h${l.note ? ` · ${l.note}` : ''}` : l.kind === 'transfer' ? 'Transferência' : l.note || 'Peça'}</span><span className="s">{l.kind === 'part' ? '' : `${dayLabel(l.on_date)} · `}{l.kind === 'hours' ? partner : l.kind === 'transfer' ? (l.paid_by === 'me' ? `tu → ${partner}` : `${partner} → tu`) : l.paid_by === 'me' ? 'pagaste tu' : `pagou o ${partner}`}</span></span>
        <span className="v">{l.kind !== 'hours' ? money(toU(l.amount ?? 0)) : ''}{onDelete && <button type="button" className="x-btn press" aria-label="Apagar" onClick={() => onDelete(l)}><Icon n="close" s={16} /></button>}</span>
      </div>
    ))}</div>
  );
}

type NewLog = { kind: 'part' | 'hours' | 'transfer'; amount: string | null; hours: number | null; note: string | null; paid_by: Who; on_date: string };

/** Registar uma peça ou horas: botões grandes, quase sem escrever. */
function LogSheet({ onSave, ownerSide, partner, kind: k0 }: { onSave: (l: NewLog) => Promise<string | null>; ownerSide?: boolean; partner: string; kind: NewLog['kind'] }) {
  const { close, toast } = useOverlays();
  const [kind, setKind] = useState(k0);
  const [amt, setAmt] = useState('');
  const [hrs, setHrs] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState<Who>(ownerSide ? 'me' : 'partner');
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
    const r = await onSave({ kind, amount: a, hours: kind === 'hours' ? hrs : null, note: note.trim() || null, paid_by: kind === 'hours' ? 'partner' : paid, on_date: d });
    if (r) return setErr(r);
    close(); toast(kind === 'part' ? `${note.trim()}: ${eur(toU(a!))} €. ${pick(['Mais uma.', 'Peça a peça.', 'A conta cresce.'])}` : kind === 'transfer' ? `Transferência: ${eur(toU(a!))} €. ${pick(['A amizade agradece.', 'Contas em dia, amigos para sempre.'])}` : `${hrs} h registadas. ${pick(['Mãos de ouro.', 'Suor contabilizado.', 'Isto não se faz sozinho.'])}`, { ok: true });
  }
  const chip = (on: boolean, t: string, f: () => void) => <button type="button" key={t} className="press" aria-pressed={on} onClick={f}>{t}</button>;
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="seg" role="group" aria-label="O quê">{chip(kind === 'part', 'Peça', () => setKind('part'))}{chip(kind === 'hours', 'Horas', () => setKind('hours'))}{ownerSide && chip(kind === 'transfer', 'Transferência', () => { setKind('transfer'); setPaid('me'); })}</div>
      {kind !== 'hours'
        ? <input className="field quick" inputMode="decimal" autoFocus placeholder="0,00 €" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(''); }} aria-label={kind === 'part' ? 'Valor da peça' : 'Valor da transferência'} />
        : <div className="salv-hours" role="group" aria-label="Horas">{[1, 2, 3, 4, 6, 8].map((h) => chip(hrs === h, `${h} h`, () => { setHrs(h); setErr(''); }))}</div>}
      {kind === 'part' && <input className="field" maxLength={80} placeholder="Que peça? (ex.: farol esq. LED Golf VI)" value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} aria-label="Peça" />}
      {kind === 'hours' && <div className="chips wrap" role="group" aria-label="Sugestões">
        {['Chapa', 'Pintura', 'Mecânica', 'Montagem', 'Limpeza'].map((n) => chip(note === n, n, () => setNote(note === n ? '' : n)))}
      </div>}
      {kind === 'transfer' && <div className="seg" role="group" aria-label="Quem transferiu">{chip(paid === 'me', `Transferi ao ${partner}`, () => setPaid('me'))}{chip(paid === 'partner', `O ${partner} transferiu-me`, () => setPaid('partner'))}</div>}
      {kind === 'part' && ownerSide && <div className="seg" role="group" aria-label="Quem pagou">{chip(paid === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paid === 'partner', `Pagou o ${partner}`, () => setPaid('partner'))}</div>}
      {kind === 'hours' && <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}</div>}
      {kind === 'transfer' && <label className="s salv-date">Feita a <input className="field" type="date" max={todayStr()} value={on} onChange={(e) => setOn(e.target.value || todayStr())} /></label>}
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function CarSheet({ onDone, rate, partner }: { onDone: () => void; rate: number | string; partner: string }) {
  const { close, toast } = useOverlays();
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
    const { error } = await supabase.from('salvage_cars').insert({ name: name.trim().slice(0, 60), brand: brand.trim().slice(0, 30) || null, plate: plateOf(plate), price: p, price_me: me, price_paid_by: split === 'partner' ? 'partner' : 'me', hour_rate: rate, bought_on: on });
    if (error) return setErr(error.message);
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
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

/** As datas de compra e de venda (contam para os dias e para o retorno anualizado). */
function CarInfoSheet({ car, onDone }: { car: SalvageCar; onDone: () => void }) {
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
    const { error } = await supabase.from('salvage_cars').update(car.status === 'sold' ? { ...info, sold_on: sv || car.sold_on } : info).eq('id', car.id);
    if (error) return toast(error.message);
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
  const { close, toast } = useOverlays();
  const x = carNumbers(car, todayStr());
  const [mine, setMine] = useState(String((x.priceMe / 100_000).toFixed(2)).replace('.', ','));
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = mine.trim() === '0' || mine.trim() === '0,00' ? '0' : parseAmount(mine);
    if (a === null || toU(a) > x.price) return toast(`Entre 0 e ${money(x.price)}.`);
    const { error } = await supabase.from('salvage_cars').update({ price_me: a }).eq('id', car.id);
    if (error) return toast(error.message);
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
function SettingsSheet({ cfg, onDone }: { cfg: { partner_name: string; hour_rate: number | string }; onDone: () => void }) {
  const { close, toast } = useOverlays();
  const [name, setName] = useState(cfg.partner_name);
  const [rate, setRate] = useState(String(cfg.hour_rate).replace('.', ','));
  async function save(e: FormEvent) {
    e.preventDefault();
    const r = parseAmount(rate);
    if (!name.trim() || !r) return toast('Falta o nome ou o valor por hora.');
    const a = await supabase.from('salvage_settings').upsert({ partner_name: name.trim().slice(0, 40), hour_rate: r, updated_at: new Date().toISOString() });
    if (a.error) return toast(a.error.message);
    await supabase.from('salvage_cars').update({ hour_rate: r }).neq('status', 'sold');
    await supabase.from('salvage_links').update({ partner_name: name.trim().slice(0, 40) }).is('revoked_at', null);
    onDone(); close(); toast('Guardado. Os carros por vender passam a contar com este valor.', { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Definições</p>
      <span className="s">O sócio</span>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do sócio" />
      <span className="s">Valor por hora (metade é tua, metade é o trabalho dele)</span>
      <input className="field quick" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Valor por hora" />
      <div className="chips" role="group" aria-label="Atalhos">{[30, 35, 40, 45, 50].map((v) => <button key={v} type="button" className="press" aria-pressed={rate === String(v)} onClick={() => setRate(String(v))}>{v} €</button>)}</div>
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function SellSheet({ car, onDone }: { car: SalvageCar; onDone: () => void }) {
  const { close, toast } = useOverlays();
  const [v, setV] = useState('');
  const [to, setTo] = useState<Who>('me');
  const [on, setOn] = useState(todayStr());
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = parseAmount(v);
    if (!a) return setErr('Por quanto foi vendido?');
    const { error } = await supabase.from('salvage_cars').update({ status: 'sold', sold_for: a, sold_on: on < car.bought_on ? car.bought_on : on, sale_to: to }).eq('id', car.id);
    if (error) return setErr(error.message);
    onDone(); close(); toast(`${full(car)}: vendido. Hoje há jantar.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Vendido</p>
      <input className="field quick" inputMode="decimal" autoFocus placeholder="Venda · 0 €" value={v} onChange={(e) => setV(e.target.value)} aria-label="Valor da venda" />
      <label className="s salv-date">Vendido a <input className="field" type="date" min={car.bought_on} max={todayStr()} value={on} onChange={(e) => setOn(e.target.value || todayStr())} /></label>
      <div className="seg" role="group" aria-label="Quem recebeu"><button type="button" className="press" aria-pressed={to === 'me'} onClick={() => setTo('me')}>Recebi eu</button><button type="button" className="press" aria-pressed={to === 'partner'} onClick={() => setTo('partner')}>Recebeu o sócio</button></div>
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function LinkSheet({ link, onDone }: { link: { token: string; partner_name: string } | null; onDone: () => void }) {
  const { close, toast } = useOverlays();
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
    const url = linkUrl(link.token), text = `${link.partner_name}, aqui registas as peças e as horas dos salvados:`;
    try { if (navigator.share) { await navigator.share({ title: 'NIKKI · Salvados', text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Ligação copiada.', { ok: true }); } catch { toast(url); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{link ? `Ligação do ${link.partner_name}` : 'Ligação para o mecânico'}</p>
      <p className="s">Abre só esta página, sem conta: escolhe o carro e regista peças e horas.</p>
      {link ? <>
        <button className="btn wide press" onClick={share}>Enviar a ligação <Icon n="arrow" s={20} /></button>
        <button className="btn quiet wide press" onClick={make}>Trocar a ligação <Icon n="arrow" s={20} /></button>
        <button className="back press" onClick={off}>Desligar</button>
      </> : <button className="btn wide press" onClick={make}>Criar ligação <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

/** A página do mecânico (sem conta): os carros por vender, botões grandes para peças e horas, e os seus registos. */
export function SalvageLinkPage() {
  const { token = '' } = useParams();
  const { open } = useOverlays();
  const [v, setV] = useState<{ partner: string; cars: SalvageCar[] } | null | undefined>(undefined);
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('salvage_link_view', { t: token });
    setV((data as { partner: string; cars: SalvageCar[] } | null) ?? null);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  if (v === undefined) return <div className="wait wait-page"><Face h={36} mode="busy" /></div>;
  if (v === null) return <div className="salv-page"><Face h={28} /><p className="l">Esta ligação já não abre.</p><p className="s">Pede uma nova a quem ta enviou.</p></div>;
  const live = v.cars.filter((c) => c.status !== 'sold');
  const car = live.find((c) => c.id === sel) ?? live[0];
  const add = (kind: 'part' | 'hours') => car && open(<LogSheet partner={v.partner} kind={kind} onSave={async (l) => {
    const { error } = await supabase.rpc('salvage_link_add', { t: token, car: car.id, k: l.kind, amt: l.amount, hrs: l.hours, nt: l.note, d: l.on_date });
    if (error) return error.message; load(); return null;
  }} />);
  const x = car ? carNumbers(car, todayStr()) : null;
  return (
    <div className="salv-page">
      <div className="salv-head"><span className="side-tok"><Face h={18} /></span><span className="s">Salvados</span></div>
      <p className="l hello">Olá, {v.partner}.</p>
      <p className="s">{pick(['Hoje é chave inglesa ou chave de fendas?', 'Regista tudo, que o Rodrigo é contabilista de bancada.', 'Cada hora conta. Literalmente.', 'O café não se regista. Ainda.'])}</p>
      {!live.length ? <p className="s">Não há carros na oficina. Férias?</p> : <>
        <div className="chips wrap" role="group" aria-label="Carro">{live.map((c) => <button key={c.id} type="button" className="press" aria-pressed={car?.id === c.id} onClick={() => setSel(c.id)}>{full(c)}{c.plate ? ` · ${c.plate}` : ''}</button>)}</div>
        {x && <div className="salv-grid">
          <span className="tile"><span className="s">Horas</span><b>{x.hours.toLocaleString('pt-PT')} h</b></span>
          <span className="tile"><span className="s">Peças</span><b>{money(x.partsMe + x.partsPartner)}</b></span>
        </div>}
        <div className="salv-actions">
          <button className="tile press" onClick={() => add('hours')}><Icon n="plus" s={22} /><span className="l">Horas</span></button>
          <button className="tile press" onClick={() => add('part')}><Icon n="plus" s={22} /><span className="l">Peça</span></button>
        </div>
        {car && <Logs logs={car.logs} partner={v.partner} onDelete={async (l) => { if (!l.by_link) return; await supabase.rpc('salvage_link_remove', { t: token, log: l.id }); load(); }} />}
      </>}
    </div>
  );
}
