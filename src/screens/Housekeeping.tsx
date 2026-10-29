import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type HkLogRow, type HkMessageRow, type HkRow, type HkTaskRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { store } from '@/lib/store';
import { addDays, dayLabel, daysInMonth, monthKey, monthName, todayStr, weekdayName, WEEKDAYS } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { eur, parseAmount, toU } from '@/lib/money';
import { visitsBetween, daysLabel, hasPayRule, history, nextVisit, payDateOf, payDue, payRuleLabel, repeatLabel, visitList, type HkRepeat } from '@/lib/hk';
import { Top } from './Home';
import { shareInvite } from './People';
import { Shot, rid, shrink } from './Tickets';

// Housekeeping, do lado da casa: quem ajuda, em que dias vem, a lista de cada visita, mensagens nos dois sentidos,
// os produtos que ela pede e o pagamento mensal fixo. Ela tem uma conta própria com um papel limitado (vê só a
// lista, as mensagens e as compras). Regras em docs/CALCULOS.md, secção 9.

const REPEATS: HkRepeat[] = ['visit', 'week', 'month', 'once'];
const month = (m: string) => monthName(m);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const dt = (d: string) => shortDate(`${d}T12:00:00`);

/** Mensagens novas da outra parte: guarda no aparelho a hora da última vista. */
export const seenKey = (h: string | undefined, me: string | undefined) => `nikki_hk_seen_${h}_${me}`;

/** Meses pagos: os marcados aqui e os que ficaram na conta fixa da Casa (se se pagou por lá). */
export function usePaid(h: HkRow | undefined) {
  const { hkPaid, billPayments } = useHouse();
  if (!h) return [];
  return [...hkPaid.rows.filter((p) => p.hk_id === h.id).map((p) => p.month), ...(h.bill_id ? billPayments.rows.filter((p) => p.bill_id === h.bill_id && p.amount !== null).map((p) => p.period_to.slice(0, 7)) : [])];
}

