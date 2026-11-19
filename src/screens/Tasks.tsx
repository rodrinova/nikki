// Tarefas de uma vez (nikki.todos): para mim, para outra pessoa da casa (só os adultos da casa; o housekeeping tem as
// tarefas das visitas) ou para quem puder, com dia e, se se quiser, hora. Quem recebe um pedido não é avisado: fica na
// lista dela, na agenda e no resumo diário. Quem pediu é avisado quando a tarefa fica feita, é devolvida ou muda de dia.
import { useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type TodoRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { addDays, dayLabel, todayStr } from '@/lib/dates';

const first = (n?: string) => (n ?? '').split(' ')[0];

/** Nova tarefa. `who`: «me», «other» (a outra pessoa da casa, quando há uma só), «any», ou o id de quem a vai fazer. */
export function TodoSheet({ init }: { init?: { title?: string; day?: string; who?: string } } = {}) {
  const { me, members, house } = useSession();
  const { todos } = useHouse();
  const { toast } = useOverlays();
  const others = members.filter((m) => m.id !== me?.id);
  const w0 = init?.who === 'other' ? others[0]?.id ?? 'any' : init?.who === 'me' || !init?.who ? me?.id ?? 'any' : init.who;
  const [t, setT] = useState(init?.title ?? '');
  const [who, setWho] = useState<string>(w0);
  const d0 = init?.day ?? todayStr();
  const [when, setWhen] = useState<'h' | 'a' | 'x'>(d0 === todayStr() ? 'h' : d0 === addDays(todayStr(), 1) ? 'a' : 'x');
  const [date, setDate] = useState(when === 'x' ? d0 : addDays(todayStr(), 2));
  const [timeOn, setTimeOn] = useState(false);
  const [time, setTime] = useState('18:00');
  const [added, setAdded] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const to = others.find((m) => m.id === who);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!t.trim()) return;
    const due_on = when === 'h' ? todayStr() : when === 'a' ? addDays(todayStr(), 1) : date;
    const { error } = await supabase.from('todos').insert({ household_id: house!.id, title: t.trim().slice(0, 80), owner_id: who === 'any' ? null : who, due_on, due_time: timeOn ? time : null, created_by: me!.id });
    if (error) return toast(error.message);
    setAdded((a) => [...a, t.trim()]); setT(''); todos.reload(); ref.current?.focus();
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">Tarefa</p>
      <input ref={ref} className="field" value={t} onChange={(e) => setT(e.target.value)} placeholder="ex.: Ligar ao canalizador" maxLength={80} autoFocus aria-label="O que é" />
      {others.length > 0 && <div className="seg sm" role="group" aria-label="Para quem">
        <button type="button" className="press" aria-pressed={who === me?.id} onClick={() => setWho(me!.id)}>Eu</button>
        {others.map((m) => <button key={m.id} type="button" className="press" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>{first(m.name)}</button>)}
        <button type="button" className="press" aria-pressed={who === 'any'} onClick={() => setWho('any')}>Quem puder</button>
      </div>}
      <div className="seg sm" role="group" aria-label="Quando"><button type="button" className="press" aria-pressed={when === 'h'} onClick={() => setWhen('h')}>Hoje</button><button type="button" className="press" aria-pressed={when === 'a'} onClick={() => setWhen('a')}>Amanhã</button><button type="button" className="press" aria-pressed={when === 'x'} onClick={() => setWhen('x')}>Outro dia</button></div>
      {when === 'x' && <input className="field" type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Dia" />}
      {timeOn
        ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="field" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora" style={{ flex: 1 }} /><button type="button" className="tb quiet press" onClick={() => setTimeOn(false)}>Sem hora</button></div>
        : <button type="button" className="tb quiet press" style={{ alignSelf: 'flex-start' }} onClick={() => setTimeOn(true)}><Icon n="plus" s={14} /> Hora</button>}
      {to && <p className="s">{first(to.name)} vê-a na lista, na agenda e no resumo do dia. Sabes quando estiver feita.</p>}
      {added.length > 0 && <p className="s why"><span className="dot" aria-hidden="true" /><span>Na lista: {added.join(', ')}. Mais uma?</span></p>}
      <button className="btn wide press">Juntar <Icon n="plus" s={18} /></button>
    </form>
  );
}

/** Uma tarefa já marcada: fazer, mudar o dia, devolver a quem pediu, ou apagar (quem a criou). */
export function TodoActSheet({ t }: { t: TodoRow }) {
  const { me, members } = useSession();
  const { todos } = useHouse();
  const { close, toast } = useOverlays();
  const [moving, setMoving] = useState(false);
  const [day, setDay] = useState(t.due_on ?? todayStr());
  const [time, setTime] = useState(t.due_time?.slice(0, 5) ?? '');
  const name = (id?: string | null) => first(members.find((m) => m.id === id)?.name) || 'alguém';
  const asked = t.owner_id === me?.id && t.created_by !== me?.id;
  const now = () => new Date().toISOString();
  async function run(patch: Record<string, unknown>, msg: string) {
    const { error } = await supabase.from('todos').update(patch).eq('id', t.id);
    if (error) return toast(error.message);
    todos.reload(); close(); toast(msg, { ok: true });
  }
  async function remove() {
    const { error } = await supabase.from('todos').delete().eq('id', t.id);
    if (error) return toast(error.message);
    todos.reload(); close(); toast('Apagada.', { ok: true });
  }
  const whoTxt = !t.owner_id ? 'Quem puder' : t.owner_id === me?.id ? 'Tu' : name(t.owner_id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">Tarefa</p>
      <p style={{ margin: 0, fontSize: 'var(--t-l, 20px)' }}>{t.title}</p>
      <p className="s" style={{ margin: 0 }}>{[whoTxt, t.due_on ? dayLabel(t.due_on) : 'sem dia', t.due_time ? `às ${t.due_time.slice(0, 5)}` : '', asked ? `pedida por ${name(t.created_by)}` : ''].filter(Boolean).join(' · ')}</p>
      {moving ? <>
        <input className="field" type="date" value={day} min={todayStr()} onChange={(e) => setDay(e.target.value)} aria-label="Novo dia" />
        <input className="field" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora (opcional)" />
        <button type="button" className="btn wide press" onClick={() => run({ due_on: day, due_time: time || null, moved_at: now(), moved_by: me!.id }, `Passou para ${dayLabel(day)}.`)}>Mudar o dia</button>
      </> : <>
        <button type="button" className="btn accent wide press" onClick={() => run({ done_at: now(), done_by: me!.id }, t.created_by !== me?.id ? `Feito. ${name(t.created_by)} vai saber.` : 'Feito.')}><Icon n="check" s={18} /> Feito</button>
        <button type="button" className="btn quiet wide press" onClick={() => setMoving(true)}>Mudar o dia</button>
        {asked && <button type="button" className="btn quiet wide press" onClick={() => run({ owner_id: t.created_by, returned_at: now(), returned_by: me!.id }, `Voltou para ${name(t.created_by)}.`)}>Não consigo · devolver a {name(t.created_by)}</button>}
        {t.created_by === me?.id && <button type="button" className="tb quiet press" style={{ alignSelf: 'center' }} onClick={remove}>Apagar</button>}
      </>}
    </div>
  );
}
