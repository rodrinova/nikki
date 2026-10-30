import { useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type HkLogRow, type HkMessageRow, type HkRow, type HkTaskRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { store } from '@/lib/store';
import { addDays, dayLabel, daysInMonth, monthName, todayStr } from '@/lib/dates';
import { eur, toU } from '@/lib/money';
import { visitsBetween, nextVisit, repeatLabel, visitList, type HkRepeat } from '@/lib/hk';
import { Shot, rid, shrink } from './Tickets';

// Housekeeping, do lado da casa: quem ajuda, em que dias vem, a lista de cada visita, mensagens nos dois sentidos,
// os produtos que ela pede e o pagamento mensal fixo. Ela tem uma conta própria com um papel limitado (vê só a
// lista, as mensagens e as compras). Regras em docs/CALCULOS.md, secção 9.

export const REPEATS: HkRepeat[] = ['visit', 'week', 'month', 'once'];
export const month = (m: string) => monthName(m);
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Mensagens novas da outra parte: guarda no aparelho a hora da última vista. */
export const seenKey = (h: string | undefined, me: string | undefined) => `nikki_hk_seen_${h}_${me}`;

/** Meses pagos: os marcados aqui e os que ficaram na conta fixa da Casa (se se pagou por lá). */
export function usePaid(h: HkRow | undefined) {
  const { hkPaid, billPayments } = useHouse();
  if (!h) return [];
  return [...hkPaid.rows.filter((p) => p.hk_id === h.id).map((p) => p.month), ...(h.bill_id ? billPayments.rows.filter((p) => p.bill_id === h.bill_id && p.amount !== null).map((p) => p.period_to.slice(0, 7)) : [])];
}

/**
 * Pedir ao housekeeping uma tarefa ou manutenção da casa, num toque (a partir dos avisos): entra na próxima visita e,
 * quando fica feita, a da casa também (gatilho na base). Diz se já está pedida.
 */
export function useAskHk() {
  const { me, house } = useSession();
  const { hk, hkTasks, hkLog, on } = useHouse();
  const { toast } = useOverlays();
  const card = on('housekeeping') ? hk.rows.find((r) => !r.archived) : undefined;
  const pending = (choreId: string) => hkTasks.rows.find((t) => !t.archived && t.chore_id === choreId && !hkLog.rows.some((l) => l.task_id === t.id));
  const ask = async (c: { id: string; title: string }) => {
    if (!card) return;
    const due = nextVisit(card.weekdays, todayStr());
    const { error } = await supabase.from('hk_tasks').insert({ household_id: house!.id, title: c.title.slice(0, 80), repeat: 'once', due_on: due, chore_id: c.id, created_by: me!.id });
    if (error) return toast(error.message);
    hkTasks.reload();
    toast(`${c.title}: pedido a ${card.name} para a visita de ${dayLabel(due)}. Quando ficar feito, fica feito aqui também.`, { ok: true });
  };
  return { card, pending, ask };
}

/** Mensagens da pessoa do housekeeping que ainda não se viram (neste aparelho). */
export function useHkUnread(h: HkRow | undefined) {
  const { me, house } = useSession();
  const { hkMessages } = useHouse();
  const seen = store.get(seenKey(house?.id, me?.id)) ?? '';
  return h ? hkMessages.rows.filter((m) => m.author_id === h.profile_id && m.created_at > seen) : [];
}

/** Cada parte do painel, no seu ecrã (/housekeeping/:part). */
/** As próximas visitas a planear: os dias de visita das próximas 4 semanas (até 6); sem dias fixos, os próximos 7 dias. */
export const planDays = (weekdays: number[], today: string) => (weekdays.length ? visitsBetween(weekdays, today, addDays(today, 28)).slice(0, 6) : Array.from({ length: 7 }, (_, j) => addDays(today, j)));

/** A lista de uma visita: toca para marcar (ou desmarcar) como feito. Serve à casa e a ela. */
export function VisitChecklist({ list, day, logs: h }: { list: ReturnType<typeof visitList>; day: string; logs: { reload: () => Promise<void>; setRows: (f: (r: HkLogRow[]) => HkLogRow[]) => void } }) {
  const { house, me } = useSession();
  const { toast } = useOverlays();
  async function flip(it: (typeof list)[number]) {
    if (it.done && it.log) {
      h.setRows((r) => r.filter((l) => l.id !== it.log!.id));
      const { error } = await supabase.from('hk_log').delete().eq('id', it.log.id!);
      if (error) { toast('Não foi possível desmarcar.'); h.reload(); }
      return;
    }
    const tmp: HkLogRow = { id: 'tmp-' + Date.now(), task_id: it.task.id, done_on: day, done_by: me!.id, created_at: new Date().toISOString() };
    h.setRows((r) => [tmp, ...r]);
    const { error } = await supabase.from('hk_log').insert({ household_id: house!.id, task_id: it.task.id, done_on: day, done_by: me!.id });
    if (error) toast('Não ficou marcado. Tenta outra vez.');
    h.reload();
  }
  if (!list.length) return <p className="s">Nada na lista desta visita.</p>;
  return (
    <ul className="tile card todo-list hk-list">
      {list.map((it) => (
        <li key={it.task.id} className={`todo-row${it.done ? ' done' : ''}`}>
          <button type="button" className={`tick press${it.done ? ' on' : ''}`} role="checkbox" aria-checked={it.done} aria-label={`${it.done ? 'Feito' : 'Por fazer'}: ${it.task.title}`} onClick={() => flip(it)}>{it.done ? <Icon n="check" s={14} w={2.2} /> : <i />}</button>
          <span className="st2"><span>{it.task.title}</span>{it.task.repeat !== 'visit' && <span className="s">{it.task.repeat === 'once' ? 'só desta vez' : repeatLabel(it.task.repeat).toLowerCase()}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Mensagens nos dois sentidos (a casa e quem faz o housekeeping), as mais recentes em baixo. */
/** Mandar uma fotografia (da câmara ou da galeria) numa mensagem: reduzida a 1600 px, na pasta da casa (bucket «hk»). */
export async function sendPhoto(file: File, household: string, author: string, body = ''): Promise<string | null> {
  const path = `${household}/${rid()}.jpg`;
  const up = await supabase.storage.from('hk').upload(path, await shrink(file), { contentType: 'image/jpeg' });
  if (up.error) return up.error.message;
  const { error } = await supabase.from('hk_messages').insert({ household_id: household, author_id: author, body: body.slice(0, 1000), photo_path: path });
  return error?.message ?? null;
}

/** Uma mensagem: o texto e, se houver, a fotografia (um toque abre-a inteira). */
export const MsgBody = ({ m }: { m: HkMessageRow }) => <>{m.photo_path && <Shot path={m.photo_path} bucket="hk" alt="Fotografia da mensagem" />}{m.body.trim() && <p>{m.body}</p>}</>;

export function Thread({ rows, reload, names, house: hid }: { rows: HkMessageRow[]; reload: () => Promise<void>; names: Map<string, string>; house?: string }) {
  const { me, house } = useSession();
  const { toast } = useOverlays();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pic = useRef<HTMLInputElement>(null);
  const shown = rows.slice(-30);
  async function photo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const err = await sendPhoto(f, hid ?? house!.id, me!.id, text.trim());
    setBusy(false);
    if (err) return toast('A fotografia não seguiu. Tenta outra vez.');
    setText(''); reload();
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const { error } = await supabase.from('hk_messages').insert({ household_id: hid ?? house!.id, author_id: me!.id, body: t.slice(0, 1000) });
    if (error) { setText(t); return toast('A mensagem não seguiu. Tenta outra vez.'); }
    reload();
  }
  return (
    <div className="hk-thread">
      {shown.length === 0 && <p className="s">Ainda sem mensagens. Um recado para a próxima visita, um aviso de que falta alguma coisa…</p>}
      {shown.map((m, k) => {
        const mine = m.author_id === me?.id, day = m.created_at.slice(0, 10), prev = shown[k - 1];
        return (
          <div key={m.id} className={`hk-msg${mine ? ' mine' : ''}`}>
            {(!prev || prev.author_id !== m.author_id || prev.created_at.slice(0, 10) !== day) && <span className="s">{mine ? 'Tu' : names.get(m.author_id) ?? '—'} · {dayLabel(new Date(m.created_at).toLocaleDateString('sv'))}, {new Date(m.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>}
            <MsgBody m={m} />
          </div>
        );
      })}
      <input ref={pic} type="file" accept="image/*" hidden onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ''; }} />
      <form className="add-row" onSubmit={send} autoComplete="off">
        <button type="button" className="sq quiet press" aria-label="Juntar uma fotografia" disabled={busy} onClick={() => pic.current?.click()}><Icon n="cam" /></button>
        <label className="sr" htmlFor="hk-msg">Mensagem</label>
        <input id="hk-msg" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escrever uma mensagem…" maxLength={1000} />
        <button className="sq press" aria-label="Enviar"><Icon n="arrow" /></button>
      </form>
    </div>
  );
}

/** O pagamento do mês: valor fixo, no dia combinado. «Paguei» põe a despesa em Casa (partilhada) e marca o mês. */
/** «Paguei» um mês: a despesa em Casa (partilhada), o mês marcado e, com a Casa ligada, a fatura na conta fixa. */
export function useHkPay() {
  const { me, partner, house, myShare } = useSession();
  const { expenses, hkPaid, billPayments, on } = useHouse();
  const { toast } = useOverlays();
  return async (h: HkRow, m: string) => {
    const v = Number(h.monthly_pay);
    const note = `Housekeeping · ${h.name} · ${month(m)}`;
    const res = await supabase.from('expenses').insert({ household_id: house!.id, created_by: me!.id, paid_by: me!.id, amount: v.toFixed(2), category: 'Casa', spent_on: todayStr(), split: partner ? 'shared' : 'mine', other_id: partner?.id ?? null, payer_share: partner ? myShare : null, note }).select('id').single();
    if (res.error) return toast(res.error.message);
    const expense_id = (res.data as { id: string }).id;
    const { error } = await supabase.from('hk_paid').insert({ household_id: house!.id, hk_id: h.id, month: m, expense_id, paid_by: me!.id });
    if (error) return toast(error.message);
    if (h.bill_id && on('casa')) await supabase.from('bill_payments').insert({ household_id: house!.id, bill_id: h.bill_id, expense_id, amount: v.toFixed(2), period_from: `${m}-01`, period_to: `${m}-${daysInMonth(m)}` });
    expenses.reload(); hkPaid.reload(); billPayments.reload();
    toast(`${cap(month(m))} pago: ${eur(toU(v), 0)} € nas despesas, em Casa${partner ? ', partilhada' : ''}.`, { ok: true });
  };
}

/** Nova tarefa ou editar: o quê e quando (em cada visita, uma vez por semana, por mês ou só uma vez). */
/** Nova tarefa da rotina, editar, ou (once) pedir uma tarefa só para uma visita: também do «+». */
export function TaskSheet({ t, once }: { t?: HkTaskRow; once?: boolean }) {
  const { me, house } = useSession();
  const { hkTasks, hk } = useHouse();
  const { close, toast } = useOverlays();
  const h = hk.rows.find((r) => !r.archived);
  const [title, setTitle] = useState(t?.title ?? '');
  const [repeat, setRepeat] = useState<HkRepeat>(t?.repeat ?? (once ? 'once' : 'visit'));
  const visits = h && h.weekdays.length ? visitsBetween(h.weekdays, todayStr(), addDays(todayStr(), 35)).slice(0, 4) : [];
  const [due, setDue] = useState(t?.due_on ?? (once ? visits[0] ?? '' : ''));
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!title.trim()) return setErr('O que é? (ex.: limpar os vidros)');
    const row = { title: title.trim().slice(0, 80), repeat, due_on: repeat === 'once' && due ? due : null };
    const { error } = t ? await supabase.from('hk_tasks').update(row).eq('id', t.id) : await supabase.from('hk_tasks').insert({ household_id: house!.id, ...row, created_by: me!.id });
    if (error) return setErr(error.message);
    hkTasks.reload(); close();
    toast(t ? 'Guardado.' : repeat === 'once' ? `Pedido: ${row.title}${row.due_on ? `, para a visita de ${dayLabel(row.due_on)}` : ', para a próxima visita'}.` : `${row.title}: ${repeatLabel(repeat).toLowerCase()}.`, { ok: true });
  }
  async function archive() {
    await supabase.from('hk_tasks').update({ archived: true }).eq('id', t!.id);
    hkTasks.reload(); close(); toast('Tirada da lista.');
  }
  const next = h ? nextVisit(h.weekdays, due && due > todayStr() ? due : todayStr()) : null;
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        <p className="l">{t ? t.title : once ? `Pedir uma tarefa${h ? ` a ${h.name}` : ''}` : 'Nova tarefa da rotina'}</p>
        <label>O quê<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={once ? 'ex.: Limpar o forno' : 'ex.: Limpar os vidros da sala'} maxLength={80} autoFocus={!t} /></label>
        {once && visits.length > 0 && <>
          <span className="s">Para que visita</span>
          <div className="chips wrap" role="group" aria-label="Para que visita">{visits.map((d) => <button key={d} type="button" className="press" aria-pressed={due === d} onClick={() => setDue(d)}>{cap(dayLabel(d))}</button>)}</div>
        </>}
        {!once && <div className="seg sm" role="group" aria-label="Quando">{REPEATS.map((r) => <button key={r} type="button" className="press" aria-pressed={repeat === r} onClick={() => setRepeat(r)}>{{ visit: 'Cada visita', week: 'Semana', month: 'Mês', once: 'Uma vez' }[r]}</button>)}</div>}
        {repeat === 'once' && (!once || !visits.length) && <label>Para a visita de (opcional)<input type="date" value={due} min={todayStr()} max={addDays(todayStr(), 90)} onChange={(e) => setDue(e.target.value)} /></label>}
        <p className="s">{repeat === 'visit' ? 'Aparece em todas as visitas.' : repeat === 'week' ? 'Aparece até ser feita nessa semana; na semana seguinte volta.' : repeat === 'month' ? 'Aparece até ser feita nesse mês.' : `Aparece ${next ? `na visita de ${dayLabel(next)}` : 'na próxima visita'} e nas seguintes até ser feita.`}</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {t && <button className="back press" onClick={archive}>Tirar da lista</button>}
    </>
  );
}
