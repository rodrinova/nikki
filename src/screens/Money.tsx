import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type ExpenseRow } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Arc } from '@/ui/Arc';
import { arcT, eur, monthSpend, normalMonth, pace, pairBalance, parseAmount, toU, type Split } from '@/lib/money';
import { addDays, dayLabel, monthKey, monthName, todayStr } from '@/lib/dates';
import { Hint, Top, useSeen } from './Home';

export const CATEGORIES = ['Supermercado', 'Restaurantes', 'Casa', 'Contas', 'Carros', 'Lazer', 'Saúde', 'Roupa', 'Viagens', 'Future Me'];
export const INVEST = 'Future Me'; // investir não é gasto

/** "Do Rodrigo", "Da Inês"… sem saber o género, "De Marta". */
export const ofName = (n: string) => `De ${n}`;

/** Resumo do mês da pessoa: parte dela, normal, ritmo. */
export function useMonth() {
  const { me } = useSession();
  const { expenses } = useHouse();
  return useMemo(() => {
    const today = todayStr(), key = monthKey(today);
    const spend = expenses.rows.filter((e) => e.category !== INVEST);
    const m = monthSpend(spend, me?.id ?? '', key);
    const normal = normalMonth(spend, me?.id ?? '', today);
    return { key, today, ...m, normal, pace: pace(m.total, normal, today) };
  }, [expenses.rows, me?.id]);
}

export function useLedger() {
  const { me, partner } = useSession();
  const { expenses, transfers } = useHouse();
  return useMemo(() => {
    if (!me || !partner) return null;
    const v = pairBalance(expenses.rows, transfers.rows, me.id, partner.id);
    const even = Math.abs(v) < 500; // menos de meio cêntimo
    const who = v > 0 ? me : partner;
    const lead = even ? 'Em equilíbrio' : v > 0 ? 'Adiantaste mais' : `${partner.name} adiantou mais`;
    return { v, even, who, lead, t: arcT(v) };
  }, [expenses.rows, transfers.rows, me, partner]);
}

export function Money() {
  const { partner } = useSession();
  const m = useMonth(), L = useLedger();
  const p = m.pace;
  const seen = useSeen('money');
  return (
    <>
      <Top title="Dinheiro" />
      <div className="swap"><p className="xl">{eur(m.total, 0)}<small>€</small></p><p className="s" style={{ marginTop: 8 }}>{partner ? `A tua parte em ${monthName(m.key)}` : monthName(m.key)[0].toUpperCase() + monthName(m.key).slice(1)}</p></div>
      {partner && <Hint show={seen < 3}>A tua parte é o que é só teu mais a tua percentagem das partilhadas. Não depende de quem pagou.</Hint>}
      {p.fresh
        ? <p className="s why"><span className="dot" aria-hidden="true" /><span>Ritmo: no fim do primeiro mês completo a NIKKI já conhece o teu normal e começa a comparar.</span></p>
        : <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="bar31" style={{ gridTemplateColumns: `repeat(${p.days},minmax(0,1fr))` }} role="img" aria-label={`Ritmo ${p.pct}%`}>
              {Array.from({ length: p.days }, (_, j) => <i key={j} className={`${j < p.blocks ? (j < p.day ? 'f' : 'a') : ''}${j === p.day - 1 ? ' today' : ''}`} />)}
            </div>
            <span className="s">Ritmo · {p.pct === 0 ? 'no ritmo habitual' : `${Math.abs(p.pct)}% ${p.pct > 0 ? 'acima' : 'abaixo'} do ritmo habitual`}</span>
          </div>
          <Hint show={seen < 3}>Cada bloco é um dia de um mês normal. Os cheios já foram gastos; os laranja são gasto adiantado.</Hint>
        </>}
      <div className="tile card rows">
        {!p.fresh && <div><span className="k">Fecho previsto{seen < 3 && <span className="s" style={{ display: 'block' }}>se o resto do mês for normal</span>}</span><span className="v">{eur(p.forecast, 0)} €</span></div>}
        {L && <Link className="press" to="/contas"><span className="k">Contas a dois<span className="s" style={{ display: 'block' }}>{L.lead}</span></span><span className="v">{eur(Math.abs(L.v))} €<Icon n="arrow" s={16} /></span></Link>}
        {m.byCat.length > 0 && <Link className="press" to="/dinheiro/categorias"><span className="k">Categorias</span><span className="v">{m.byCat.length}<Icon n="arrow" s={16} /></span></Link>}
        <ExpenseButton />
      </div>
      <Movements />
    </>
  );
}