export function Housekeeping() {
  const { hk } = useHouse();
  const h = hk.rows.find((r) => !r.archived);
  if (hk.loading) return null;
  if (!h) return <><Top title="Housekeeping" /><HkForm /></>;
  return <HkMain h={h} />;
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

/** O painel: um botão por parte (como a Casa), cada um com o que lá está agora. */
function HkMain({ h }: { h: HkRow }) {
  const { staff } = useSession();
  const { hkTasks, hkLog, shop } = useHouse();
  const { open } = useOverlays();
  const today = todayStr();
  const next = nextVisit(h.weekdays, today);
  const recurring = hkTasks.rows.filter((t) => !t.archived && t.repeat !== 'once').length;
  const once = hkTasks.rows.filter((t) => !t.archived && t.repeat === 'once' && !hkLog.rows.some((l) => l.task_id === t.id)).length;
  const her = staff.find((s) => s.id === h.profile_id);
  const asked = shop.rows.filter((i) => !i.done && i.created_by === h.profile_id);
  const unread = useHkUnread(h);
  const paid = usePaid(h);
  const due = h.monthly_pay ? payDue({ ...h, monthly_pay: Number(h.monthly_pay) }, paid, today)[0] : undefined;
  const lastVisit = history(hkTasks.rows, hkLog.rows.filter((l) => l.done_on < today), 1)[0];
  const days = planDays(h.weekdays, today);
  const tile = (k: string, ic: string, t: string, d: string, hot = false) => <Link key={k} className={`tile ctile press${hot ? ' hot' : ''}`} to={`/housekeeping/${k}`}><Icon n={ic} s={22} /><span className="l">{t}</span><span className="s">{d}</span></Link>;
  return (
    <>
      <Top title={h.name} />
      <p className="s" style={{ fontSize: 'var(--t-m)' }}>{daysLabel(h.weekdays, h.start_time)} · próxima visita {dayLabel(next)}</p>
      {!her && <div className="tile read-card"><span className="st2"><span>{h.name} ainda não tem a NIKKI</span><span className="s">Com uma conta própria, vê a lista de cada visita, troca mensagens convosco e pede produtos.</span></span><div className="actions"><button className="btn press" onClick={() => open(<HkInvite h={h} />)}>Convidar <Icon n="arrow" s={18} /></button></div></div>}
      <section className="stack" aria-label="Planear as visitas">
        <div className="wbar"><span className="s">Planear as visitas</span>{once > 0 && <span className="s">{once} {once === 1 ? 'pontual' : 'pontuais'} por fazer</span>}</div>
        <div className="hk-days">{days.map((d) => {
          const l = visitList(hkTasks.rows, hkLog.rows, d), extra = l.filter((i) => i.task.repeat === 'once').length;
          return (
            <Link key={d} className={`tile hk-day press${d === today ? ' today' : ''}`} to={`/housekeeping/dia/${d}`}>
              <span className="s">{d === today ? 'Hoje' : cap(weekdayName(d))}</span>
              <span className="l">{Number(d.slice(8, 10))} {monthName(d.slice(0, 7)).slice(0, 3)}</span>
              <span className="s">{d === today ? `${l.filter((i) => i.done).length} de ${l.length} feitas` : `${l.length} ${l.length === 1 ? 'tarefa' : 'tarefas'}${extra ? ` · ${extra} ${extra === 1 ? 'pontual' : 'pontuais'}` : ''}`}</span>
            </Link>
          );
        })}</div>
      </section>
      <div className="casa-tiles">
        {tile('mensagens', 'chat', 'Mensagens', unread.length ? `${unread.length} ${unread.length === 1 ? 'nova' : 'novas'}` : 'escrever um recado', unread.length > 0)}
        {tile('tarefas', 'broom', 'Tarefas da rotina', recurring ? `${recurring} planeadas` : 'planear')}
        {tile('pagamento', 'coins', 'Pagamento', due ? (due.late > 0 ? 'por pagar' : due.late === 0 ? 'paga-se hoje' : `preparar · ${dayLabel(due.due)}`) : h.monthly_pay ? `${eur(toU(h.monthly_pay), 0)} € por mês` : 'por definir', !!due)}
        {tile('pedidos', 'basket', 'Produtos pedidos', asked.length ? `${asked.length} na lista` : 'nada pedido', asked.length > 0)}
        <button type="button" className="tile ctile press" onClick={() => open(<HkForm h={h} />)}><Icon n="cal" s={22} /><span className="l">Dias e valor</span><span className="s">{daysLabel(h.weekdays).toLowerCase()}</span></button>
        {tile('historico', 'bars', 'Visitas feitas', lastVisit ? `última ${dayLabel(lastVisit.day)}` : 'ainda nenhuma')}
      </div>
    </>
  );
}

/** Cada parte do painel, no seu ecrã (/housekeeping/:part). */
/** As próximas visitas a planear: os dias de visita das próximas 4 semanas (até 6); sem dias fixos, os próximos 7 dias. */
export const planDays = (weekdays: number[], today: string) => (weekdays.length ? visitsBetween(weekdays, today, addDays(today, 28)).slice(0, 6) : Array.from({ length: 7 }, (_, j) => addDays(today, j)));

/** Um dia de visita: a lista que a pessoa vai ver (a rotina mais o que é só desse dia), e juntar tarefas só para ele. */
export function HkDay() {
  const { day = todayStr() } = useParams();
  const { me, house } = useSession();
  const { hk, hkTasks, hkLog } = useHouse();
  const { toast } = useOverlays();
  const [text, setText] = useState('');
  const h = hk.rows.find((r) => !r.archived);
  if (hk.loading) return null;
  if (!h) return <Navigate to="/housekeeping" replace />;
  const today = todayStr();
  const list = visitList(hkTasks.rows, hkLog.rows, day);
  const just = list.filter((i) => i.task.repeat === 'once'), routine = list.filter((i) => i.task.repeat !== 'once');
  const days = planDays(h.weekdays, today), k = days.indexOf(day);
  async function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const { error } = await supabase.from('hk_tasks').insert({ household_id: house!.id, title: t.slice(0, 80), repeat: 'once', due_on: day, created_by: me!.id });
    if (error) { setText(t); return toast(error.message); }
    hkTasks.reload();
  }
  async function drop(id: string) {
    await supabase.from('hk_tasks').update({ archived: true }).eq('id', id);
    hkTasks.reload();
  }
  return (
    <>
      <Top title={day === today ? 'Visita de hoje' : `${cap(weekdayName(day))}, ${dt(day)}`} />
      <p className="s">{list.length} {list.length === 1 ? 'tarefa' : 'tarefas'}. É esta a lista que {h.name} vê {day === today ? 'hoje' : 'nesse dia'}.</p>
      <form className="add-row" onSubmit={add} autoComplete="off">
        <label className="sr" htmlFor="hk-day-add">Juntar uma tarefa só para este dia</label>
        <input id="hk-day-add" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Juntar só para este dia…" maxLength={80} />
        <button className="sq press" aria-label="Juntar"><Icon n="plus" /></button>
      </form>
      {day <= today ? <VisitChecklist list={list} day={day} logs={hkLog} /> : <>
        <section className="stack" aria-label="Só neste dia">
          <span className="s">Só neste dia</span>
          {just.length ? <div className="tile card rows">{just.map((i) => (
            <div key={i.task.id}><span className="st2"><span>{i.task.title}</span><span className="s">{i.task.chore_id ? 'da manutenção da casa' : i.task.due_on && i.task.due_on < day ? `pedida para ${dayLabel(i.task.due_on)}, ainda por fazer` : !i.task.due_on ? 'para a próxima visita' : 'pontual'}</span></span>
              <button type="button" className="x-btn press" aria-label={`Tirar: ${i.task.title}`} onClick={() => drop(i.task.id)}><Icon n="close" s={14} /></button></div>
          ))}</div> : <p className="s">Nada de especial. Junte acima o que for só para este dia.</p>}
        </section>
        <section className="stack" aria-label="Da rotina">
          <div className="wbar"><span className="s">Da rotina</span><Link className="tb quiet press" to="/housekeeping/tarefas">Mudar a rotina</Link></div>
          {routine.length ? <div className="tile card rows">{routine.map((i) => <div key={i.task.id}><span className="st2"><span>{i.task.title}</span><span className="s">{repeatLabel(i.task.repeat).toLowerCase()}</span></span></div>)}</div> : <p className="s">Sem tarefas da rotina neste dia.</p>}
        </section>
      </>}
      <div className="two-btn">
        {k > 0 ? <Link className="btn quiet press" to={`/housekeeping/dia/${days[k - 1]}`} replace><Icon n="back" s={18} /> {dayLabel(days[k - 1])}</Link> : <span />}
        {k >= 0 && k < days.length - 1 ? <Link className="btn quiet press" to={`/housekeeping/dia/${days[k + 1]}`} replace>{dayLabel(days[k + 1])} <Icon n="arrow" s={18} /></Link> : <span />}
      </div>
    </>
  );
}

