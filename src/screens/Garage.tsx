import { useRef, useState, type FormEvent } from 'react';
import { DEMO, supabase } from '@/lib/supabase';
import { readFuel, readOdometer } from '@/lib/fuel';
import { imagesText } from '@/lib/ocr';
import { useSession } from '@/data/session';
import { useHouse, type CarRow, type DeadlineRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { eur, parseAmount, toU } from '@/lib/money';
import { addDays, monthName, todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { anniversary, iucDue, nextYear, paymentKind, yearlyInsurance, type CarLog } from '@/lib/garage';

// Garagem: carros da casa ou de cada um, consumo de cheio a cheio, km, €/km, prazos (IUC e seguro com um mês de
// antecedência) e o que está a rever. Regras em docs/CALCULOS.md, secção 5.

export const km = (n: number) => `${n.toLocaleString('pt-PT').replace(/ |,/g, ' ')} km`;
export const dt = (d: string) => shortDate(`${d}T12:00:00`);
export const electric = (c: CarRow) => c.energy === 'eletrico';

/** O que a despesa de um carro faz às contas: carro dos dois → partilhada; teu → só tua; do outro → toda dele. */
function useCarSplit() {
  const { me, partner, myShare } = useSession();
  return (car: CarRow) => {
    if (!partner || car.owner_id === me?.id) return { split: 'mine', other_id: null, payer_share: null };
    if (car.owner_id === null) return { split: 'shared', other_id: partner.id, payer_share: myShare };
    return { split: 'other', other_id: partner.id, payer_share: null };
  };
}

/** Prazos que a NIKKI cria sozinha a partir dos dados do carro: IUC (mês da matrícula) e seguro (renovação), um mês antes. */
export function useCarDeadlines() {
  const { me, house } = useSession();
  const { deadlines } = useHouse();
  // paidOn: a partir de um pagamento acabado de fazer, o próximo prazo é o do ano seguinte.
  return async (car: CarRow, paidOn?: string) => {
    const open = (kind: string) => deadlines.rows.some((d) => d.car_id === car.id && d.kind === kind && !d.paid_at);
    const today = todayStr(), rows = [];
    const iucFrom = paidOn ? `${nextYear(paidOn).slice(0, 7)}-01` : today, insFrom = paidOn ? addDays(paidOn, 1) : today;
    // Os elétricos estão isentos de IUC.
    if (car.registered_on && !electric(car) && !open('iuc')) rows.push({ kind: 'iuc', title: `IUC do ${car.name}`, due_on: iucDue(car.registered_on, iucFrom), amount: Number(car.annual_tax) || null });
    if (car.insurance_renews_on && !open('insurance')) rows.push({ kind: 'insurance', title: `Seguro do ${car.name}${car.insurer ? ` (${car.insurer})` : ''}`, due_on: anniversary(car.insurance_renews_on, insFrom), amount: Number(car.annual_insurance) || null });
    if (!rows.length) return;
    await supabase.from('deadlines').insert(rows.map((r) => ({ ...r, household_id: house!.id, car_id: car.id, recurrence: 'yearly', remind_days: 30, created_by: me!.id })));
    deadlines.reload();
  };
}

/**
 * Aprender com um pagamento: se a nota diz que é o IUC ou o seguro (ex.: «IUC», «Fidelidade») e o carro ainda não
 * tem esses dados, ficam o mês, a data e o valor, para avisar a tempo no ano seguinte. Devolve a frase a dizer.
 */
export function useLearnFromPayment() {
  const { cars } = useHouse();
  const ensure = useCarDeadlines();
  return async (carOrNote: { car?: CarRow; note: string }, amount: number, on: string): Promise<string | null> => {
    const kind = paymentKind(carOrNote.note);
    if (!kind) return null;
    const active = cars.rows.filter((c) => !c.archived);
    const car = carOrNote.car ?? active.find((c) => carOrNote.note.toLowerCase().includes(c.name.toLowerCase())) ?? (active.length === 1 ? active[0] : undefined);
    if (!car) return null;
    const patch: Partial<CarRow> = {};
    if (kind === 'iuc') {
      if (!car.registered_on) patch.registered_on = `${on.slice(0, 7)}-01`;
      if (!Number(car.annual_tax)) patch.annual_tax = (amount / 100_000).toFixed(2);
    } else {
      if (!car.insurance_renews_on) patch.insurance_renews_on = on;
      if (!Number(car.annual_insurance)) patch.annual_insurance = (yearlyInsurance(amount) / 100_000).toFixed(2);
    }
    if (!Object.keys(patch).length) return null;
    await supabase.from('cars').update(patch).eq('id', car.id);
    await ensure({ ...car, ...patch }, on);
    cars.reload();
    return kind === 'iuc'
      ? `Percebi: é o IUC do ${car.name}. Fica o mês (${monthName(on.slice(0, 7))}) e o valor, e a NIKKI avisa um mês antes.`
      : `Percebi: é o seguro do ${car.name}. Fica a data de renovação e o valor; um mês antes, a NIKKI lembra que é altura de renegociar.`;
  };
}

const KIND: Record<CarLog['kind'], string> = { fuel: 'Abastecer', charge: 'Carregar', service: 'Oficina', toll: 'Portagens', other: 'Outra despesa' };
export const LOGNAME: Record<CarLog['kind'], string> = { fuel: 'Abastecimento', charge: 'Carregamento', service: 'Oficina', toll: 'Portagens', other: 'Outra' };

/** Os campos de um registo do carro (tipo, litros, km, cheio ou parcial), partilhados pela Garagem e pelo «+». */
export interface CarEntry { kind: CarLog['kind']; litres: string; odo: string; full: boolean }
export const carEntry = (car: CarRow, kind?: CarLog['kind']): CarEntry => ({ kind: kind ?? (electric(car) ? 'charge' : 'fuel'), litres: '', odo: '', full: true });
export const lastOdometer = (logs: CarLog[], car: CarRow) => logs.filter((l) => l.car_id === car.id && l.odometer !== null).reduce<number | null>((m, l) => Math.max(m ?? 0, l.odometer!), null);

/** Valida os litros e os km; devolve o erro a mostrar ou os números a gravar. */
export function checkEntry(car: CarRow, f: CarEntry, last: number | null): string | { litres: number | null; odometer: number | null } {
  const l = f.kind === 'fuel' && f.litres.trim() ? Number(f.litres.replace(',', '.')) : null;
  if (f.kind === 'fuel' && (l === null || !(l > 0) || l > 200)) return 'Quantos litros? (está no talão)';
  if (l !== null && car.tank_litres && l > Number(car.tank_litres) * 1.05) return `${l} L não cabem num depósito de ${car.tank_litres} L.`;
  const o = f.odo.trim() && hasOdo(f.kind) ? Number(f.odo.replace(/\D/g, '')) : null;
  if (o !== null && last !== null && o < last) return `Os km não podem ser menos do que no último registo (${km(last)}).`;
  return { litres: l, odometer: o };
}
const hasOdo = (k: CarLog['kind']) => k === 'fuel' || k === 'charge' || k === 'service';

/** Grava o registo do carro ligado à despesa (com o valor, para os dois verem a Garagem igual). */
export function useSaveCarLog() {
  const { me, house } = useSession();
  return (car: CarRow, f: CarEntry, n: { litres: number | null; odometer: number | null }, expense_id: string, amount: string, logged_on: string, note: string) =>
    supabase.from('car_logs').insert({ household_id: house!.id, car_id: car.id, logged_on, odometer: n.odometer, litres: n.litres, full_tank: f.kind === 'fuel' ? f.full : true, kind: f.kind, expense_id, amount, note: note.trim() || null, created_by: me!.id });
}

export function CarEntryFields({ car, f, set, last, pickKind, onAmount }: { car: CarRow; f: CarEntry; set: (f: CarEntry) => void; last: number | null; pickKind?: boolean; onAmount?: (v: number) => void }) {
  const kinds: CarLog['kind'][] = [electric(car) ? 'charge' : 'fuel', 'service', 'toll', 'other'];
  return (
    <>
      {pickKind && <div className="seg" role="group" aria-label="Que despesa">{kinds.map((k) => <button key={k} type="button" className="press" aria-pressed={f.kind === k} onClick={() => set({ ...f, kind: k })}>{k === 'other' ? 'Outra' : KIND[k]}</button>)}</div>}
      {(f.kind === 'fuel' || f.kind === 'charge') && <FuelPhotos f={f} set={set} last={last} onAmount={onAmount} />}
      {(f.kind === 'fuel' || hasOdo(f.kind)) && <div className="two">
        {f.kind === 'fuel' && <label>Litros<input inputMode="decimal" value={f.litres} onChange={(e) => set({ ...f, litres: e.target.value })} placeholder="0,00" /></label>}
        {hasOdo(f.kind) && <label>Odómetro (km)<input inputMode="numeric" value={f.odo} onChange={(e) => set({ ...f, odo: e.target.value })} placeholder={last !== null ? `último ${last}` : 'ex.: 48 210'} /></label>}
      </div>}
      {f.kind === 'fuel' && <div className="seg" role="group" aria-label="Depósito"><button type="button" className="press" aria-pressed={f.full} onClick={() => set({ ...f, full: true })}>Depósito cheio</button><button type="button" className="press" aria-pressed={!f.full} onClick={() => set({ ...f, full: false })}>Parcial</button></div>}
    </>
  );
}

/** A frase de ajuda de um registo do carro. */
export const entryWhy = (f: CarEntry) => (f.kind === 'fuel' ? (!f.full ? 'Parcial: os litros somam-se até ao próximo depósito cheio.' : f.odo.trim() ? 'Com os km e os litros, o consumo mede-se de depósito cheio a depósito cheio.' : 'Sem os km, este abastecimento não entra no consumo.')
  : f.kind === 'charge' ? 'Entra no €/km. O consumo em kWh/100 km chega em breve.' : f.kind === 'toll' ? 'Entra no €/km; não conta nos fixos por mês.' : 'Entra no €/km e nos fixos por mês. Se for o IUC ou o seguro, a NIKKI percebe pela nota.');

export function LogSheet({ car, kind }: { car: CarRow; kind: CarLog['kind'] }) {
  const { me, house } = useSession();
  const { expenses, carLogs } = useHouse();
  const { close, toast } = useOverlays();
  const split = useCarSplit();
  const learn = useLearnFromPayment();
  const saveLog = useSaveCarLog();
  const last = lastOdometer(carLogs.rows, car);
  const [amt, setAmt] = useState('');
  const [f, setF] = useState(() => carEntry(car, kind));
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'h' | 'o' | 'x'>('h');
  const [date, setDate] = useState(todayStr());
  const [err, setErr] = useState('');
  const spent_on = day === 'h' ? todayStr() : day === 'o' ? addDays(todayStr(), -1) : date;
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = parseAmount(amt);
    if (!v) return setErr('Escreve o valor.');
    const n = checkEntry(car, f, last);
    if (typeof n === 'string') return setErr(n);
    const what = f.kind === 'other' ? 'Carro' : LOGNAME[f.kind];
    const { data, error } = await supabase.from('expenses').insert({
      household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Carros', spent_on, car_id: car.id,
      note: `${note.trim() || what} · ${car.name}`.slice(0, 120), ...split(car),
    }).select('id').single();
    if (error) return setErr(error.message);
    const { error: e2 } = await saveLog(car, f, n, (data as { id: string }).id, v, spent_on, note);
    if (e2) return setErr(e2.message);
    expenses.reload(); carLogs.reload(); close();
    const learned = (f.kind === 'other' || f.kind === 'service') && note.trim() ? await learn({ car, note }, toU(v), spent_on) : null;
    toast(learned ?? `${car.name}: ${eur(toU(v))} €${n.litres !== null ? ` · ${String(n.litres).replace('.', ',')} L` : ''}.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{KIND[f.kind]} · {car.name}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} autoFocus /><span className="l">€</span></div>
      <div className="form">
        <CarEntryFields car={car} f={f} set={setF} last={last} onAmount={(a) => setAmt(a.toFixed(2).replace(".", ","))} />
        {f.kind !== 'fuel' && <label>Nota<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={f.kind === 'service' ? 'Ex.: revisão, pneus' : f.kind === 'toll' ? 'Ex.: Via Verde, A1' : f.kind === 'charge' ? 'Ex.: casa, Ionity' : 'Ex.: IUC, seguro, lavagem, estacionamento'} maxLength={60} /></label>}
      </div>
      <div className="chips" role="group" aria-label="Dia">
        <button type="button" className="press" aria-pressed={day === 'h'} onClick={() => setDay('h')}>Hoje</button>
        <button type="button" className="press" aria-pressed={day === 'o'} onClick={() => setDay('o')}>Ontem</button>
        <button type="button" className="press" aria-pressed={day === 'x'} onClick={() => setDay('x')}>Outro dia</button>
      </div>
      {day === 'x' && <input className="field" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Dia" />}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || entryWhy(f)}</span></p>
      <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
    </form>
  );
}

/** Paguei: regista a despesa (fica no Dinheiro, fora do €/km, que já conta o IUC e o seguro por ano) e, se é anual, cria o do ano seguinte. */
export function CarPaidSheet({ d, car }: { d: DeadlineRow; car: CarRow }) {
  const { me, house } = useSession();
  const { deadlines, expenses, cars } = useHouse();
  const { close, toast } = useOverlays();
  const split = useCarSplit();
  const [amt, setAmt] = useState(d.amount ? eur(toU(d.amount)).replace(/\s/g, '') : '');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('Quanto pagaste?');
    const { data, error } = await supabase.from('expenses').insert({ household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Carros', spent_on: todayStr(), car_id: car.id, source: 'deadline', note: d.title.slice(0, 120), ...split(car) }).select('id').single();
    if (error) return setErr(error.message);
    await supabase.from('deadlines').update({ paid_at: new Date().toISOString(), paid_by: me!.id, expense_id: (data as { id: string }).id }).eq('id', d.id);
    if (d.recurrence === 'yearly') await supabase.from('deadlines').insert({ household_id: house!.id, title: d.title, due_on: nextYear(d.due_on), amount: v, recurrence: 'yearly', car_id: car.id, kind: d.kind, remind_days: d.remind_days ?? 7, created_by: me!.id });
    // O valor pago fica como referência do carro (IUC ou seguro por ano), se ainda não havia.
    if (d.kind === 'iuc' && !Number(car.annual_tax)) await supabase.from('cars').update({ annual_tax: v }).eq('id', car.id);
    if (d.kind === 'insurance' && !Number(car.annual_insurance)) await supabase.from('cars').update({ annual_insurance: (yearlyInsurance(toU(v)) / 100_000).toFixed(2) }).eq('id', car.id);
    deadlines.reload(); expenses.reload(); cars.reload(); close();
    toast(d.recurrence === 'yearly' ? `${d.title} pago. O próximo fica para ${dt(nextYear(d.due_on))}.` : `${d.title} pago.`, { ok: true });
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{d.title}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor pago" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      {d.kind === 'insurance' && <p className="s">Antes de renovar: pede 2 ou 3 propostas com as mesmas coberturas e leva a melhor à tua seguradora. É a altura em que mais se poupa.</p>}
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || `Fica nas despesas de hoje, em Carros${d.recurrence === 'yearly' ? `, e o prazo passa para ${dt(nextYear(d.due_on))}` : ''}.`}</span></p>
      <button className="btn wide press">Paguei <Icon n="check" s={20} /></button>
    </form>
  );
}

/**
 * Abastecer por fotografia: a do talão ou do mostrador da bomba dá o valor e os litros; a do conta-quilómetros, os
 * km. Lê-se no telemóvel e a foto não fica guardada. O que se leu fica nos campos, para confirmar.
 */
function FuelPhotos({ f, set, last, onAmount }: { f: CarEntry; set: (f: CarEntry) => void; last: number | null; onAmount?: (v: number) => void }) {
  const [busy, setBusy] = useState<'talao' | 'km' | null>(null);
  const [said, setSaid] = useState('');
  const talao = useRef<HTMLInputElement>(null), kmRef = useRef<HTMLInputElement>(null);
  const fuel = f.kind === 'fuel';
  function apply(which: 'talao' | 'km', text: string) {
    if (which === 'talao') {
      const r = readFuel(text);
      if (r.litres === null && r.amount === null) return setSaid('Não consegui ler o talão. Tenta de mais perto, com luz, ou escreve à mão.');
      if (r.litres !== null && fuel) set({ ...f, litres: String(r.litres).replace('.', ',') });
      if (r.amount !== null) onAmount?.(r.amount);
      setSaid(`Li ${[r.amount !== null ? `${String(r.amount.toFixed(2)).replace('.', ',')} €` : '', r.litres !== null && fuel ? `${String(r.litres).replace('.', ',')} L` : '', r.price ? `a ${String(r.price).replace('.', ',')} €/L` : ''].filter(Boolean).join(', ')}. Confirma.`);
    } else {
      const k = readOdometer(text, last);
      if (k === null) return setSaid('Não consegui ler os km. Tenta com o mostrador direito, ou escreve à mão.');
      set({ ...f, odo: String(k) });
      setSaid(`Li ${km(k)}. Confirma.`);
    }
  }
  async function read(which: 'talao' | 'km', file: File | undefined) {
    if (!file) return;
    setBusy(which); setSaid(which === 'talao' ? 'A ler o talão…' : 'A ler os km…');
    try { apply(which, await imagesText([file], () => {})); } catch { setSaid('Não deu para ler a foto. Escreve à mão.'); } finally { setBusy(null); }
  }
  return (
    <div className="fuel-photos">
      <input ref={talao} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read('talao', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={kmRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read('km', e.target.files?.[0]); e.target.value = ''; }} />
      <div className="two-btn">
        <button type="button" className="btn quiet press" disabled={!!busy} onClick={() => talao.current?.click()}><Icon n="cam" s={18} /> {fuel ? 'Talão ou bomba' : 'Talão'}</button>
        <button type="button" className="btn quiet press" disabled={!!busy} onClick={() => kmRef.current?.click()}><Icon n="cam" s={18} /> Km</button>
      </div>
      {DEMO && <div className="two-btn">
        <button type="button" className="tb quiet press" onClick={() => apply('talao', 'GALP\nGasoleo 34,66 L x 1,789 €/L\nTOTAL 62,00 €')}>Talão de exemplo</button>
        <button type="button" className="tb quiet press" onClick={() => apply('km', `TRIP A 412.3\nODO ${(last ?? 48000) + 640} km`)}>Km de exemplo</button>
      </div>}
      {said && <p className="s" aria-live="polite">{said}</p>}
    </div>
  );
}
