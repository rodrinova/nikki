// O Natal: a lista de prendas a dar (para quem, o quê, comprada, preço), o orçamento da casa e o que já se gastou,
// e o que se deu a cada pessoa nos anos anteriores (para não repetir). A prenda para alguém da casa é secreta: essa
// pessoa nunca a vê, nem o preço, nem a despesa (fica «só minha»), e não entra no total.
// A prenda comprada procura a despesa que lhe corresponde; se não houver, a NIKKI pergunta se a quer registar.
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { eur, parseAmount, toU } from '@/lib/money';
import { todayStr } from '@/lib/dates';
import { ideasFor, matchExpense, pastFor, perPerson, publicTotal, xmasYear, type XGift } from '@/lib/xmas';
import { ExpenseSheet } from './Money';
import { useN2 } from '@/n2/shell';
import { Masthead } from '@/n2/N2';

const first = (n?: string) => (n ?? '').split(' ')[0];
const euro = (v: number) => `${eur(toU(v), v % 1 ? 2 : 0)} €`;

/** O Natal deste ano (a ocasião) e uma forma de o criar na primeira vez. */
export function useNatal() {
  const { house } = useSession();
  const { occasions } = useHouse();
  const year = xmasYear(todayStr());
  const occ = occasions.rows.find((o) => o.kind === 'natal' && o.on_date?.slice(0, 4) === String(year)) ?? null;
  const ensure = async (): Promise<string | null> => {
    if (occ) return occ.id;
    if (!house) return null;
    const { data, error } = await supabase.from('occasions').insert({ household_id: house.id, name: `Natal ${year}`, kind: 'natal', on_date: `${year}-12-25`, purchase: true }).select('id').single();
    if (error) return null;
    await occasions.reload();
    return (data as { id: string }).id;
  };
  const yearOf = (id: string) => { const o = occasions.rows.find((x) => x.id === id); return o?.on_date ? Number(o.on_date.slice(0, 4)) : null; };
  return { year, occ, ensure, yearOf };
}

/** A prenda comprada: liga-se à despesa que bate certo ou pergunta se se regista. */
export function useBuy() {
  const { expenses, xmas } = useHouse();
  const { open, close, toast } = useOverlays();
  const { year, occ } = useNatal();
  return async (g: XGift, price: number | null) => {
    const linked = new Set(xmas.rows.map((x) => x.expense_id).filter(Boolean) as string[]);
    const m = price ? matchExpense({ ...g, price }, expenses.rows, year, linked) : null;
    if (m) {
      await supabase.from('xmas_gifts').update({ bought: true, price, expense_id: m.id }).eq('id', g.id);
      if (!m.occasion_id && occ) await supabase.from('expenses').update({ occasion_id: occ.id, ...(g.secret_for ? { split: 'mine', other_id: null, payer_share: null } : {}) }).eq('id', m.id);
      xmas.reload(); expenses.reload();
      return toast(`Ligada à despesa de ${m.note || 'prenda'} (${euro(Number(m.amount))}).`, { ok: true });
    }
    await supabase.from('xmas_gifts').update({ bought: true, price }).eq('id', g.id);
    xmas.reload();
    if (!price) return;
    open(
      <div className="stack">
        <p className="l">Registar como despesa?</p>
        <p className="s">Não encontrei nenhuma despesa de {euro(price)} para esta prenda. {g.secret_for ? 'Fica só tua: a outra pessoa nunca a vê.' : 'Entra nas despesas de Natal (extraordinárias).'}</p>
        <button type="button" className="btn accent wide press" onClick={() => open(<ExpenseSheet init={{ text: `${String(price).replace('.', ',')} Prenda ${g.to_name}${g.item ? ` ${g.item}` : ''}`.slice(0, 80), occ: occ?.id, split: g.secret_for ? 'mine' : undefined, giftId: g.id }} />)}>Sim, registar</button>
        <button type="button" className="btn quiet wide press" onClick={close}>Agora não</button>
      </div>,
    );
  };
}