export function HkPart() {
  const { part } = useParams();
  const { hk } = useHouse();
  const h = hk.rows.find((r) => !r.archived);
  if (hk.loading) return null;
  if (!h) return <Navigate to="/housekeeping" replace />;
  if (part === 'tarefas') return <HkTasks h={h} />;
  if (part === 'mensagens') return <HkMessages h={h} />;
  if (part === 'pagamento') return <><Top title={`Pagamento · ${h.name}`} /><PaySection h={h} /><PaidList h={h} /></>;
  if (part === 'pedidos') return <HkAsked h={h} />;
  if (part === 'historico') return <HkHistory />;
  return <Navigate to="/housekeeping" replace />;
}

function HkTasks({ h }: { h: HkRow }) {
  const { hkTasks } = useHouse();
  const { open } = useOverlays();
  const tasks = hkTasks.rows.filter((t) => !t.archived);
  return (
    <>
      <Top title="Tarefas da rotina" right={<button className="tb press" onClick={() => open(<TaskSheet />)}>Nova</button>} />
      {tasks.length ? REPEATS.filter((r) => tasks.some((t) => t.repeat === r)).map((r) => (
        <section key={r} className="stack" aria-label={repeatLabel(r)}>
          <span className="s">{repeatLabel(r)}</span>
          <div className="tile card rows">{tasks.filter((t) => t.repeat === r).map((t) => (
            <button key={t.id} type="button" className="press" onClick={() => open(<TaskSheet t={t} />)}>
              <span className="st2"><span>{t.title}</span>{t.repeat === 'once' && t.due_on && <span className="s">{dayLabel(t.due_on)}</span>}</span><Icon n="chev" s={16} />
            </button>
          ))}</div>
        </section>
      )) : <p className="s">Casas de banho, aspirar, mudar as camas, passar a ferro… Cada tarefa entra em cada visita, uma vez por semana ou uma vez por mês. {h.name} vê a lista de cada visita no telemóvel e vai marcando.</p>}
    </>
  );
}