function ExpenseButton() {
  const { open } = useOverlays();
  return <button className="press" onClick={() => open(<ExpenseSheet />)}><span className="k">Registar uma despesa</span><span className="v"><Icon n="plus" s={18} /></span></button>;
}

function Movements() {
  const { me, members } = useSession();
  const { expenses } = useHouse();
  const { open } = useOverlays();
  const key = monthKey(todayStr());
  const list = expenses.rows.filter((e) => monthKey(e.spent_on) === key).slice(0, 30);
  if (!list.length) return null;
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';
  const lbl = (e: ExpenseRow) => e.split === 'mine' ? (e.paid_by === me?.id ? 'Minha' : name(e.paid_by)) : e.split === 'shared' ? `Partilhada · pagou ${e.paid_by === me?.id ? 'tu' : name(e.paid_by)}` : e.other_id === me?.id ? `Tua · pagou ${name(e.paid_by)}` : ofName(name(e.other_id));
  return (
    <>
      <p className="s">Este mês</p>
      <div className="tile card rows">{list.map((e) => (
        <button key={e.id} className="press" onClick={() => open(<ExpenseDetail e={e} label={lbl(e)} />)}>
          <span className="k" style={{ color: 'var(--ink)' }}>{e.note || e.category}<span className="s" style={{ display: 'block' }}>{dayLabel(e.spent_on)} · {lbl(e)}</span></span>
          <span className="v">{eur(toU(e.amount))} €</span>
        </button>
      ))}</div>
    </>
  );
}

function ExpenseDetail({ e, label }: { e: ExpenseRow; label: string }) {
  const { me } = useSession();
  const { close, toast } = useOverlays();
  const mine = e.created_by === me?.id || e.paid_by === me?.id;
  async function del() {
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    if (error) toast(error.message); else { close(); toast('Despesa apagada.'); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="xl">{eur(toU(e.amount))}<small>€</small></p>
      <div className="tile card rows" style={{ background: 'var(--tile-2)' }}>
        <div><span className="k">Categoria</span><span className="v">{e.category}</span></div>
        <div><span className="k">Dia</span><span className="v">{dayLabel(e.spent_on)}</span></div>
        <div><span className="k">De quem é</span><span className="v">{label}</span></div>
        {e.note && <div><span className="k">Nota</span><span className="v">{e.note}</span></div>}
      </div>
      {mine && <button className="btn quiet wide press" onClick={del}>Apagar <Icon n="arrow" s={20} /></button>}
    </div>
  );
}

/** Despesa: valor, categoria, Minha · Partilhada · Do outro, dia e nota. Quem paga é quem regista. */
export function ExpenseSheet() {
  const { me, partner, house, myShare } = useSession();
  const { close, toast } = useOverlays();
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('Supermercado');
  const [split, setSplit] = useState<Split>(partner ? 'shared' : 'mine');
  const [day, setDay] = useState<'hoje' | 'ontem' | 'outro'>('hoje');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const v = parseAmount(amt);
  const pct = Math.round(myShare * 100);
  const hint = !v ? '' : !partner ? 'Em teu nome.' : split === 'shared'
    ? `Partilhada ${pct}/${100 - pct}: ${eur(toU(v) * myShare)} € na tua parte, ${eur(toU(v) * (1 - myShare))} € na parte de ${partner.name}. A percentagem muda-se em Pessoas.`
    : split === 'other' ? `Toda na parte de ${partner.name}. Pagaste tu.` : 'Só tua.';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!v) return setErr('Escreve o valor, por exemplo 12,35.');
    if (!me || !house) return;
    const spent_on = day === 'hoje' ? todayStr() : day === 'ontem' ? addDays(todayStr(), -1) : date;
    setBusy(true);
    const { error } = await supabase.from('expenses').insert({
      household_id: house.id, created_by: me.id, paid_by: me.id, amount: v, category: cat, spent_on,
      split, other_id: split === 'mine' ? null : partner!.id, payer_share: split === 'shared' ? myShare : null, note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    close();
    toast(`${eur(toU(v))} € · ${cat} · ${dayLabel(spent_on)}${partner ? ' · ' + (split === 'shared' ? 'partilhada' : split === 'mine' ? 'minha' : ofName(partner.name).toLowerCase()) : ''}`, { ok: true });
  }

  const chip = (on: boolean, txt: string, f: () => void) => <button type="button" className="press" aria-pressed={on} onClick={f} key={txt}>{txt}</button>;
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label className="sr" htmlFor="amt">Valor</label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input id="amt" className="amount" inputMode="decimal" placeholder="0,00" autoFocus value={amt} onChange={(e) => { setAmt(e.target.value); setErr(''); }} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      <p className="s" style={{ minHeight: 18, marginTop: -8 }}>{err || hint}</p>
      <div className="chips" role="group" aria-label="Categoria">{CATEGORIES.map((c) => chip(cat === c, c, () => setCat(c)))}</div>
      {partner && <div className="seg" role="group" aria-label="De quem é">
        {chip(split === 'mine', 'Minha', () => setSplit('mine'))}{chip(split === 'shared', 'Partilhada', () => setSplit('shared'))}{chip(split === 'other', ofName(partner.name), () => setSplit('other'))}
      </div>}
      <div className="chips" role="group" aria-label="Dia">{chip(day === 'hoje', 'Hoje', () => setDay('hoje'))}{chip(day === 'ontem', 'Ontem', () => setDay('ontem'))}{chip(day === 'outro', 'Outro dia', () => setDay('outro'))}</div>
      {day === 'outro' && <input className="field" type="date" aria-label="Dia da despesa" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />}
      <input className="field" placeholder="Nota (opcional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota" />
      <button className="btn wide press" disabled={busy}>Guardar · {me?.name} <Icon n="arrow" s={20} /></button>
    </form>
  );
}

