import { Suspense, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type ChoreRow, type WarrantyRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { eur, parseAmount } from '@/lib/money';
import { addDays, dayLabel, todayStr } from '@/lib/dates';
import { shortDate } from '@/lib/admin';
import { MAINTENANCE, addPeriod, everyLabel, readReceipt, warrantyState, type Assign, type Unit } from '@/lib/chores';
import { invoiceText } from '@/lib/ocr';
import { Shot, rid, shrink } from './Tickets';
import { Loading, later } from '@/ui/lazy';
const Scanner = later(() => import('@/ui/Scanner'), 'Scanner');
import { MaintDoneSheet, useChoreDone } from './Today';

// Casa, fase 2: tarefas que se repetem (de alguém, à vez ou de quem pegar), manutenção (com sugestões) e garantias
// (com a foto do talão, privada da casa). Regras em docs/CALCULOS.md, secção 6d.

const dt = (d: string) => shortDate(`${d}T12:00:00`);
const when = (d: string, today = todayStr()) => (d < today ? `atrasada desde ${dt(d)}` : d <= addDays(today, 6) ? dayLabel(d) : dt(d));
const UNITS: [Unit, string][] = [['day', 'dias'], ['week', 'semanas'], ['month', 'meses'], ['year', 'anos']];

function useWho() {
  const { me, partner } = useSession();
  return (c: ChoreRow) => (c.assign === 'anyone' ? 'quem pegar' : c.turn_id === me?.id ? (c.assign === 'rotate' ? 'à vez · tu' : 'tu') : c.turn_id === partner?.id ? (c.assign === 'rotate' ? `à vez · ${partner.name}` : partner.name) : '—');
}

/** Tarefas ou manutenção de uma casa (ou de todas): o quê, de quanto em quanto tempo, de quem e quando é a próxima. */
export function ChoresSection({ kind, home, homeOf }: { kind: 'task' | 'maintenance'; home: string | null; homeOf: (h: string | null) => string | null }) {
  const { chores } = useHouse();
  const { open } = useOverlays();
  const who = useWho();
  const list = chores.rows.filter((c) => !c.archived && c.kind === kind && (!home || homeOf(c.home_id ?? null) === home)).sort((a, b) => a.next_on.localeCompare(b.next_on));
  const maint = kind === 'maintenance';
  return (
    <section className="stack" aria-label={maint ? 'Manutenção' : 'Tarefas'}>
      <div className="wbar"><span className="s">{list.length ? `${list.length} ${maint ? 'coisas' : list.length === 1 ? 'tarefa' : 'tarefas'}` : ''}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {maint && <button className="tb quiet press" onClick={() => open(<SuggestSheet home={home} />)}>Sugestões</button>}
          <button className="tb press" onClick={() => open(<ChoreSheet kind={kind} home={home} />)}>{maint ? 'Nova' : 'Nova tarefa'}</button>
        </span>
      </div>
      {list.length ? <div className="tile card rows">{list.map((c) => (
        <div key={c.id}>
          <button type="button" className="row-main press" onClick={() => open(<ChoreSheet kind={kind} chore={c} home={home} />)}>
            <span className="st2"><span>{c.title}</span><span className="s">{everyLabel(c.every_n, c.every_unit)} · {who(c)} · <span className={c.next_on <= todayStr() ? 'warn' : ''}>{c.next_on <= todayStr() ? (c.next_on < todayStr() ? when(c.next_on) : 'hoje') : when(c.next_on)}</span></span></span>
          </button>
          {c.next_on <= addDays(todayStr(), maint ? 14 : 0) && <DoneButton c={c} />}
        </div>
      ))}</div> : <p className="s">{maint ? 'Caldeira, filtros, detetores de fumo… Em «Sugestões» escolhes as que se aplicam e a NIKKI lembra antes de avariar.' : 'Mudar os lençóis, regar as plantas, pôr o lixo… Cada tarefa aparece no «Hoje» de quem for a vez. Acabou-se o «eu fiz da última vez».'}</p>}
    </section>
  );
}

function DoneButton({ c }: { c: ChoreRow }) {
  const { open, toast } = useOverlays();
  const done = useChoreDone();
  return <button className="tb press" onClick={async () => {
    if (c.kind === 'maintenance') return open(<MaintDoneSheet c={c} />);
    const r = await done(c);
    toast(r.error ?? `${c.title}: feito.`, { ok: !r.error });
  }}>Feito</button>;
}

/** Nova tarefa (ou manutenção) ou editar: o quê, de quanto em quanto tempo, a próxima data e de quem é. */
function ChoreSheet({ kind, chore, home, preset }: { kind: 'task' | 'maintenance'; chore?: ChoreRow; home: string | null; preset?: { title: string; every_n: number; every_unit: Unit } }) {
  const { me, partner, house } = useSession();
  const { chores, homes } = useHouse();
  const { close, toast } = useOverlays();
  const places = homes.rows.filter((h) => !h.archived);
  const [place, setPlace] = useState<string | null>(chore?.home_id ?? home ?? places[0]?.id ?? null);
  const [title, setTitle] = useState(chore?.title ?? preset?.title ?? '');
  const [n, setN] = useState(String(chore?.every_n ?? preset?.every_n ?? 1));
  const [unit, setUnit] = useState<Unit>(chore?.every_unit ?? preset?.every_unit ?? (kind === 'task' ? 'week' : 'year'));
  const [next, setNext] = useState(chore?.next_on ?? todayStr());
  const [assign, setAssign] = useState<Assign>(chore?.assign ?? (kind === 'task' && partner ? 'rotate' : 'anyone'));
  const [turn, setTurn] = useState<string | null>(chore?.turn_id ?? me!.id);
  const [err, setErr] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!title.trim()) return setErr('O que é? (ex.: mudar os lençóis)');
    const k = Number(n);
    if (!(k >= 1 && k <= 60)) return setErr('De 1 a 60.');
    const row = { household_id: house!.id, home_id: place, kind, title: title.trim().slice(0, 60), every_n: k, every_unit: unit, next_on: next || todayStr(), assign: partner ? assign : 'fixed' as Assign, turn_id: partner ? (assign === 'anyone' ? null : turn) : me!.id };
    const { error } = chore ? await supabase.from('chores').update(row).eq('id', chore.id) : await supabase.from('chores').insert({ ...row, created_by: me!.id });
    if (error) return setErr(error.message);
    chores.reload(); close();
    toast(chore ? 'Guardado.' : `${row.title}: ${everyLabel(k, unit)}, a começar ${dayLabel(row.next_on)}.`, { ok: true });
  }
  async function archive() {
    await supabase.from('chores').update({ archived: true }).eq('id', chore!.id);
    chores.reload(); close(); toast('Arquivada. Fica o histórico, sai da vista.');
  }
  return (
    <>
      <form className="form" onSubmit={save}>
        <p className="l">{chore ? chore.title : kind === 'task' ? 'Nova tarefa' : 'Nova manutenção'}</p>
        <label>O quê<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'task' ? 'ex.: Mudar os lençóis' : 'ex.: Revisão da caldeira'} maxLength={60} /></label>
        <div className="two">
          <label>A cada<input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></label>
          <label>Próxima<input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        </div>
        <div className="seg sm" role="group" aria-label="Unidade">{UNITS.map(([u, l]) => <button key={u} type="button" className="press" aria-pressed={unit === u} onClick={() => setUnit(u)}>{l}</button>)}</div>
        <p className="s">{everyLabel(Number(n) || 1, unit)}; depois de feita, a seguinte fica para {dt(addPeriod(todayStr(), Number(n) || 1, unit))} (conta do dia em que se faz).</p>
        {partner && <>
          <span className="s">De quem</span>
          <div className="seg sm" role="group" aria-label="De quem">
            <button type="button" className="press" aria-pressed={assign === 'rotate'} onClick={() => setAssign('rotate')}>À vez</button>
            <button type="button" className="press" aria-pressed={assign === 'fixed'} onClick={() => setAssign('fixed')}>Sempre a mesma</button>
            <button type="button" className="press" aria-pressed={assign === 'anyone'} onClick={() => setAssign('anyone')}>Quem pegar</button>
          </div>
          {assign !== 'anyone' && <div className="chips" role="group" aria-label={assign === 'rotate' ? 'Começa' : 'Quem'}>
            <span className="s" style={{ alignSelf: 'center' }}>{assign === 'rotate' ? 'Começa:' : 'Quem:'}</span>
            <button type="button" className="press" aria-pressed={turn === me!.id} onClick={() => setTurn(me!.id)}>Eu</button>
            <button type="button" className="press" aria-pressed={turn === partner.id} onClick={() => setTurn(partner.id)}>{partner.name}</button>
          </div>}
          <p className="s">{assign === 'rotate' ? 'Alterna entre os dois: quem faz passa a vez ao outro.' : assign === 'fixed' ? 'Aparece sempre no «Hoje» da mesma pessoa.' : 'Aparece no «Hoje» dos dois; sai quando um a fizer.'}</p>
        </>}
        {places.length > 1 && <div className="chips" role="group" aria-label="Que casa">{places.map((h) => <button key={h.id} type="button" className="press" aria-pressed={place === h.id} onClick={() => setPlace(h.id)}>{h.name}</button>)}</div>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press">Guardar <Icon n="check" s={20} /></button>
      </form>
      {chore && <button className="back press" onClick={archive}>Arquivar</button>}
    </>
  );
}

