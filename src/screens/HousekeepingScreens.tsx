// Os ecrãs de Housekeeping que só se abrem pela rota: carregam-se à parte, quando se abrem.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type HkRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { store } from '@/lib/store';
import { dayLabel, monthKey, monthName, todayStr, weekdayName, WEEKDAYS } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { eur, parseAmount, toU } from '@/lib/money';
import { daysLabel, hasPayRule, history, nextVisit, payDateOf, payDue, payRuleLabel, repeatLabel, visitList } from '@/lib/hk';
import { Top } from './Home';
import { shareInvite } from './People';
import { REPEATS, month, cap, seenKey, usePaid, useHkUnread, planDays, VisitChecklist, Thread, useHkPay, TaskSheet } from './Housekeeping';

const dt = (d: string) => shortDate(`${d}T12:00:00`);

export function Housekeeping() {
  const { hk } = useHouse();
  const h = hk.rows.find((r) => !r.archived);
  if (hk.loading) return null;
  if (!h) return <><Top title="Housekeeping" /><HkForm /></>;
  return <HkMain h={h} />;
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
          ))}</div> : <p className="s">Nada de especial. Junta acima o que for só para este dia.</p>}
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