export function Cats() {
  const m = useMonth();
  const mx = m.byCat[0]?.[1] ?? 1;
  return (
    <>
      <Top title="Categorias" />
      {!m.byCat.length ? <p className="s">Ainda sem despesas este mês.</p> : <>
        <p className="s">A tua parte em {monthName(m.key)}</p>
        <div className="tile card rows">{m.byCat.map(([n, v]) => (
          <div key={n} style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 8, padding: '10px 0' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span>{eur(v, 0)} €</span></span>
            <span style={{ height: 2, background: 'var(--tile-2)', display: 'block' }}><span style={{ display: 'block', height: 2, width: `${((v / mx) * 100).toFixed(1)}%`, background: 'var(--ink)' }} /></span>
          </div>
        ))}</div>
      </>}
    </>
  );
}

export function Ledger() {
  const { me, partner, myShare } = useSession();
  const { expenses, transfers } = useHouse();
  const { open } = useOverlays();
  const L = useLedger();
  const seen = useSeen('ledger');
  if (!me || !partner || !L) return (
    <><Top title="Contas a dois" /><p className="l">Aparecem quando alguém se junta à casa.</p><p className="s" style={{ fontSize: 'var(--t-m)' }}>Mostram quem adiantou mais nas despesas partilhadas.</p><Link className="btn quiet wide press" to="/pessoas">Convidar <Icon n="arrow" s={20} /></Link></>
  );
  // Esforço: quanto cada um pagou do que é partilhado ou do outro.
  const pair = expenses.rows.filter((e) => e.split !== 'mine' && [e.paid_by, e.other_id].includes(me.id) && [e.paid_by, e.other_id].includes(partner.id));
  const paid = (id: string) => pair.filter((e) => e.paid_by === id).reduce((t, e) => t + toU(e.amount), 0);
  const pm = paid(me.id), pp = paid(partner.id), T = pm + pp;
  const sent = transfers.rows.filter((t) => t.from_id === me.id).reduce((s, t) => s + toU(t.amount), 0), got = transfers.rows.filter((t) => t.to_id === me.id).reduce((s, t) => s + toU(t.amount), 0);
  // Esforço de cada um: o que pagou das partilhadas, mais o que transferiu ao outro, menos o que recebeu.
  const a = T ? Math.max(0, Math.min(100, ((pm + sent - got) / T) * 100)) : 50;
  const pct = Math.round(myShare * 100);
  return (
    <>
      <Top title="Contas a dois" />
      <div className="swap"><p className="xl">{eur(Math.abs(L.v))}<small>€</small></p><p className="s" style={{ marginTop: 8 }}>{L.even ? 'Esforço distribuído como combinado' : `${L.lead} do que o combinado`}</p></div>
      <Hint show={seen < 3}>{`Quanto cada um adiantou face ao combinado (${pct}/${100 - pct}). Não é uma dívida: serve para distribuírem o esforço.`}</Hint>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Arc t={L.t} even={L.even} me={me} other={partner} label={L.even ? 'Em equilíbrio: o ponto está no meio do arco.' : `${L.lead}: o ponto está do lado de ${L.v > 0 ? 'ti' : partner.name}.`} />
        <div className="s" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tu {Math.round(a)}%</span><span>combinado {pct}/{100 - pct}</span><span>{partner.name} {100 - Math.round(a)}%</span></div>
      </div>
      <div className="tile card rows">
        <div><span className="k">Pagaste tu</span><span className="v">{eur(pm)} €</span></div>
        <div><span className="k">Pagou {partner.name}</span><span className="v">{eur(pp)} €</span></div>
        {(sent > 0 || got > 0) && <div><span className="k">Transferências<span className="s" style={{ display: 'block' }}>enviaste {eur(sent)} € · recebeste {eur(got)} €</span></span><span className="v">{eur(sent - got)} €</span></div>}
        <div><span>Diferença para o combinado</span><span className="v">{eur(Math.abs(L.v))} €</span></div>
      </div>
      {!L.even && <p className="s why"><span className="dot" aria-hidden="true" /><span>Para equilibrar sem transferências, as próximas partilhadas ficam com {L.v > 0 ? partner.name : 'contigo'}.</span></p>}
      <button className={`btn wide press${L.even ? ' quiet' : ''}`} onClick={() => open(<TransferSheet />)}>{L.even ? 'Registar uma transferência' : 'Equilibrar com uma transferência'}<Icon n="arrow" s={20} /></button>
    </>
  );
}

