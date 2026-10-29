import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type ChoreRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { eur, parseAmount, toU } from '@/lib/money';
import { todayStr } from '@/lib/dates';
import { afterDone, todayList, type TodayItem } from '@/lib/chores';

// Hoje: a lista de coisas a fazer de cada pessoa (as tarefas da casa que são dela ou de quem pegar, a manutenção que
// chegou, e o que se juntou para hoje). Separada de «A NIKKI lembra», que é só de avisos.

/** Marcar uma tarefa como feita: regista, marca a próxima data e passa a vez. Devolve como desfazer. */
export function useChoreDone() {
  const { me, house, members } = useSession();
  const { chores, choreLogs } = useHouse();
  return async (c: ChoreRow, extra?: { expense_id?: string | null; note?: string | null }) => {
    const today = todayStr();
    const before = { next_on: c.next_on, turn_id: c.turn_id };
    const { data, error } = await supabase.from('chore_logs').insert({ household_id: house!.id, chore_id: c.id, done_on: today, done_by: me!.id, expense_id: extra?.expense_id ?? null, note: extra?.note ?? null }).select('id').single();
    if (error) return { error: error.message, undo: async () => {} };
    await supabase.from('chores').update(afterDone(c, today, me!.id, members.map((m) => m.id))).eq('id', c.id);
    chores.reload(); choreLogs.reload();
    return {
      error: null,
      undo: async () => {
        await supabase.from('chore_logs').delete().eq('id', (data as { id: string }).id);
        await supabase.from('chores').update(before).eq('id', c.id);
        chores.reload(); choreLogs.reload();
      },
    };
  };
}

/** Marcar uma coisa de hoje como feita (tarefa da casa ou «a fazer»). Devolve o desfazer, ou null se abriu uma folha. */
export function useTick() {
  const { me } = useSession();
  const { todos } = useHouse();
  const { open, toast } = useOverlays();
  const done = useChoreDone();
  return async (it: TodayItem): Promise<(() => Promise<void>) | null> => {
    if (it.kind === 'chore' && it.chore!.kind === 'maintenance') { open(<MaintDoneSheet c={it.chore as ChoreRow} />); return null; }
    if (it.kind === 'chore') {
      const r = await done(it.chore as ChoreRow);
      if (r.error) { toast(r.error); return null; }
      return r.undo;
    }
    const { error } = await supabase.from('todos').update({ done_at: new Date().toISOString(), done_by: me!.id }).eq('id', it.id);
    if (error) { toast(error.message); return null; }
    todos.reload();
    return async () => { await supabase.from('todos').update({ done_at: null, done_by: null }).eq('id', it.id); todos.reload(); };
  };
}