/** As ideias para uma pessoa: juntar, escolher (passa a ser a prenda e sai da lista) ou apagar. Ficam de ano para ano. */
function Ideas({ name, secret, onPick }: { name: string; secret: string | null; onPick?: (idea: string) => void }) {
  const { house } = useSession();
  const { ideas } = useHouse();
  const { toast } = useOverlays();
  const [t, setT] = useState('');
  const list = ideasFor(name, ideas.rows);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!t.trim() || !house) return;
    const { error } = await supabase.from('gift_ideas').insert({ household_id: house.id, to_name: name.trim().slice(0, 60), idea: t.trim().slice(0, 120), secret_for: secret });
    if (error) return toast(error.message);
    setT(''); ideas.reload();
  }
  const drop = async (id: string) => { await supabase.from('gift_ideas').delete().eq('id', id); ideas.reload(); };
  return (
    <section className="stack natal-ideas" aria-label={`Ideias para ${name}`}>
      <span className="s">Ideias para {name}{secret ? ' (só tu vês)' : ''}</span>
      {list.length > 0 && <ul>{list.map((i) => (
        <li key={i.id}><span>{i.idea}</span>
          {onPick && <button type="button" className="tb press" onClick={async () => { onPick(i.idea); await drop(i.id); }}>Escolher</button>}
          <button type="button" className="tb quiet press" aria-label={`Apagar a ideia ${i.idea}`} onClick={() => void drop(i.id)}>×</button>
        </li>
      ))}</ul>}
      <form className="add-row" onSubmit={add} autoComplete="off">
        <input className="field" value={t} onChange={(e) => setT(e.target.value)} placeholder="Uma ideia (ex.: luvas de pele)" maxLength={120} aria-label="Nova ideia" />
        <button className="tb press" aria-label="Juntar ideia"><Icon n="plus" s={18} /></button>
      </form>
    </section>
  );
}

function GiftSheet({ g }: { g: XGift }) {
  const { xmas } = useHouse();
  const { close, toast } = useOverlays();
  const buy = useBuy();
  const [item, setItem] = useState(g.item ?? '');
  const [price, setPrice] = useState(g.price === null ? '' : String(g.price).replace('.', ','));
  async function save(e: FormEvent) {
    e.preventDefault();
    const p = price.trim() ? parseAmount(price) : null;
    const { error } = await supabase.from('xmas_gifts').update({ item: item.trim().slice(0, 80) || null, price: p }).eq('id', g.id);
    if (error) return toast(error.message);
    xmas.reload(); close();
  }
  return (
    <form className="stack" onSubmit={save} autoComplete="off">
      <p className="l">{g.to_name}{g.secret_for ? ' · secreta' : ''}</p>
      <Ideas name={g.to_name} secret={g.secret_for} onPick={(x) => setItem(x)} />
      <input className="field" value={item} onChange={(e) => setItem(e.target.value)} placeholder="O quê (ex.: perfume)" maxLength={80} aria-label="O quê" />
      <input className="field" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" inputMode="decimal" aria-label="Preço" />
      <button className="btn wide press">Guardar</button>
      {!g.bought && <button type="button" className="btn accent wide press" onClick={async () => { close(); await buy({ ...g, item: item.trim() || null }, price.trim() ? Number(parseAmount(price)) : null); }}><Icon n="check" s={18} /> Comprada</button>}
      {g.bought && <button type="button" className="btn quiet wide press" onClick={async () => { await supabase.from('xmas_gifts').update({ bought: false, expense_id: null }).eq('id', g.id); xmas.reload(); close(); }}>Afinal ainda não está comprada</button>}
      <button type="button" className="tb quiet press" style={{ alignSelf: 'center' }} onClick={async () => { await supabase.from('xmas_gifts').delete().eq('id', g.id); xmas.reload(); close(); toast('Apagada.'); }}>Apagar</button>
    </form>
  );
}

