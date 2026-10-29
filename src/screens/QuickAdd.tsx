import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type CarRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { addDays, todayStr } from '@/lib/dates';
import { ExpenseSheet, TransferSheet } from './Money';
import { EventSheet } from './Agenda';
import { LogSheet } from './Garage';
import { WarrantySheet } from './CasaCare';
import { TaskSheet } from './Housekeeping';
import { aisleOf } from './Shop';

// O «+» serve para tudo: despesa (a primeira, a maior), evento, coisa a fazer, compras, fatura, abastecer,
// transferência e garantia. Só aparecem as dos módulos ligados.

export function QuickAdd() {
  const { partner } = useSession();
  const { on, cars, hk } = useHouse();
  const hkCard = on('housekeeping') ? hk.rows.find((r) => !r.archived) : undefined;
  const { open } = useOverlays();
  const garage = on('garagem') ? cars.rows.filter((c) => !c.archived) : [];
  const fuel = (c: CarRow) => open(<LogSheet car={c} kind={c.energy === 'eletrico' ? 'charge' : 'fuel'} />);
  const items: [string, string, string, () => void][] = [
    ['cal', 'Evento', 'na agenda', () => open(<EventSheet day={todayStr()} />)],
    ['check', 'A fazer', 'para hoje ou outro dia', () => open(<TodoSheet />)],
    ...(on('compras') ? [['basket', 'Compras', 'juntar à lista', () => open(<ShopSheet />)] as [string, string, string, () => void]] : []),
    ...(garage.length ? [['car', garage.some((c) => c.energy !== 'eletrico') ? 'Abastecer' : 'Carregar', garage.length === 1 ? garage[0].name : 'escolher o carro', () => (garage.length === 1 ? fuel(garage[0]) : open(<CarPick cars={garage} pick={fuel} />))] as [string, string, string, () => void]] : []),
    ...(partner ? [['heart', 'Transferência', `entre ti e ${partner.name}`, () => open(<TransferSheet />)] as [string, string, string, () => void]] : []),
    ...(on('casa') ? [['umbrella', 'Garantia', 'com o talão', () => open(<WarrantySheet home={null} />)] as [string, string, string, () => void]] : []),
    ...(hkCard ? [['broom', `Tarefa para ${hkCard.name}`, 'só desta vez', () => open(<TaskSheet once />)] as [string, string, string, () => void]] : []),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="qa-main press" onClick={() => open(<ExpenseSheet />)}><Icon n="coins" s={22} /><span className="st2"><span>Despesa</span><span className="s">Uma ou várias seguidas</span></span><Icon n="arrow" s={18} /></button>
      <div className="qa-grid">{items.map(([ic, t, s, go]) => (
        <button key={t} className="qa press" onClick={go}><Icon n={ic} s={20} /><span>{t}</span><span className="s">{s}</span></button>
      ))}</div>
    </div>
  );
}

function CarPick({ cars, pick }: { cars: CarRow[]; pick: (c: CarRow) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">Que carro?</p>
      <div className="tile card rows">{cars.map((c) => <button key={c.id} className="press" onClick={() => pick(c)}><span className="st2"><span>{c.name}</span><span className="s">{c.plate ?? ''}</span></span><Icon n="arrow" s={16} /></button>)}</div>
    </div>
  );
}

/** Uma coisa a fazer: para mim, para o outro ou para quem puder; hoje, amanhã ou outro dia. Fica aberta para juntar mais. */
function TodoSheet() {
  const { me, partner, house } = useSession();
  const { todos } = useHouse();
  const { toast } = useOverlays();
  const [t, setT] = useState('');
  const [who, setWho] = useState<'me' | 'other' | 'any'>('me');
  const [when, setWhen] = useState<'h' | 'a' | 'x'>('h');
  const [date, setDate] = useState(addDays(todayStr(), 2));
  const [added, setAdded] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!t.trim()) return;
    const due_on = when === 'h' ? todayStr() : when === 'a' ? addDays(todayStr(), 1) : date;
    const { error } = await supabase.from('todos').insert({ household_id: house!.id, title: t.trim().slice(0, 80), owner_id: who === 'me' ? me!.id : who === 'other' ? partner?.id ?? null : null, due_on, created_by: me!.id });
    if (error) return toast(error.message);
    setAdded((a) => [...a, t.trim()]); setT(''); todos.reload(); ref.current?.focus();
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">A fazer</p>
      <input ref={ref} className="field" value={t} onChange={(e) => setT(e.target.value)} placeholder="ex.: Ligar ao canalizador" maxLength={80} autoFocus aria-label="O que é" />
      {partner && <div className="seg sm" role="group" aria-label="Para quem"><button type="button" className="press" aria-pressed={who === 'me'} onClick={() => setWho('me')}>Eu</button><button type="button" className="press" aria-pressed={who === 'other'} onClick={() => setWho('other')}>{partner.name}</button><button type="button" className="press" aria-pressed={who === 'any'} onClick={() => setWho('any')}>Quem puder</button></div>}
      <div className="seg sm" role="group" aria-label="Quando"><button type="button" className="press" aria-pressed={when === 'h'} onClick={() => setWhen('h')}>Hoje</button><button type="button" className="press" aria-pressed={when === 'a'} onClick={() => setWhen('a')}>Amanhã</button><button type="button" className="press" aria-pressed={when === 'x'} onClick={() => setWhen('x')}>Outro dia</button></div>
      {when === 'x' && <input className="field" type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Dia" />}
      {added.length > 0 && <p className="s why"><span className="dot" aria-hidden="true" /><span>Na lista: {added.join(', ')}. Mais uma?</span></p>}
      <button className="btn wide press">Juntar <Icon n="plus" s={18} /></button>
    </form>
  );
}

/** Juntar à lista de compras, uma atrás da outra. */
function ShopSheet() {
  const { me, house } = useSession();
  const { shop } = useHouse();
  const { toast } = useOverlays();
  const [n, setN] = useState('');
  const [added, setAdded] = useState<ReactNode[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    const x = n.trim();
    if (!x) return;
    const nice = x[0].toUpperCase() + x.slice(1);
    const { error } = await supabase.from('shopping_items').insert({ household_id: house!.id, name: nice, aisle: aisleOf(x), created_by: me!.id });
    if (error) return toast(error.message);
    setAdded((a) => [...a, nice]); setN(''); shop.reload(); ref.current?.focus();
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">Compras</p>
      <input ref={ref} className="field" value={n} onChange={(e) => setN(e.target.value)} placeholder="ex.: Leite" maxLength={60} autoFocus aria-label="O que falta" />
      {added.length > 0 && <p className="s why"><span className="dot" aria-hidden="true" /><span>Na lista: {added.map((a, j) => <span key={j}>{j ? ', ' : ''}{a}</span>)}. Mais?</span></p>}
      <button className="btn wide press">Juntar <Icon n="plus" s={18} /></button>
    </form>
  );
}