function HkMessages({ h }: { h: HkRow }) {
  const { me, house, members, staff } = useSession();
  const { hkMessages } = useHouse();
  // Abrir as mensagens conta como vê-las (o aviso sai do início).
  const sk = seenKey(house?.id, me?.id);
  const last = hkMessages.rows.at(-1)?.created_at;
  useEffect(() => { if (last) store.set(sk, last); }, [last, sk]);
  return (
    <>
      <Top title={`Mensagens · ${h.name}`} />
      <Thread rows={hkMessages.rows} reload={hkMessages.reload} names={new Map([...members, ...staff].map((m) => [m.id, m.name]))} />
    </>
  );
}

function HkAsked({ h }: { h: HkRow }) {
  const { shop } = useHouse();
  const asked = shop.rows.filter((i) => !i.done && i.created_by === h.profile_id);
  return (
    <>
      <Top title="Produtos pedidos" right={<Link className="tb press" to="/compras">Compras</Link>} />
      {asked.length ? <div className="tile card rows">{asked.map((i) => <div key={i.id}><span className="st2"><span>{i.name}</span><span className="s">{i.aisle}</span></span><span className="v s">{dayLabel(i.created_at.slice(0, 10))}</span></div>)}</div>
        : <p className="s">{h.name} não pediu nada por agora. O que pedir entra na lista de compras, para quem for ao supermercado.</p>}
    </>
  );
}

function HkHistory() {
  const { hkTasks, hkLog } = useHouse();
  const past = history(hkTasks.rows, hkLog.rows.filter((l) => l.done_on <= todayStr()), 20);
  return (
    <>
      <Top title="Visitas feitas" />
      {past.length ? <div className="tile card rows">{past.map((d) => <div key={d.day}><span className="st2"><span>{cap(dayLabel(d.day))}</span><span className="s">{d.titles.join(', ')}</span></span></div>)}</div> : <p className="s">Ainda nenhuma visita registada.</p>}
    </>
  );
}

/** Os meses já pagos. */
function PaidList({ h }: { h: HkRow }) {
  const paid = [...new Set(usePaid(h))].sort().reverse().slice(0, 12);
  return paid.length ? <section className="stack" aria-label="Pagos"><span className="s">Pagos</span><div className="tile card rows">{paid.map((m) => <div key={m}><span>{cap(month(m))} {m.slice(0, 4)}</span><span className="v s">{h.monthly_pay ? `${eur(toU(h.monthly_pay), 0)} €` : ''}</span></div>)}</div></section> : null;
}

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

function PaySection({ h }: { h: HkRow }) {
  const paid = usePaid(h);
  const payIt = useHkPay();
  const today = todayStr();
  if (!h.monthly_pay) return null;
  const due = payDue({ ...h, monthly_pay: Number(h.monthly_pay) }, paid, today);
  const v = Number(h.monthly_pay);
  const pay = (m: string) => payIt(h, m);
  const lastPaid = [...paid].sort().at(-1);
  return (
    <section className="stack" aria-label="Pagamento">
      <div className="wbar"><span className="s">Pagamento</span><span className="s">{eur(toU(v), 0)} € por mês{hasPayRule(h) ? `, ${payRuleLabel(h)}` : ''}</span></div>
      {due.length ? <div className="tile card rows">{due.map((d) => (
        <div key={d.month}>
          <span className="st2"><span>{cap(month(d.month))}</span><span className={`s${d.late > 0 ? ' warn' : ''}`}>{d.late > 0 ? `era para ${dayLabel(d.due)}` : d.late === 0 ? 'paga-se hoje' : `paga-se ${dayLabel(d.due)}: altura de preparar`}</span></span>
          <button className="tb press" onClick={() => pay(d.month)}>Paguei</button>
        </div>
      ))}</div> : <p className="s">{lastPaid ? `${cap(month(lastPaid))} pago. ` : ''}{hasPayRule(h) ? `O próximo: ${payRuleLabel(h)}; a NIKKI avisa ${h.pay_remind === 7 ? 'uma semana' : h.pay_remind === 1 ? 'um dia' : `${h.pay_remind ?? 3} dias`} antes.` : 'Sem dia de pagar marcado.'}</p>}
    </section>
  );
}

