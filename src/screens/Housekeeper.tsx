import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useLive } from '@/data/live';
import type { HkLogRow, HkMessageRow, HkRow, HkTaskRow, ShopItem } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Face } from '@/brand/Face';
import { store } from '@/lib/store';
import { dayLabel, todayStr } from '@/lib/dates';
import { isVisitDay, nextVisit, visitList } from '@/lib/hk';
import { CHEERS, DONE, greeting, ofDay, pickCheer, type CheerMemory } from '@/lib/cheer';
import { MsgBody, seenKey, sendPhoto } from './Housekeeping';
import { aisleOf } from './Shop';

// A NIKKI de quem faz o housekeeping. Pensada para quem usa pouco o telemóvel: letra grande, uma coisa de cada vez,
// botões grandes com palavras, e uma mensagem de boas-vindas diferente em cada dia, que agradece o trabalho.
// Trata a pessoa na 3.ª pessoa («toque», «escreva», «a sua visita»).
// Só a lista da visita, as mensagens e pedir produtos; nunca dinheiro, agenda ou o resto da casa.

type View = 'home' | 'msgs' | 'ask';
const QUICK = ['Já terminei por hoje.', 'Falta um produto, pus na lista.', 'Hoje chego mais tarde.', 'Hoje não posso vir.', 'Encontrei uma avaria.', 'Até à próxima!'];
const PRODUCTS = ['Detergente da loiça', 'Detergente da roupa', 'Lixívia', 'Sacos do lixo', 'Papel higiénico', 'Esponjas', 'Limpa-vidros', 'Pastilhas da máquina', 'Rolo de cozinha', 'Amaciador'];

export function Housekeeper() {
  const { me, house, members } = useSession();
  const h = house?.id;
  const card = useLive<HkRow>('housekeeping', h, 'id, profile_id, name, weekdays, start_time, monthly_pay, pay_day, pay_nth, pay_weekday, pay_remind, bill_id, archived, created_at', { column: 'created_at' });
  const tasks = useLive<HkTaskRow>('hk_tasks', h, 'id, title, repeat, due_on, archived, chore_id, created_at', { column: 'created_at' });
  const log = useLive<HkLogRow>('hk_log', h, 'id, task_id, done_on, done_by, created_at', { column: 'done_on', ascending: false });
  const msgs = useLive<HkMessageRow>('hk_messages', h, 'id, author_id, body, photo_path, created_at', { column: 'created_at' });
  const shop = useLive<ShopItem>('shopping_items', h, 'id, name, aisle, done, done_by, created_by, created_at', { column: 'created_at' });
  const [view, setView] = useState<View>('home');
  useEffect(() => { scrollTo(0, 0); }, [view]);
  const today = todayStr();
  // A mensagem do dia: guardada no aparelho para não se repetir até ter usado todas.
  const ck = `nikki_hk_cheer_${me?.id}`;
  const [cheer] = useState(() => { let mem: CheerMemory | null = null; try { mem = JSON.parse(store.get(ck) ?? 'null'); } catch { /* nada guardado */ } const m = pickCheer(today, mem); store.set(ck, JSON.stringify(m)); return CHEERS[m.idx]; });
  const sk = seenKey(h, me?.id);
  const [seen, setSeen] = useState(() => store.get(sk) ?? '');
  const last = msgs.rows.at(-1);
  const unread = msgs.rows.filter((m) => m.author_id !== me?.id && m.created_at > seen).length;
  useEffect(() => { if (view === 'msgs' && last) { store.set(sk, last.created_at); setSeen(last.created_at); } }, [view, last, sk]);
  const mine = card.rows.find((r) => !r.archived);
  const weekdays = mine?.weekdays ?? [];
  const list = visitList(tasks.rows, log.rows, today);
  const left = list.filter((i) => !i.done).length;
  const names = members.map((m) => m.name).join(' e ');

  if (view === 'msgs') return <Page title="Mensagens" back={() => setView('home')}><Talk rows={msgs.rows} reload={msgs.reload} names={new Map(members.map((m) => [m.id, m.name]))} /></Page>;
  if (view === 'ask') return <Page title="Pedir produtos" back={() => setView('home')}><Ask shop={shop} /></Page>;
  return (
    <div className="app hk-app"><main className="screen">
      <header className="hk-top"><span style={{ color: 'var(--ink)' }}><Face h={22} /></span><span className="s">{house?.name}</span></header>
      <h1 className="hk-hello">{greeting(new Date().getHours())}, {me?.name}!</h1>
      <p className="hk-cheer">{cheer}{names ? <span className="hk-from">{names}</span> : null}</p>

      <section aria-label="Tarefas de hoje" className="hk-sec">
        <h2 className="hk-h2">{list.length === 0 ? 'Hoje não há tarefas marcadas' : left ? `Tarefas de hoje · faltam ${left}` : ofDay(DONE, today)}</h2>
        {list.length === 0 && <p className="hk-note">Fica ao seu critério. E obrigado na mesma!</p>}
        {weekdays.length > 0 && !isVisitDay(weekdays, today) && <p className="hk-note">Hoje não é dia de visita (a próxima é {dayLabel(nextVisit(weekdays, today))}). Se veio hoje, obrigado! A lista é esta.</p>}
        <BigList list={list} day={today} logs={log} />
        {list.length > 0 && <p className="hk-note">Toque numa tarefa quando a terminar. Se se enganar, toque outra vez.</p>}
      </section>

      <div className="hk-big">
        <button type="button" className="hk-btn press" onClick={() => setView('msgs')}>
          <Icon n="chat" s={30} /><span>Mensagens</span>{unread > 0 && <span className="hk-badge" aria-label={`${unread} novas`}>{unread}</span>}
        </button>
        <button type="button" className="hk-btn press" onClick={() => setView('ask')}>
          <Icon n="basket" s={30} /><span>Pedir produtos</span>
        </button>
      </div>
      <button className="hk-out press" onClick={() => supabase.auth.signOut()}>Sair da NIKKI</button>
    </main></div>
  );
}