/** O valor define-se; à partida és tu que transferes; um toque inverte. Sugere o valor que equilibra. */
export function TransferSheet() {
  const { me, partner, house } = useSession();
  const { close, toast } = useOverlays();
  const L = useLedger()!;
  const need = L.even ? null : L.v > 0 ? 'them' : 'me'; // quem deve transferir para equilibrar
  const [from, setFrom] = useState<'me' | 'them'>('me');
  const [amt, setAmt] = useState(need === 'me' ? eur(Math.abs(L.v)).replace(/\s/g, '') : '');
  const [err, setErr] = useState('');
  function flip(f: 'me' | 'them') { setFrom(f); setAmt(need === f ? eur(Math.abs(L.v)).replace(/\s/g, '') : ''); }
  async function save(e: FormEvent) {
    e.preventDefault();
    const v = parseAmount(amt);
    if (!v) return setErr('Escreve o valor.');
    const f = from === 'me' ? me! : partner!, t = from === 'me' ? partner! : me!;
    const { error } = await supabase.from('transfers').insert({ household_id: house!.id, from_id: f.id, to_id: t.id, amount: v, created_by: me!.id });
    if (error) return setErr(error.message);
    close(); toast(`Transferência registada: ${f.id === me!.id ? 'tu' : f.name} → ${t.id === me!.id ? 'tu' : t.name}, ${eur(toU(v))} €.`, { ok: true });
  }
  return (
    <form onSubmit={save} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="l">Registar transferência</p>
      <div className="seg" role="group" aria-label="Quem transfere">
        <button type="button" className="press" aria-pressed={from === 'me'} onClick={() => flip('me')}>Eu → {partner!.name}</button>
        <button type="button" className="press" aria-pressed={from === 'them'} onClick={() => flip('them')}>{partner!.name} → eu</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><input className="amount" inputMode="decimal" placeholder="0,00" aria-label="Valor" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: `${Math.max(4.2, amt.length + 0.6)}ch` }} /><span className="l">€</span></div>
      <p className="s why"><span className="dot" aria-hidden="true" /><span>{err || (need ? `Para ficarem em equilíbrio, ${need === 'me' ? 'transferes' : partner!.name + ' transfere'} ${eur(Math.abs(L.v))} €.` : 'Estão em equilíbrio: uma transferência agora muda isso.')}</span></p>
      <button className="btn wide press">Registar <Icon n="check" s={20} /></button>
    </form>
  );
}