/** Sugestões de manutenção: escolhem-se as que se aplicam (a primeira data fica daqui a uma semana, para planear). */
function SuggestSheet({ home }: { home: string | null }) {
  const { me, house } = useSession();
  const { chores, homes } = useHouse();
  const { close, toast } = useOverlays();
  const place = home ?? homes.rows.filter((h) => !h.archived)[0]?.id ?? null;
  const have = new Set(chores.rows.filter((c) => !c.archived && c.kind === 'maintenance' && (c.home_id ?? place) === place).map((c) => c.title));
  const [pick, setPick] = useState<Set<string>>(new Set());
  async function save() {
    const rows = MAINTENANCE.filter((s) => pick.has(s.key)).map((s, j) => ({ household_id: house!.id, home_id: place, kind: 'maintenance', title: s.title, every_n: s.every_n, every_unit: s.every_unit, next_on: addDays(todayStr(), 7 + j * 3), assign: 'anyone', note: s.why, created_by: me!.id }));
    if (!rows.length) return close();
    const { error } = await supabase.from('chores').insert(rows);
    if (error) return toast(error.message);
    chores.reload(); close();
    toast(`${rows.length} ${rows.length === 1 ? 'coisa' : 'coisas'} de manutenção. A NIKKI lembra duas semanas antes.`, { ok: true });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="l">Manutenção da casa</p>
      <p className="s">Escolhe as que se aplicam. Podes mudar as datas e a frequência depois.</p>
      <div className="tile card setup">{MAINTENANCE.map((s) => {
        const done = have.has(s.title), on = pick.has(s.key);
        return (
          <div key={s.key} className="setup-row">
            <button type="button" role="switch" aria-checked={done || on} disabled={done} className="sw-row press" onClick={() => setPick((p) => { const n = new Set(p); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}>
              <span className="st2"><span>{s.title}</span><span className="s">{done ? 'já está' : `${everyLabel(s.every_n, s.every_unit)} · ${s.why}`}</span></span><span /><span className={`sw${done || on ? ' on' : ''}`} aria-hidden="true"><i /></span>
            </button>
          </div>
        );
      })}</div>
      <button className="btn wide press" onClick={save}>{pick.size ? `Juntar ${pick.size}` : 'Fechar'} <Icon n="check" s={20} /></button>
    </div>
  );
}

// ───────────── garantias ─────────────

export function WarrantiesSection({ home, homeOf }: { home: string | null; homeOf: (h: string | null) => string | null }) {
  const { warranties } = useHouse();
  const { open } = useOverlays();
  const today = todayStr();
  const list = warranties.rows.filter((w) => !w.archived && (!home || homeOf(w.home_id) === home))
    .map((w) => ({ w, s: warrantyState(w.bought_on, Number(w.years), today) }))
    .sort((a, b) => (a.s.state === 'ended' ? 1 : 0) - (b.s.state === 'ended' ? 1 : 0) || a.s.end.localeCompare(b.s.end));
  return (
    <section className="stack" aria-label="Garantias">
      <div className="wbar"><span className="s">{list.length ? `${list.length} ${list.length === 1 ? 'garantia' : 'garantias'}` : ''}</span><button className="tb press" onClick={() => open(<WarrantySheet home={home} />)}>Nova</button></div>
      {list.length ? <div className="tile card rows">{list.map(({ w, s }) => (
        <button key={w.id} type="button" className="row-main press" onClick={() => open(<WarrantySheet w={w} home={home} />)}>
          <span className="st2"><span>{w.item}</span><span className="s">{w.store ? `${w.store} · ` : ''}{s.state === 'ended' ? `acabou a ${dt(s.end)}` : <span className={s.state === 'soon' ? 'warn' : ''}>até {dt(s.end)}{s.state === 'soon' ? ` · faltam ${s.days} dias` : ''}</span>}</span></span>
          {w.receipt_path ? <Icon n="doc" s={16} /> : null}
        </button>
      ))}</div> : <p className="s">Tira uma foto ao talão quando comprares um eletrodoméstico: a NIKKI guarda-o e avisa antes de a garantia acabar. Em Portugal são 3 anos. A gaveta dos talões pode reformar-se.</p>}
    </section>
  );
}

/** Nova garantia ou ver uma: foto do talão (lida para preencher a loja, a data e o valor), artigo, anos. */
export function WarrantySheet({ w, home }: { w?: WarrantyRow; home: string | null }) {
  const { me, house } = useSession();
  const { warranties, homes } = useHouse();
  const { close, toast } = useOverlays();
  const places = homes.rows.filter((h) => !h.archived);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [item, setItem] = useState(w?.item ?? '');
  const [store, setStore] = useState(w?.store ?? '');
  const [bought, setBought] = useState(w?.bought_on ?? todayStr());
  const [price, setPrice] = useState(w?.price ? String(w.price).replace('.', ',') : '');
  const [years, setYears] = useState(String(w ? Number(w.years) : 3).replace('.', ','));
  const [place, setPlace] = useState<string | null>(w?.home_id ?? home ?? places[0]?.id ?? null);
  const [err, setErr] = useState('');
  async function pick(f: File) {
    setFile(f); setReading(true);
    try {
      const { text } = await invoiceText(f, () => {});
      const r = readReceipt(text);
      if (r.store && !store) setStore(r.store);
      if (r.date) setBought(r.date);
      if (r.total && !price) setPrice(eur(r.total).replace(/\s/g, ''));
    } catch { /* fica a foto; preenche-se à mão */ }
    setReading(false);
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!item.trim()) return setErr('Que artigo é? (ex.: máquina de lavar)');
    const y = Number(years.replace(',', '.'));
    if (!(y > 0 && y <= 10)) return setErr('Os anos de garantia vão de 0,5 a 10.');
    const p = price.trim() ? parseAmount(price) : null;
    if (price.trim() && !p) return setErr('O valor escreve-se assim: 429,99.');
    let receipt_path = w?.receipt_path ?? null;
    if (file) {
      const blob = file.type === 'application/pdf' ? file : await shrink(file);
      const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'jpg';
      const path = `${house!.id}/${rid()}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
      if (error) return setErr('A foto do talão não foi. Tenta outra vez.');
      if (receipt_path) await supabase.storage.from('receipts').remove([receipt_path]);
      receipt_path = path;
    }
    const row = { household_id: house!.id, home_id: place, item: item.trim().slice(0, 60), store: store.trim().slice(0, 60) || null, bought_on: bought, years: y, price: p, receipt_path };
    const { error } = w ? await supabase.from('warranties').update(row).eq('id', w.id) : await supabase.from('warranties').insert({ ...row, created_by: me!.id });
    if (error) return setErr(error.message);
    warranties.reload(); close();
    const s = warrantyState(bought, y, todayStr());
    toast(s.state === 'ended' ? `${row.item}: a garantia já acabou.` : `${row.item}: garantia até ${dt(s.end)}. A NIKKI avisa antes de acabar.`, { ok: true });
  }
  async function archive() {
    await supabase.from('warranties').update({ archived: true }).eq('id', w!.id);
    warranties.reload(); close(); toast('Arquivada.');
  }
  const s = warrantyState(bought || todayStr(), Number(years.replace(',', '.')) || 3, todayStr());
  return (
    <>
      <form className="form" onSubmit={save} autoComplete="off">
        <p className="l">{w ? w.item : 'Nova garantia'}</p>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
        {w?.receipt_path && !file && <div className="receipt"><Shot path={w.receipt_path} bucket="receipts" alt="Talão" /><span className="s">Talão guardado. Um toque para ver.</span></div>}
        {scan && <Suspense fallback={<Loading full label="A abrir o scanner" />}><Scanner title="Digitalizar o talão" single onCancel={() => setScan(false)} onDone={(pages) => { setScan(false); if (pages[0]) pick(new File([pages[0]], 'talao.jpg', { type: 'image/jpeg' })); }} /></Suspense>}
        <div className="tile read-card">
          <span className="st2"><span>{file ? 'Talão digitalizado' : w?.receipt_path ? 'Trocar o talão' : 'O talão'}</span><span className="s">{reading ? 'A ler o talão…' : 'Fica guardado, só para os dois da casa. A NIKKI lê a loja, a data e o valor.'}</span></span>
          <div className="actions"><button type="button" className="btn press" onClick={() => setScan(true)}>Digitalizar <Icon n="doc" s={18} /></button><button type="button" className="btn quiet press" onClick={() => fileRef.current?.click()}>Foto ou PDF</button></div>
        </div>
        <label>Artigo<input value={item} onChange={(e) => setItem(e.target.value)} placeholder="ex.: Máquina de lavar roupa" maxLength={60} /></label>
        <div className="two">
          <label>Loja<input value={store} onChange={(e) => setStore(e.target.value)} placeholder="ex.: Worten" maxLength={60} /></label>
          <label>Valor (€)<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></label>
        </div>
        <div className="two">
          <label>Comprado a<input type="date" value={bought} max={todayStr()} onChange={(e) => setBought(e.target.value)} /></label>
          <label>Anos de garantia<input inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} /></label>
        </div>
        <p className="s">{s.state === 'ended' ? `Acabou a ${dt(s.end)}.` : `Até ${dt(s.end)}.`} Em Portugal, os bens novos têm 3 anos de garantia; se algo avariar nesse tempo, a loja tem de reparar ou trocar.</p>
        {places.length > 1 && <div className="chips" role="group" aria-label="Que casa">{places.map((h) => <button key={h.id} type="button" className="press" aria-pressed={place === h.id} onClick={() => setPlace(h.id)}>{h.name}</button>)}</div>}
        {err && <p className="err">{err}</p>}
        <button className="btn wide press" disabled={reading}>Guardar <Icon n="check" s={20} /></button>
      </form>
      {w && <button className="back press" onClick={archive}>Arquivar (já não temos)</button>}
    </>
  );
}