/** Uma página com um grande «Voltar» no topo. */
function Page({ title, back, children }: { title: string; back: () => void; children: React.ReactNode }) {
  return (
    <div className="app hk-app"><main className="screen">
      <button type="button" className="hk-back press" onClick={back}><Icon n="back" s={26} /> Voltar</button>
      <h1 className="hk-hello">{title}</h1>
      {children}
    </main></div>
  );
}

/** A lista da visita em ponto grande: toca na linha inteira para marcar (ou desmarcar). */
function BigList({ list, day, logs }: { list: ReturnType<typeof visitList>; day: string; logs: { reload: () => Promise<void>; setRows: (f: (r: HkLogRow[]) => HkLogRow[]) => void } }) {
  const { house, me } = useSession();
  const { toast } = useOverlays();
  async function flip(it: (typeof list)[number]) {
    if (it.done && it.log) {
      logs.setRows((r) => r.filter((l) => l.id !== it.log!.id));
      const { error } = await supabase.from('hk_log').delete().eq('id', it.log.id!);
      if (error) { toast('Não foi possível. Tente outra vez.'); logs.reload(); }
      return;
    }
    logs.setRows((r) => [{ id: 'tmp-' + Date.now(), task_id: it.task.id, done_on: day, done_by: me!.id, created_at: new Date().toISOString() }, ...r]);
    const { error } = await supabase.from('hk_log').insert({ household_id: house!.id, task_id: it.task.id, done_on: day, done_by: me!.id });
    if (error) toast('Não ficou marcado. Tente outra vez.');
    logs.reload();
  }
  return (
    <ul className="hk-list-big">
      {list.map((it) => (
        <li key={it.task.id}>
          <button type="button" role="checkbox" aria-checked={it.done} className={`hk-task press${it.done ? ' done' : ''}`} onClick={() => flip(it)}>
            <span className="hk-tick" aria-hidden="true">{it.done && <Icon n="check" s={26} w={2.6} />}</span>
            <span className="hk-tt">{it.task.title}{it.task.repeat === 'once' && <span className="hk-sub">só desta vez</span>}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Mensagens com a casa: respostas rápidas num toque, ou escrever. As mais recentes em baixo. */
function Talk({ rows, reload, names }: { rows: HkMessageRow[]; reload: () => Promise<void>; names: Map<string, string> }) {
  const { me, house } = useSession();
  const { toast } = useOverlays();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pic = useRef<HTMLInputElement>(null);
  async function photo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const err = await sendPhoto(f, house!.id, me!.id, text.trim());
    setBusy(false);
    if (err) return toast('A fotografia não seguiu. Tente outra vez.');
    setText(''); reload(); toast('Fotografia enviada. Assim fica tudo claro!', { ok: true });
  }
  async function send(t: string) {
    if (!t.trim()) return;
    const { error } = await supabase.from('hk_messages').insert({ household_id: house!.id, author_id: me!.id, body: t.trim().slice(0, 1000) });
    if (error) return toast('A mensagem não seguiu. Tente outra vez.');
    setText(''); reload(); toast('Mensagem enviada. Respondemos logo que pudermos.', { ok: true });
  }
  return (
    <>
      <div className="hk-thread-big">
        {rows.length === 0 && <p className="hk-note">Ainda não há mensagens. Pode escrever à vontade, sobre o que for.</p>}
        {rows.slice(-20).map((m) => (
          <div key={m.id} className={`hk-msg${m.author_id === me?.id ? ' mine' : ''}`}>
            <span className="s">{m.author_id === me?.id ? me?.name : names.get(m.author_id) ?? '—'} · {dayLabel(new Date(m.created_at).toLocaleDateString('sv'))}</span>
            <MsgBody m={m} />
          </div>
        ))}
      </div>
      <input ref={pic} type="file" accept="image/*" hidden onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="hk-send hk-photo press" disabled={busy} onClick={() => pic.current?.click()}><Icon n="cam" s={26} /> {busy ? 'A enviar…' : 'Enviar uma fotografia'}</button>
      <p className="hk-note">Uma torneira a pingar, um produto que acabou, uma mancha que não sai: uma fotografia explica tudo.</p>
      <h2 className="hk-h2">Responder com um toque</h2>
      <div className="hk-quick">{QUICK.map((q) => <button key={q} type="button" className="hk-chip press" onClick={() => send(q)}>{q}</button>)}</div>
      <form className="hk-write" onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }} autoComplete="off">
        <label htmlFor="hk-msg" className="hk-h2">Ou escreva</label>
        <textarea id="hk-msg" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Escreva aqui…" />
        <button className="hk-send press" disabled={!text.trim()}>Enviar <Icon n="arrow" s={24} /></button>
      </form>
    </>
  );
}

/** Pedir produtos: os mais comuns num toque; outro, escrevendo. Entra na lista de compras da casa. */
function Ask({ shop }: { shop: ReturnType<typeof useLive<ShopItem>> }) {
  const { me, house } = useSession();
  const { toast } = useOverlays();
  const [name, setName] = useState('');
  const left = shop.rows.filter((i) => !i.done);
  const has = (n: string) => left.some((i) => i.name.toLowerCase() === n.toLowerCase());
  async function add(n: string) {
    const nice = n.trim()[0].toUpperCase() + n.trim().slice(1);
    if (has(nice)) return toast(`${nice} já está na lista. Bem visto!`, { ok: true });
    const { error } = await supabase.from('shopping_items').insert({ household_id: house!.id, name: nice.slice(0, 80), aisle: aisleOf(nice), created_by: me!.id });
    if (error) return toast('Não ficou na lista. Tente outra vez.');
    setName(''); shop.reload(); toast(`Anotado: ${nice}. Já está na lista!`, { ok: true });
  }
  return (
    <>
      <p className="hk-note">Toque no que falta. Aparece logo na lista de compras da casa.</p>
      <div className="hk-quick">{PRODUCTS.map((p) => (
        <button key={p} type="button" className={`hk-chip press${has(p) ? ' on' : ''}`} onClick={() => add(p)}>{has(p) && <Icon n="check" s={20} w={2.4} />} {p}</button>
      ))}</div>
      <form className="hk-write" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) add(name); }} autoComplete="off">
        <label htmlFor="hk-ask" className="hk-h2">Outra coisa</label>
        <input id="hk-ask" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Escreva o produto" />
        <button className="hk-send press" disabled={!name.trim()}>Pedir <Icon n="plus" s={24} /></button>
      </form>
      {left.length > 0 && <>
        <h2 className="hk-h2">Já está na lista</h2>
        <ul className="hk-asked">{left.map((i) => <li key={i.id}>{i.name}{i.created_by === me?.id ? <span className="hk-sub">pedido seu</span> : null}</li>)}</ul>
      </>}
    </>
  );
}