/** Ligar o housekeeping ou editar: nome, dias de visita, hora, valor mensal e dia de pagar. */
function HkForm({ h }: { h?: HkRow }) {
  const { me, house } = useSession();
  const { hk, bills, on } = useHouse();
  const { close, open, toast } = useOverlays();
  const [name, setName] = useState(h?.name ?? '');
  const [days, setDays] = useState<number[]>(h?.weekdays ?? []);
  const [time, setTime] = useState(h?.start_time?.slice(0, 5) ?? '09:00');
  const [pay, setPay] = useState(h?.monthly_pay ? String(h.monthly_pay).replace('.', ',') : '');
  const [payDay, setPayDay] = useState(String(h?.pay_day ?? ''));
  const [mode, setMode] = useState<'day' | 'week'>(h?.pay_nth ? 'week' : 'day');
  const [nth, setNth] = useState<number>(h?.pay_nth ?? -1);
  const [wd, setWd] = useState<number>(h?.pay_weekday ?? 5);
  const [remind, setRemind] = useState<number>(h?.pay_remind ?? 3);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!name.trim()) return setErr('Como se chama?');
    const v = pay.trim() ? parseAmount(pay) : null;
    if (pay.trim() && !v) return setErr('O valor escreve-se assim: 320 ou 320,50.');
    const d = mode === 'day' && payDay.trim() ? Number(payDay) : null;
    if (d !== null && !(d >= 1 && d <= 31)) return setErr('O dia de pagar vai de 1 a 31.');
    const row = { name: name.trim().slice(0, 40), weekdays: [...days].sort(), start_time: time || null, monthly_pay: v, pay_day: d, pay_nth: mode === 'week' ? nth : null, pay_weekday: mode === 'week' ? wd : null, pay_remind: remind };
    if (h) {
      const { error } = await supabase.from('housekeeping').update(row).eq('id', h.id);
      if (error) return setErr(error.message);
      if (h.bill_id && v) await supabase.from('bills').update({ expected: v, name: `Housekeeping`, keywords: `housekeeping, ${row.name.toLowerCase()}` }).eq('id', h.bill_id);
      hk.reload(); bills.reload(); close(); return toast('Guardado.', { ok: true });
    }
    // Com a Casa ligada, o valor mensal entra nas contas fixas (e no custo por ano da casa).
    let bill_id: string | null = null;
    if (on('casa') && v) {
      const b = await supabase.from('bills').insert({ household_id: house!.id, kind: 'outra', name: 'Housekeeping', keywords: `housekeeping, ${row.name.toLowerCase()}`, every_months: 1, expected: v, created_by: me!.id }).select('id').single();
      if (!b.error) bill_id = (b.data as { id: string }).id;
    }
    const { data, error } = await supabase.from('housekeeping').insert({ household_id: house!.id, ...row, bill_id, created_by: me!.id }).select('*').single();
    if (error) return setErr(error.message);
    hk.reload(); bills.reload();
    open(<HkInvite h={data as HkRow} first />);
  }
  async function archive() {
    await supabase.from('housekeeping').update({ archived: true }).eq('id', h!.id);
    if (h!.bill_id) await supabase.from('bills').update({ archived: true }).eq('id', h!.bill_id);
    hk.reload(); bills.reload(); close();
    toast(`${h!.name} saiu do housekeeping. Fica o histórico.`);
  }
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        {h ? <p className="l">{h.name}</p> : <p className="s" style={{ fontSize: 'var(--t-m)' }}>Quem vos ajuda em casa. Tem uma conta própria na NIKKI, só com a lista de cada visita, as mensagens e as compras: nunca vê dinheiro, agenda ou o resto da casa.</p>}
        <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Maria" maxLength={40} /></label>
        <span className="s">Dias de visita</span>
        <div className="chips wk" role="group" aria-label="Dias de visita">{WEEKDAYS.map((l, j) => (
          <button key={j} type="button" className="press" aria-pressed={days.includes(j + 1)} aria-label={['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][j]} onClick={() => setDays(days.includes(j + 1) ? days.filter((x) => x !== j + 1) : [...days, j + 1])}>{l}</button>
        ))}</div>
        <p className="s">{daysLabel(days, time)}</p>
        <div className="two">
          <label>Hora<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label>Por mês (€)<input inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="ex.: 320" /></label>
        </div>
        <span className="s">Quando se paga</span>
        <div className="seg sm" role="group" aria-label="Quando se paga">
          <button type="button" className="press" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Dia do mês</button>
          <button type="button" className="press" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Dia da semana</button>
        </div>
        {mode === 'day' ? <label>Dia de pagar<input inputMode="numeric" value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder="ex.: 28" /></label> : <>
          <div className="chips wrap" role="group" aria-label="Qual">{([[1, '1.ª'], [2, '2.ª'], [3, '3.ª'], [4, '4.ª'], [-1, 'Última']] as [number, string][]).map(([n, l]) => <button key={n} type="button" className="press" aria-pressed={nth === n} onClick={() => setNth(n)}>{l}</button>)}</div>
          <div className="chips wk" role="group" aria-label="Dia da semana">{WEEKDAYS.map((l, j) => <button key={j} type="button" className="press" aria-pressed={wd === j + 1} aria-label={['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][j]} onClick={() => setWd(j + 1)}>{l}</button>)}</div>
          <p className="s">{cap(payRuleLabel({ monthly_pay: 1, pay_day: null, pay_nth: nth, pay_weekday: wd, created_at: '' }))}: este mês, {dayLabel(payDateOf(monthKey(todayStr()), { monthly_pay: 1, pay_day: null, pay_nth: nth, pay_weekday: wd, created_at: '' }) ?? todayStr())}.</p>
        </>}
        <span className="s">Avisar antes, para preparar o pagamento</span>
        <div className="seg sm" role="group" aria-label="Avisar antes">{([[1, '1 dia'], [3, '3 dias'], [5, '5 dias'], [7, '1 semana']] as [number, string][]).map(([n, l]) => <button key={n} type="button" className="press" aria-pressed={remind === n} onClick={() => setRemind(n)}>{l}</button>)}</div>
        <p className="s">Valor fixo por mês. A NIKKI avisa {remind === 7 ? 'uma semana' : remind === 1 ? 'um dia' : `${remind} dias`} antes, para dar tempo de preparar o pagamento; «Paguei» põe a despesa em Casa{on('casa') ? ' e nas contas fixas' : ''}.</p>
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">{h ? 'Guardar' : 'Continuar'} <Icon n={h ? 'check' : 'arrow'} s={20} /></button>
      </form>
      {h && <button className="back press" onClick={archive}>Deixou de vir</button>}
    </>
  );
}

/** Convite com o papel de housekeeping: entra mesmo com a casa já com duas pessoas e não conta como uma delas. */
function HkInvite({ h, first }: { h: HkRow; first?: boolean }) {
  const { me, house } = useSession();
  const { close, toast } = useOverlays();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  async function send(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!email.includes('@')) return setErr('Escreve o e-mail para o convite.');
    const { data, error } = await supabase.from('invites').insert({ household_id: house!.id, email: email.trim().toLowerCase(), role: 'staff', created_by: me!.id }).select('token, code, email').single();
    if (error) return setErr(error.message);
    await shareInvite(data as { token: string; code: string }, house?.name ?? 'NIKKI', toast);
    close();
    toast(`Convite para ${h.name}. Quando entrar, vê a lista das visitas.`, { ok: true });
  }
  return (
    <form className="form" onSubmit={send} autoComplete="off">
      <p className="l">{first ? `${h.name} na NIKKI` : `Convidar ${h.name}`}</p>
      <p className="s">Com uma conta própria, {h.name} vê a lista de cada visita e marca o que fez, troca mensagens convosco e pede produtos para a lista de compras. Nada mais.</p>
      <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.pt" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn wide press">Criar convite <Icon n="arrow" s={20} /></button>
      {first && <button type="button" className="back press" onClick={close}>Agora não</button>}
    </form>
  );
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
