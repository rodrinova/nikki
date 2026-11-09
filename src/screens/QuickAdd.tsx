import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type CarRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { addDays, parseDate, todayStr } from '@/lib/dates';
import { describe, readIntent, type Intent } from '@/lib/intent';
import { ExpenseSheet, TransferSheet } from './Money';
import { EventSheet, plusHour, pushToPhones } from './Agenda';
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
      <Say />
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
function TodoSheet({ init }: { init?: { title?: string; day?: string; who?: 'me' | 'other' | 'any' } } = {}) {
  const { me, partner, house } = useSession();
  const { todos } = useHouse();
  const { toast } = useOverlays();
  const [t, setT] = useState(init?.title ?? '');
  const [who, setWho] = useState<'me' | 'other' | 'any'>(init?.who ?? 'me');
  const d0 = init?.day ?? todayStr();
  const [when, setWhen] = useState<'h' | 'a' | 'x'>(d0 === todayStr() ? 'h' : d0 === addDays(todayStr(), 1) ? 'a' : 'x');
  const [date, setDate] = useState(when === 'x' ? d0 : addDays(todayStr(), 2));
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

// ───────────── o campo único ─────────────

type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void; abort: () => void };

/** Ditar (onde o browser deixa: Safari e Chrome). Devolve null quando não há. */
function useListen(onText: (t: string) => void) {
  const Ctor = (globalThis as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  const [on, setOn] = useState(false);
  const ref = useRef<SR | null>(null);
  const cb = useRef(onText); cb.current = onText;
  useEffect(() => () => ref.current?.abort(), []);
  if (!Ctor) return null;
  const start = () => {
    try {
      const r = new Ctor();
      r.lang = 'pt-PT'; r.interimResults = true; r.continuous = false;
      r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; cb.current(t.trim()); };
      r.onend = () => setOn(false); r.onerror = () => setOn(false);
      r.start(); ref.current = r; setOn(true);
    } catch { setOn(false); }
  };
  return { on, toggle: () => (on ? ref.current?.stop() : start()) };
}

const EXAMPLES = ['jantar 48 a meias', 'dentista quinta às 10', 'falta leite, ovos e café', 'tenho de ligar ao canalizador amanhã'];
const KIND: Record<string, [string, string]> = { expense: ['coins', 'Despesa'], event: ['cal', 'Evento'], shop: ['basket', 'Compras'], todo: ['check', 'A fazer'] };

/**
 * Escrever ou dizer: uma frase, e a NIKKI mostra o que percebeu antes de gravar. A despesa segue para a folha dela
 * (que lê o dia, a divisão, quem pagou e a categoria); evento, compras e «a fazer» gravam-se aqui com um toque, ou
 * abrem a folha para ajustar.
 */