function BudgetSheet({ id, budget }: { id: string; budget: number | null }) {
  const { occasions } = useHouse();
  const { close, toast } = useOverlays();
  const [v, setV] = useState(budget ? String(budget) : '');
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.from('occasions').update({ budget: v.trim() ? parseAmount(v) : null }).eq('id', id); if (error) return toast(error.message); occasions.reload(); close(); }}>
      <p className="l">Orçamento de Natal</p>
      <p className="s">Quanto contam gastar em prendas este ano, os dois. As prendas secretas não entram nas contas.</p>
      <input className="field" value={v} onChange={(e) => setV(e.target.value)} placeholder="ex.: 600" inputMode="decimal" autoFocus aria-label="Orçamento" />
      <button className="btn wide press">Guardar</button>
    </form>
  );
}

export function NatalScreen() {
  useN2();
  const { me, members, house } = useSession();
  const { xmas, expenses, ideas } = useHouse();
  const { open, toast } = useOverlays();
  const { year, occ, ensure, yearOf } = useNatal();
  const buy = useBuy();
  const [to, setTo] = useState(''), [item, setItem] = useState(''), [price, setPrice] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const others = members.filter((m) => m.id !== me?.id);
  const list = useMemo(() => (occ ? xmas.rows.filter((g) => g.occasion_id === occ.id) : []).sort((a, b) => Number(a.bought) - Number(b.bought) || a.to_name.localeCompare(b.to_name)), [xmas.rows, occ]);
  const total = publicTotal(list.filter((g) => g.bought));
  const linked = new Set(xmas.rows.map((g) => g.expense_id).filter(Boolean) as string[]);
  const extra = occ ? expenses.rows.filter((e) => e.occasion_id === occ.id && !linked.has(e.id)).reduce((t, e) => t + Number(e.amount), 0) : 0;
  const mineSecret = list.filter((g) => g.secret_for && g.created_by === me?.id && g.price !== null).reduce((t, g) => t + Number(g.price), 0);
  const budget = occ?.budget ? Number(occ.budget) : null;
  const spent = total + extra;
  const pp = useMemo(() => perPerson(xmas.rows, yearOf, year), [xmas.rows, yearOf, year]);
  async function add(e: FormEvent) {
    e.preventDefault();
    const name = (secret ? first(others.find((m) => m.id === secret)?.name) : to.trim()).slice(0, 60);
    if (!name || !house) return;
    const id = await ensure();
    if (!id) return toast('Não deu para criar o Natal deste ano.');
    const p = price.trim() ? parseAmount(price) : null;
    const { error } = await supabase.from('xmas_gifts').insert({ household_id: house.id, occasion_id: id, to_name: name, item: item.trim().slice(0, 80) || null, price: p, secret_for: secret });
    if (error) return toast(error.message);
    setTo(''); setItem(''); setPrice(''); setSecret(null); xmas.reload();
  }
  return (
    <div className="n2-page n2v natal">
      <Masthead />
      <header className="natal-top">
        <span className="cd-h"><span>Natal {year}</span></span>
        <span className="natal-v"><span className="num">{euro(spent)}</span><small>{budget ? `de ${euro(budget)}` : 'gastos em prendas'}</small></span>
        {budget ? <div className="natal-bar" role="img" aria-label={`${Math.round((spent / budget) * 100)}% do orçamento`}><i style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} className={spent > budget ? 'over' : ''} /></div> : null}
        <span className="s">{list.filter((g) => g.bought).length} de {list.length} compradas{extra ? ` · ${euro(extra)} noutras despesas de Natal` : ''}</span>
        {pp.ref !== null && <span className="s natal-pp">Por pessoa: {pp.cur !== null ? <><b>{euro(Math.round(pp.cur))}</b> este ano · </> : ''}~{euro(Math.round(pp.ref))} nos anteriores, já com a inflação{pp.diff !== null && pp.diff !== 0 ? <span className={pp.diff > 0 ? 'up' : 'down'}> · {pp.diff > 0 ? '↑' : '↓'} {Math.abs(pp.diff)}%</span> : ''}</span>}
        {pp.byYear.length > 0 && <span className="s natal-years">{pp.byYear.slice(-3).map((y) => `${y.year}: ${y.n} ${y.n === 1 ? 'prenda' : 'prendas'}, ${euro(Math.round(y.total))}`).join(' · ')}</span>}
        {mineSecret > 0 && <span className="s natal-secret"><Icon n="gift" s={13} /> As tuas secretas: {euro(mineSecret)}. Só tu vês, fora das contas.</span>}
        <button type="button" className="tb quiet press" onClick={async () => { const id = await ensure(); if (id) open(<BudgetSheet id={id} budget={budget} />); }}>{budget ? 'Mudar o orçamento' : 'Pôr um orçamento'}</button>
      </header>

      <form className="natal-add tile" onSubmit={add} autoComplete="off">
        {others.length > 0 && <div className="seg sm" role="group" aria-label="Para alguém da casa (secreta)">
          <button type="button" className="press" aria-pressed={!secret} onClick={() => setSecret(null)}>Outra pessoa</button>
          {others.map((m) => <button key={m.id} type="button" className="press" aria-pressed={secret === m.id} onClick={() => setSecret(m.id)}>{first(m.name)} · secreta</button>)}
        </div>}
        {!secret && <input className="field" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Para quem (ex.: Mãe)" maxLength={60} aria-label="Para quem" />}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" style={{ flex: 2 }} value={item} onChange={(e) => setItem(e.target.value)} placeholder="O quê (opcional)" maxLength={80} aria-label="O quê" />
          <input className="field" style={{ flex: 1 }} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="€" inputMode="decimal" aria-label="Preço" />
        </div>
        {secret && <p className="s">{first(others.find((m) => m.id === secret)?.name)} nunca vê esta prenda, nem o preço.</p>}
        <button className="btn wide press">Juntar <Icon n="plus" s={18} /></button>
      </form>

      {list.length === 0 ? <p className="s">Ainda sem prendas. Começa pelas pessoas: o resto vem depois.</p> : (
        <ul className="natal-list">
          {list.map((g) => {
            const past = pastFor(g.to_name, xmas.rows, yearOf, year)[0];
            const nIdeas = ideasFor(g.to_name, ideas.rows).length;
            return (
              <li key={g.id} className={g.bought ? 'done' : ''}>
                <button type="button" className="tick press" role="checkbox" aria-checked={g.bought} aria-label={`${g.bought ? 'Comprada' : 'Por comprar'}: ${g.to_name}`}
                  onClick={async () => { if (g.bought) { await supabase.from('xmas_gifts').update({ bought: false, expense_id: null }).eq('id', g.id); xmas.reload(); } else if (g.price === null) open(<GiftSheet g={g} />); else await buy(g, Number(g.price)); }}><i /></button>
                <button type="button" className="st2 press natal-row" onClick={() => open(<GiftSheet g={g} />)}>
                  <span>{g.to_name}{g.secret_for && <span className="natal-lock"> · secreta</span>}</span>
                  <span className="s">{[g.item, !g.item && nIdeas ? `${nIdeas} ${nIdeas === 1 ? 'ideia' : 'ideias'}` : '', past ? `${past.year}: ${past.item ?? 'prenda'}${past.price ? ` · ${euro(past.price)}` : ''}` : ''].filter(Boolean).join(' · ') || 'O quê?'}</span>
                </button>
                <span className="num natal-p">{g.price !== null ? euro(Number(g.price)) : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Depois de uma despesa de Natal registada fora da lista: para quem foi (liga-a a uma prenda ou cria uma). */
export function GiftPick({ expenseId, amount, note }: { expenseId: string; amount: number; note: string }) {
  const { me, members, house } = useSession();
  const { xmas, expenses } = useHouse();
  const { close, toast } = useOverlays();
  const { occ } = useNatal();
  const [name, setName] = useState('');
  const others = members.filter((m) => m.id !== me?.id);
  const open = occ ? xmas.rows.filter((g) => g.occasion_id === occ.id && !g.bought).sort((a, b) => Number(Number(b.price) === amount) - Number(Number(a.price) === amount)) : [];
  const link = async (g: XGift) => {
    await supabase.from('xmas_gifts').update({ bought: true, price: amount, expense_id: expenseId }).eq('id', g.id);
    if (g.secret_for) await supabase.from('expenses').update({ split: 'mine', other_id: null, payer_share: null }).eq('id', expenseId);
    xmas.reload(); expenses.reload(); close(); toast(`Prenda ${g.to_name}: comprada.`, { ok: true });
  };
  const create = async (to: string, secret: string | null) => {
    if (!occ || !house || !to.trim()) return;
    const { error } = await supabase.from('xmas_gifts').insert({ household_id: house.id, occasion_id: occ.id, to_name: to.trim().slice(0, 60), item: note.slice(0, 80) || null, price: amount, bought: true, expense_id: expenseId, secret_for: secret });
    if (error) return toast(error.message);
    if (secret) await supabase.from('expenses').update({ split: 'mine', other_id: null, payer_share: null }).eq('id', expenseId);
    xmas.reload(); expenses.reload(); close(); toast(`Prenda ${to.trim()}: na lista de Natal.`, { ok: true });
  };
  return (
    <div className="stack">
      <p className="l">Para quem é?</p>
      <p className="s">{euro(amount)} entrou nas despesas de Natal. Diz para quem é e fica na lista de prendas.</p>
      {open.length > 0 && <div className="tile card rows">{open.slice(0, 6).map((g) => <button key={g.id} type="button" className="press" onClick={() => void link(g)}><span className="st2"><span>{g.to_name}{g.secret_for ? ' · secreta' : ''}</span><span className="s">{g.item ?? ''}{g.price !== null ? ` · ${euro(Number(g.price))}` : ''}</span></span><Icon n="arrow" s={16} /></button>)}</div>}
      {others.map((m) => <button key={m.id} type="button" className="btn quiet wide press" onClick={() => void create(first(m.name), m.id)}>Para {first(m.name)} (secreta)</button>)}
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void create(name, null); }}>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Outra pessoa" maxLength={60} aria-label="Para quem" style={{ flex: 1 }} />
        <button className="tb press" aria-label="Juntar"><Icon n="plus" s={18} /></button>
      </form>
      <button type="button" className="tb quiet press" style={{ alignSelf: 'center' }} onClick={close}>Não é prenda (decoração, ceia…)</button>
    </div>
  );
}

/** O cartão do Natal (só na época): quantas prendas faltam e o orçamento. */
export function NatalCard() {
  const { xmas } = useHouse();
  const { year, occ } = useNatal();
  const list = occ ? xmas.rows.filter((g) => g.occasion_id === occ.id) : [];
  const spent = publicTotal(list.filter((g) => g.bought));
  const budget = occ?.budget ? Number(occ.budget) : null;
  const left = list.filter((g) => !g.bought).length;
  return (
    <Link to="/natal" className="natal-card press">
      <span className="natal-c-h">Natal {year}</span>
      <span className="natal-c-v">{list.length ? (left ? `${left} ${left === 1 ? 'prenda' : 'prendas'} por comprar` : 'Prendas todas compradas') : 'A lista de prendas'}</span>
      <span className="s">{list.length ? `${euro(spent)}${budget ? ` de ${euro(budget)}` : ' gastos'}` : 'Para quem, o quê e quanto. As da casa ficam secretas.'}</span>
      {budget ? <span className="natal-bar"><i style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} className={spent > budget ? 'over' : ''} /></span> : null}
    </Link>
  );
}