export function Today() {
  const { me, partner, house } = useSession();
  const { chores, todos, on } = useHouse();
  const { open, toast } = useOverlays();
  const done = useChoreDone();
  const today = todayStr();
  const list = me ? todayList(on('casa') ? chores.rows : [], todos.rows, me.id, today) : { mine: [], others: 0 };
  const [undo, setUndo] = useState<{ t: string; run: () => Promise<void> } | null>(null);
  const [text, setText] = useState('');
  const [who, setWho] = useState<'me' | 'other' | 'any'>('me');
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t); }, [undo]);

  async function tick(it: TodayItem) {
    if (it.kind === 'chore' && it.chore!.kind === 'maintenance') return open(<MaintDoneSheet c={it.chore as ChoreRow} />);
    if (it.kind === 'chore') {
      const r = await done(it.chore as ChoreRow);
      if (r.error) return toast(r.error);
      setUndo({ t: it.title, run: r.undo });
    } else {
      const { error } = await supabase.from('todos').update({ done_at: new Date().toISOString(), done_by: me!.id }).eq('id', it.id);
      if (error) return toast(error.message);
      todos.reload();
      setUndo({ t: it.title, run: async () => { await supabase.from('todos').update({ done_at: null, done_by: null }).eq('id', it.id); todos.reload(); } });
    }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const owner_id = who === 'me' ? me!.id : who === 'other' ? partner?.id ?? null : null;
    const { error } = await supabase.from('todos').insert({ household_id: house!.id, title: t.slice(0, 80), owner_id, due_on: today, created_by: me!.id });
    if (error) return toast(error.message);
    setText(''); todos.reload();
    if (who === 'other') toast(`Na lista de ${partner?.name} para hoje.`, { ok: true });
  }
  const late = (n: number) => (n === 1 ? 'desde ontem' : n > 1 ? `atrasada ${n} dias` : '');
  return (
    <section className="tile pane todo-pane" aria-label="Hoje">
      <div className="pane-top"><span className="s">Hoje</span>{list.mine.length > 0 && <span className="s">{list.mine.length}</span>}</div>
      {list.mine.length === 0 && !undo && <p className="s" style={{ fontSize: 'var(--t-m)' }}>Nada para fazer hoje.</p>}
      <ul className="todo-list">
        {list.mine.map((it) => (
          <li key={it.kind + it.id} className="todo-row">
            <button type="button" className="tick press" role="checkbox" aria-checked="false" aria-label={`Feito: ${it.title}`} onClick={() => tick(it)}><i /></button>
            <span className="st2"><span>{it.title}</span><span className="s">{[
              it.kind === 'chore' && it.chore!.kind === 'maintenance' ? 'manutenção' : '',
              it.owner === null ? (partner ? 'de quem puder' : '') : it.chore?.assign === 'rotate' ? 'a tua vez' : '',
              late(it.late),
            ].filter(Boolean).join(' · ')}</span></span>
          </li>
        ))}
        {undo && <li className="now-undo s"><span>{undo.t}: feito.</span><button className="tb press" onClick={async () => { await undo.run(); setUndo(null); }}>Desfazer</button></li>}
      </ul>
      <form className="todo-add" onSubmit={add} autoComplete="off">
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Juntar para hoje…" aria-label="Juntar uma coisa para fazer hoje" maxLength={80} />
        {text.trim() && partner && <div className="seg sm" role="group" aria-label="Para quem">
          <button type="button" className="press" aria-pressed={who === 'me'} onClick={() => setWho('me')}>Eu</button>
          <button type="button" className="press" aria-pressed={who === 'other'} onClick={() => setWho('other')}>{partner.name}</button>
          <button type="button" className="press" aria-pressed={who === 'any'} onClick={() => setWho('any')}>Quem puder</button>
        </div>}
      </form>
      {partner && list.others > 0 && <p className="s">{partner.name} tem {list.others} {list.others === 1 ? 'coisa' : 'coisas'} para hoje.</p>}
    </section>
  );
}

/** Manutenção feita: quando, por quem (uma empresa, por exemplo) e quanto custou (fica nas despesas, em Casa). */
export function MaintDoneSheet({ c }: { c: ChoreRow }) {
  const { me, partner, house, myShare } = useSession();
  const { expenses } = useHouse();
  const { close, toast } = useOverlays();
  const done = useChoreDone();
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    const v = amt.trim() ? parseAmount(amt) : null;
    if (amt.trim() && !v) return setErr('O valor escreve-se assim: 85 ou 85,50.');
    let expense_id: string | null = null;
    if (v) {
      const res = await supabase.from('expenses').insert({ household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v, category: 'Casa', spent_on: todayStr(), split: partner ? 'shared' : 'mine', other_id: partner?.id ?? null, payer_share: partner ? myShare : null, note: `${c.title}${note.trim() ? ` · ${note.trim()}` : ''}`.slice(0, 120) }).select('id').single();
      if (res.error) return setErr(res.error.message);
      expense_id = (res.data as { id: string }).id;
      expenses.reload();
    }
    const r = await done(c, { expense_id, note: note.trim() || null });
    if (r.error) return setErr(r.error);
    close();
    toast(`${c.title}: feito${v ? `, ${eur(toU(v))} € nas despesas` : ''}.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">{c.title}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Quanto custou (opcional)" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      <label className="form"><span className="s">Quem fez ou nota (opcional)</span><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: Técnico Vulcano" maxLength={60} /></label>
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || `Fica feito hoje${amt.trim() ? `; o valor fica nas despesas, em Casa${partner ? ', partilhada' : ''}` : '; se custou alguma coisa, põe o valor'}.`}</span></p>
      <button className="btn wide press">Feito <Icon n="check" s={20} /></button>
    </form>
  );
}