export function Say({ listen = false }: { listen?: boolean } = {}) {
  const { me, partner, house } = useSession();
  const { events, shop, todos, on: modOn } = useHouse();
  const { open, close, toast } = useOverlays();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ex] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  const today = todayStr();
  const raw = readIntent(text, today, { partner: partner?.name });
  const it: Intent = raw.kind === 'shop' && !modOn('compras') ? { kind: null, text } : raw;
  const mic = useListen(setText);
  const inputRef = useRef<HTMLInputElement>(null);
  // Aberto a manter o dedo na cara (NIKKI 2): já a ouvir.
  const started = useRef(false);
  useEffect(() => { if (listen && mic && !started.current) { started.current = true; mic.toggle(); } }, [listen, mic]);

  async function save(i: Intent) {
    if (busy || !house || !me) return;
    setBusy(true);
    let error: { message: string } | null = null, msg = '';
    if (i.kind === 'event') {
      const s = i.time ? new Date(`${i.day}T${i.time}:00`) : parseDate(i.day);
      let en: Date | null = i.time ? new Date(`${i.day}T${i.end ?? plusHour(i.time)}:00`) : null;
      if (en && en <= s) en = new Date(en.getTime() + 86_400_000);
      const r = await supabase.from('events').insert({ household_id: house.id, title: i.title, starts_at: s.toISOString(), ends_at: en ? en.toISOString() : null, all_day: !i.time, kind: 'event', owner_id: null, private: false, location: null, repeat: 'none', weekdays: null, month_mode: 'day', until_on: null, remind_days: null, created_by: me.id }).select('id').single();
      error = r.error; if (!error) { pushToPhones(house.id, (r.data as { id: string }).id); events.reload(); msg = `${i.title}: ${describe(i, today).toLowerCase()}.`; }
    } else if (i.kind === 'shop') {
      ({ error } = await supabase.from('shopping_items').insert(i.items.map((n) => ({ household_id: house.id, name: n, aisle: aisleOf(n), created_by: me.id }))));
      if (!error) { shop.reload(); msg = `Na lista: ${i.items.join(', ')}.`; }
    } else if (i.kind === 'todo') {
      ({ error } = await supabase.from('todos').insert({ household_id: house.id, title: i.title, owner_id: i.who === 'me' ? me.id : i.who === 'other' ? partner?.id ?? null : null, due_on: i.day, created_by: me.id }));
      if (!error) { todos.reload(); msg = `${i.title}: ${describe(i, today, partner?.name).toLowerCase()}.`; }
    }
    setBusy(false);
    if (error) return toast(error.message);
    close(); toast(msg, { ok: true });
  }
  const adjust = (i: Intent) => {
    if (i.kind === 'expense') open(<ExpenseSheet init={{ text: i.text }} />);
    else if (i.kind === 'event') open(<EventSheet day={i.day} init={{ title: i.title, time: i.time, end: i.end }} />);
    else if (i.kind === 'todo') open(<TodoSheet init={{ title: i.title, day: i.day, who: i.who }} />);
    else if (i.kind === 'shop') open(<ShopSheet />);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (it.kind === 'expense') adjust(it); else if (it.kind) void save(it); };
  const what = it.kind === 'event' || it.kind === 'todo' ? it.title : it.kind === 'shop' ? it.items.join(' · ') : it.kind === 'expense' ? it.text : '';
  return (
    <form className="say" onSubmit={submit} autoComplete="off">
      <div className={`say-in${mic?.on ? ' listening' : ''}`}>
        <input ref={inputRef} className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Escreve ou diz: «${ex}»`} aria-label="Escreve ou diz o que foi" enterKeyHint="done" autoFocus={typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches} />
        {mic && <button type="button" className={`say-mic press${mic.on ? ' on' : ''}`} aria-pressed={mic.on} aria-label={mic.on ? 'Parar de ouvir' : 'Dizer'} onClick={() => { mic.toggle(); inputRef.current?.blur(); }}><Icon n="mic" s={20} /></button>}
      </div>
      {text.trim() && (it.kind ? (
        <div className="say-card" aria-live="polite">
          <span className="say-k"><Icon n={KIND[it.kind][0]} s={16} />{KIND[it.kind][1]}</span>
          <span className="say-what">{what}</span>
          {it.kind !== 'expense' && <span className="s">{describe(it, today, partner?.name)}</span>}
          {it.kind === 'expense' && <span className="s">A seguir: valor, divisão e categoria, para confirmar.</span>}
          <span className="say-acts">
            {it.kind !== 'expense' && <button type="button" className="tb quiet press" onClick={() => adjust(it)}>Ajustar</button>}
            <button className="btn accent press" disabled={busy}>{it.kind === 'expense' ? 'Continuar' : 'Gravar'}</button>
          </span>
        </div>
      ) : (
        <div className="say-card" aria-live="polite">
          <span className="s">O que é?</span>
          <span className="say-acts wrap">
            <button type="button" className="tb press" onClick={() => adjust({ kind: 'expense', text })}>Despesa</button>
            <button type="button" className="tb press" onClick={() => open(<EventSheet day={today} init={{ title: text.trim().slice(0, 80) }} />)}>Evento</button>
            <button type="button" className="tb press" onClick={() => adjust({ kind: 'todo', title: text.trim().slice(0, 80), day: today, who: 'me' })}>A fazer</button>
            {modOn('compras') && <button type="button" className="tb press" onClick={() => void save({ kind: 'shop', items: [text.trim().slice(0, 60)] })}>Compras</button>}
          </span>
        </div>
      ))}
    </form>
  );
}
