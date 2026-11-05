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

// Salvados: só para a administração da app (o Rodrigo). O mecânico regista peças e horas por uma ligação secreta.

const STATUS: Record<SalvageStatus, string> = { repair: 'Em reparação', selling: 'À venda', sold: 'Vendido' };
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`);
const money = (u: number) => `${eur(u, 0)} €`;
const sign = (u: number) => `${u >= 0 ? '+' : '−'}${eur(Math.abs(u), 0)} €`;

/** Os carros e a ligação do mecânico (do dono). */
function useSalvage() {
  const [cars, setCars] = useState<SalvageCar[] | null>(null);
  const [link, setLink] = useState<{ token: string; partner_name: string } | null>(null);
  const load = useCallback(async () => {
    const [c, g, l] = await Promise.all([
      supabase.from('salvage_cars').select('*').order('bought_on', { ascending: false }),
      supabase.from('salvage_logs').select('*').order('on_date', { ascending: false }),
      supabase.from('salvage_links').select('token, partner_name, revoked_at').is('revoked_at', null).limit(1).maybeSingle(),
    ]);
    const logs = (g.data ?? []) as (SalvageLog & { car_id: string })[];
    setCars(((c.data ?? []) as Omit<SalvageCar, 'logs'>[]).map((x) => ({ ...x, logs: logs.filter((y) => y.car_id === x.id) })));
    setLink((l.data as { token: string; partner_name: string } | null) ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { cars, link, reload: load };
}

const linkUrl = (t: string) => `${location.origin}${(import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')}s/${t}`;

export function Salvage() {
  const { cars, link, reload } = useSalvage();
  const { open } = useOverlays();
  const today = todayStr();
  const t = useMemo(() => (cars ? totals(cars, today) : null), [cars, today]);
  const partner = link?.partner_name ?? 'Pedro';
  if (!cars || !t) return <><Top title="Salvados" /><p className="s">A abrir…</p></>;
  return (
    <>
      <Top title="Salvados" right={<button className="tb press" onClick={() => open(<CarSheet onDone={reload} />)}>+ Carro</button>} />
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
      {!cars.length ? <p className="s">Ainda sem carros. Carrega em «+ Carro».</p> : (
        <div className="salv-list">{cars.map((c) => {
          const x = carNumbers(c, today);
          return (
            <Link key={c.id} className="tile salv-car press" to={`/salvados/${c.id}`}>
              <span className="salv-top"><span>{c.name}</span><span className={`pill st-${c.status}`}>{STATUS[c.status]}</span></span>
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
    </>
  );
}

export function SalvageCarScreen() {
  const { id = '' } = useParams();
  const { cars, link, reload } = useSalvage();
  const { open, toast } = useOverlays();
  const c = cars?.find((x) => x.id === id);
  if (!cars) return <><Top title="Salvados" /><p className="s">A abrir…</p></>;
  if (!c) return <><Top title="Salvados" /><p className="s">Este carro já não existe.</p></>;
  const x = carNumbers(c, todayStr());
  const partner = link?.partner_name ?? 'Pedro';
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
      <Top title={c.name} />
      <div className="seg" role="group" aria-label="Estado">
        {(['repair', 'selling', 'sold'] as SalvageStatus[]).map((s) => <button key={s} type="button" className="press" aria-pressed={c.status === s} onClick={() => setStatus(s)}>{STATUS[s]}</button>)}
      </div>
      <div className="swap">
        {x.profit !== null
          ? <><p className="xl"><CountUp to={x.profit} fmt={(v) => sign(v).replace(' €', '')} /><small>€</small></p><p className="s" style={{ marginTop: 8 }}>Lucro · {pct(x.roi)} · {pct(x.annual)} por ano · {x.days} dias</p></>
          : <><p className="xl"><CountUp to={x.cost} fmt={(v) => eur(v, 0)} /><small>€</small></p><p className="s" style={{ marginTop: 8 }}>Custo até agora · há {x.days} dias</p></>}
      </div>
      <div className="salv-grid">
        <span className="tile"><span className="s">Compra</span><b>{money(x.price)}</b><span className="s">{c.price_paid_by === 'me' ? 'pagaste tu' : `pagou o ${partner}`}</span></span>
        <span className="tile"><span className="s">Peças</span><b>{money(x.partsMe + x.partsPartner)}</b><span className="s">{money(x.partsPartner)} do {partner}</span></span>
        <span className="tile"><span className="s">Horas</span><b>{x.hours.toLocaleString('pt-PT')} h</b><span className="s">{money(x.labor)} a {eur(toU(c.hour_rate), 0)} €/h</span></span>
        {x.sale !== null && <span className="tile"><span className="s">Venda</span><b>{money(x.sale)}</b><span className="s">{dayLabel(c.sold_on!)}</span></span>}
      </div>
      {x.settle ? (
        <section className="tile salv-settle" aria-label="Acerto">
          <span className="s">Acerto</span>
          <p className="l">{x.settle.from === 'me' ? `Pagas ao ${partner} ${money(x.settle.amount)}` : `O ${partner} paga-te ${money(x.settle.amount)}`}</p>
          <p className="s">{partner}: {money(x.moneyPartner)} que meteu + {money(x.labor)} das horas ({money(x.halfLabor)} são a tua metade) + {money(Math.round(x.profit! / 2))} de lucro. Tu: {money(x.moneyMe)} que meteste + {money(Math.round(x.profit! / 2))} de lucro.</p>
        </section>
      ) : x.hours > 0 && <p className="s why"><span className="dot" aria-hidden="true" /><span>Das horas, a tua metade: {money(x.halfLabor)} (entra no acerto, com a venda).</span></p>}
      {c.status !== 'sold' && <div className="save-two">
        <button className="btn quiet press" onClick={() => open(<LogSheet onSave={async (l) => { const { error } = await supabase.from('salvage_logs').insert({ car_id: c.id, ...l }); if (error) return error.message; reload(); return null; }} ownerSide partner={partner} kind="part" />)}>+ Peça</button>
        <button className="btn press" onClick={() => open(<LogSheet onSave={async (l) => { const { error } = await supabase.from('salvage_logs').insert({ car_id: c.id, ...l }); if (error) return error.message; reload(); return null; }} ownerSide partner={partner} kind="hours" />)}>+ Horas</button>
      </div>}
      <Logs logs={c.logs} partner={partner} onDelete={c.status === 'sold' ? undefined : del} />
    </>
  );
}

function Logs({ logs, partner, onDelete }: { logs: SalvageLog[]; partner: string; onDelete?: (l: SalvageLog) => void }) {
  if (!logs.length) return <p className="s">Ainda sem peças nem horas.</p>;
  return (
    <div className="tile card rows">{logs.map((l) => (
      <div key={l.id}>
        <span className="st2"><span>{l.kind === 'hours' ? `${Number(l.hours).toLocaleString('pt-PT')} h${l.note ? ` · ${l.note}` : ''}` : l.note || 'Peça'}</span><span className="s">{dayLabel(l.on_date)} · {l.kind === 'hours' ? partner : l.paid_by === 'me' ? 'pagaste tu' : `pagou o ${partner}`}</span></span>
        <span className="v">{l.kind === 'part' ? money(toU(l.amount ?? 0)) : ''}{onDelete && <button type="button" className="x-btn press" aria-label="Apagar" onClick={() => onDelete(l)}><Icon n="close" s={16} /></button>}</span>
      </div>
    ))}</div>
  );
}

type NewLog = { kind: 'part' | 'hours'; amount: string | null; hours: number | null; note: string | null; paid_by: Who; on_date: string };

/** Registar uma peça ou horas: botões grandes, quase sem escrever. */
function LogSheet({ onSave, ownerSide, partner, kind: k0 }: { onSave: (l: NewLog) => Promise<string | null>; ownerSide?: boolean; partner: string; kind: 'part' | 'hours' }) {
  const { close, toast } = useOverlays();
  const [kind, setKind] = useState(k0);
  const [amt, setAmt] = useState('');
  const [hrs, setHrs] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState<Who>(ownerSide ? 'me' : 'partner');
  const [day, setDay] = useState<'hoje' | 'ontem'>('hoje');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = kind === 'part' ? parseAmount(amt) : null;
    if (kind === 'part' && !a) return setErr('Quanto custou?');
    if (kind === 'hours' && !hrs) return setErr('Quantas horas?');
    const d = day === 'hoje' ? todayStr() : addDays(todayStr(), -1);
    const r = await onSave({ kind, amount: a, hours: kind === 'hours' ? hrs : null, note: note.trim() || null, paid_by: kind === 'hours' ? 'partner' : paid, on_date: d });
    if (r) return setErr(r);
    close(); toast(kind === 'part' ? `Peça: ${eur(toU(a!))} €` : `${hrs} h registadas`, { ok: true });
  }
  const chip = (on: boolean, t: string, f: () => void) => <button type="button" key={t} className="press" aria-pressed={on} onClick={f}>{t}</button>;
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="seg" role="group" aria-label="O quê">{chip(kind === 'part', 'Peça', () => setKind('part'))}{chip(kind === 'hours', 'Horas', () => setKind('hours'))}</div>
      {kind === 'part'
        ? <input className="field quick" inputMode="decimal" autoFocus placeholder="0,00 €" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(''); }} aria-label="Valor da peça" />
        : <div className="salv-hours" role="group" aria-label="Horas">{[1, 2, 3, 4, 6, 8].map((h) => chip(hrs === h, `${h} h`, () => { setHrs(h); setErr(''); }))}</div>}
      <div className="chips wrap" role="group" aria-label="Sugestões">
        {(kind === 'part' ? ['Chapa', 'Pintura', 'Farol', 'Pneus', 'Óleo', 'Para-choques'] : ['Chapa', 'Pintura', 'Mecânica', 'Montagem', 'Limpeza']).map((n) => chip(note === n, n, () => setNote(note === n ? '' : n)))}
      </div>
      {kind === 'part' && ownerSide && <div className="seg" role="group" aria-label="Quem pagou">{chip(paid === 'me', 'Paguei eu', () => setPaid('me'))}{chip(paid === 'partner', `Pagou o ${partner}`, () => setPaid('partner'))}</div>}
      <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}</div>
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function CarSheet({ onDone }: { onDone: () => void }) {
  const { close, toast } = useOverlays();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [paid, setPaid] = useState<Who>('me');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const p = parseAmount(price);
    if (!name.trim()) return setErr('Que carro é? (ex.: Golf VI 2012)');
    if (!p) return setErr('Por quanto foi comprado?');
    const { error } = await supabase.from('salvage_cars').insert({ name: name.trim().slice(0, 60), price: p, price_paid_by: paid, bought_on: todayStr() });
    if (error) return setErr(error.message);
    onDone(); close(); toast(`${name.trim()}: na oficina.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Carro novo</p>
      <input className="field" autoFocus placeholder="Golf VI 2012" value={name} onChange={(e) => setName(e.target.value)} aria-label="Carro" />
      <input className="field quick" inputMode="decimal" placeholder="Compra · 0 €" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Preço de compra" />
      <div className="seg" role="group" aria-label="Quem pagou"><button type="button" className="press" aria-pressed={paid === 'me'} onClick={() => setPaid('me')}>Paguei eu</button><button type="button" className="press" aria-pressed={paid === 'partner'} onClick={() => setPaid('partner')}>Pagou o sócio</button></div>
      {err && <p className="s" style={{ color: 'var(--accent)' }}>{err}</p>}
      <button className="btn wide press">Guardar <Icon n="arrow" s={20} /></button>
    </form>
  );
}

function SellSheet({ car, onDone }: { car: SalvageCar; onDone: () => void }) {
  const { close, toast } = useOverlays();
  const [v, setV] = useState('');
  const [to, setTo] = useState<Who>('me');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const a = parseAmount(v);
    if (!a) return setErr('Por quanto foi vendido?');
    const { error } = await supabase.from('salvage_cars').update({ status: 'sold', sold_for: a, sold_on: todayStr(), sale_to: to }).eq('id', car.id);
    if (error) return setErr(error.message);
    onDone(); close(); toast(`${car.name}: vendido.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Vendido</p>
      <input className="field quick" inputMode="decimal" autoFocus placeholder="Venda · 0 €" value={v} onChange={(e) => setV(e.target.value)} aria-label="Valor da venda" />
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
      {!live.length ? <p className="s">Não há carros na oficina.</p> : <>
        <div className="chips wrap" role="group" aria-label="Carro">{live.map((c) => <button key={c.id} type="button" className="press" aria-pressed={car?.id === c.id} onClick={() => setSel(c.id)}>{c.name}</button>)}</div>
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
