import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { groceryReport } from '@/lib/grocery';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type ShopItem } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { useShopPresence } from '@/data/presence';
import { Icon } from '@/ui/Icon';
import { Top } from './Home';
import { niceQty, qtyText, suggestions, type Suggestion } from '@/lib/pantry';
import { todayStr } from '@/lib/dates';
import { eur } from '@/lib/money';

// Corredor por palavras-chave; o que não se reconhece vai para Mercearia. Sem unidades nem quantidades.
const AISLES: [string, RegExp][] = [
  ['Fruta e legumes', /banan|maç|pera|laranj|limã|uva|morang|tomat|alface|espinafr|cenour|batat|cebol|alho|courget|pepin|abacat|fruta|legum|brócol|cogumel|kiwi|melão|melanc|ananás/i],
  ['Talho e peixe', /frango|peru|carne|vaca|porco|bife|picad|salsich|fiambre|presunt|chouri|salmão|pescad|bacalhau|atum fresco|peixe|camar|polvo|lula/i],
  ['Laticínios e ovos', /leite|iogurt|queij|mantei|natas|ovos?\b|kefir|requeij/i],
  ['Padaria', /pão|pães|bolo|croissant|tosta|broa/i],
  ['Congelados', /congelad|gelado|ervilh/i],
  ['Bebidas', /água|sumo|vinho|cervej|refrig|coca|chá\b/i],
  ['Limpeza e casa', /detergent|lixívia|esponj|papel|guardanap|sacos|amaciad|lava/i],
  ['Higiene', /champô|gel de banho|sabonete|pasta de dentes|escova|desodoriz|algodão|lenços/i],
];
export const aisleOf = (n: string) => AISLES.find(([, re]) => re.test(n))?.[0] ?? 'Mercearia';
const ORDER = [...AISLES.map(([a]) => a), 'Mercearia'];

export function Shop() {
  const { me, partner, house, members, staff } = useSession();
  const { shop, receiptItems, expenses } = useHouse();
  const grocery = useMemo(() => groceryReport(expenses.rows, receiptItems.rows, todayStr()), [expenses.rows, receiptItems.rows]);
  const { toast, open } = useOverlays();
  const [name, setName] = useState('');
  // Por supermercado: escolhe-se a loja em cima; o que se junta vai para essa loja. «Todas» mostra loja a loja.
  const SK = `nikki:shop-store:${house?.id ?? ''}`;
  const [store, setStoreS] = useState<string | null>(() => store0(SK));
  const setStore = (v: string | null) => { setStoreS(v); try { if (v) localStorage.setItem(SK, v); else localStorage.removeItem(SK); } catch { /* sem armazenamento */ } };
  const stores = [...new Set([...shop.rows.map((i) => i.store), store].filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt'));
  const left = shop.rows.filter((i) => !i.done).length, done = shop.rows.filter((i) => i.done);

  // Em direto só quando outra pessoa da casa também tem as compras abertas (ex.: os dois no supermercado).
  // Nessa altura: a faixa «em direto», o que o outro risca pisca, e a inicial de cada um no corredor onde está.
  const { here, at } = useShopPresence(house?.id, me?.id);
  const company = members.filter((m) => m.id !== me?.id && here[m.id]);
  const live = company.length > 0;
  const [mine, setMine] = useState<string | null>(null); // o meu corredor (onde risquei por último)
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const was = useRef(new Map<string, boolean>());
  useEffect(() => {
    const fresh = live ? shop.rows.filter((i) => i.done && was.current.get(i.id) === false && i.done_by && i.done_by !== me?.id).map((i) => i.id) : [];
    was.current = new Map(shop.rows.map((i) => [i.id, i.done]));
    if (!fresh.length) return;
    setFlash((f) => new Set([...f, ...fresh]));
    const t = setTimeout(() => setFlash((f) => new Set([...f].filter((id) => !fresh.includes(id)))), 1100);
    return () => clearTimeout(t);
  }, [shop.rows, live, me?.id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !me || !house) return;
    const nice = n[0].toUpperCase() + n.slice(1);
    setName('');
    const tmp: ShopItem = { id: 'tmp-' + Date.now(), name: nice, aisle: aisleOf(n), done: false, done_by: null, created_by: me.id, created_at: new Date().toISOString(), store };
    shop.setRows((r) => [...r, tmp]); // otimista; o tempo real confirma
    const { error } = await supabase.from('shopping_items').insert({ household_id: house.id, name: nice, aisle: tmp.aisle, created_by: me.id, store });
    if (error) { shop.setRows((r) => r.filter((x) => x.id !== tmp.id)); toast('Não ficou na lista. Tenta outra vez.'); }
  }
  async function tick(it: ShopItem) {
    const doneNow = !it.done;
    shop.setRows((r) => r.map((x) => (x.id === it.id ? { ...x, done: doneNow, done_by: doneNow ? me!.id : null } : x)));
    if (doneNow) { setMine(it.aisle); at(it.aisle); }
    const { error } = await supabase.from('shopping_items').update({ done: doneNow, done_by: doneNow ? me!.id : null, done_at: doneNow ? new Date().toISOString() : null }).eq('id', it.id);
    if (error) { shop.reload(); toast('Não deu para riscar. Tenta outra vez.'); }
  }
  async function clear() {
    const ids = done.map((i) => i.id);
    shop.setRows((r) => r.filter((x) => !x.done));
    const { error } = await supabase.from('shopping_items').delete().in('id', ids);
    if (error) { shop.reload(); toast(error.message); } else toast(`${ids.length} riscados limpos.`, { ok: true });
  }

  // Sugestões: o que costumam comprar (pelas faturas lidas) e que já devia ter acabado, com a quantidade habitual.
  const sug = suggestions(receiptItems.rows, shop.rows.filter((i) => !i.done).map((i) => i.name), todayStr());
  async function addSug(x: Suggestion, q: number) {
    if (!me || !house) return;
    const nm = `${x.product} · ${qtyText(q, x.unit)}`;
    const { error } = await supabase.from('shopping_items').insert({ household_id: house.id, name: nm, aisle: aisleOf(x.product), created_by: me.id });
    if (error) toast('Não ficou na lista. Tenta outra vez.'); else { shop.reload(); toast(`${nm}: na lista.`, { ok: true }); }
  }
  async function moveTo(it: ShopItem, st: string | null) {
    shop.setRows((r) => r.map((x) => (x.id === it.id ? { ...x, store: st } : x)));
    const { error } = await supabase.from('shopping_items').update({ store: st }).eq('id', it.id);
    if (error) { shop.reload(); toast('Não deu para mudar de loja.'); }
  }
  // Loja → corredor → artigo. Com uma loja escolhida: essa loja e, à parte, o que se compra em qualquer uma.
  const byAisle = (rows: ShopItem[]) => ORDER.map((a) => [a, rows.filter((i) => i.aisle === a)] as const).filter(([, l]) => l.length);
  const sections: [string | null, string, ShopItem[]][] = store
    ? [[store, store, shop.rows.filter((i) => i.store === store)], [null, 'Em qualquer loja', shop.rows.filter((i) => !i.store)]]
    : stores.length ? [...stores.map((st) => [st, st, shop.rows.filter((i) => i.store === st)] as [string, string, ShopItem[]]), [null, 'Em qualquer loja', shop.rows.filter((i) => !i.store)]]
    : [[null, '', shop.rows]];
  const groups = sections.filter(([, , l]) => l.length).flatMap(([k, t, l]) => byAisle(l).map(([a, g], j) => [`${k ?? '-'}:${a}`, a, g, j === 0 ? t : ''] as const));
  const who = (id: string | null) => members.find((m) => m.id === id);
  // Os pedidos de quem faz o housekeeping entram sozinhos na lista e vêm marcados com o nome.
  const asker = (id: string) => staff.find((p) => p.id === id);
  const asked = shop.rows.filter((i) => !i.done && asker(i.created_by));
  return (
    <>
      <Top title="Compras" right={done.length ? <button className="tb press" onClick={clear}>Limpar riscados</button> : null} />
      <p className="s">{left} por comprar{asked.length ? ` · ${asked.length} ${asked.length === 1 ? 'pedido' : 'pedidos'} de ${[...new Set(asked.map((i) => asker(i.created_by)!.name))].join(' e ')}` : ''}{partner && !live ? ' · a lista atualiza-se sozinha' : ''}</p>
      {grocery && <Link className="sug-pill press" to="/casa/supermercado" style={{ textDecoration: 'none' }}><Icon n="bars" s={16} />{eur(grocery.perMonth, 0)} € por mês no supermercado</Link>}
      {live && <p className="live-bar" role="status"><span className="dot" aria-hidden="true" />Em direto com {company.map((m) => m.name).join(' e ')}</p>}
      {sug.length > 0 && <button type="button" className="sug-pill press" onClick={() => open(<Suggestions list={sug} onAdd={addSug} />)}><Icon n="ask" s={16} />{sug.length} {sug.length === 1 ? 'sugestão' : 'sugestões'} pelas vossas compras</button>}
      <div className="chips shop-stores" role="group" aria-label="Loja">
        <button type="button" className="press" aria-pressed={!store} onClick={() => setStore(null)}>Todas</button>
        {stores.map((st) => <button key={st} type="button" className="press" aria-pressed={store === st} onClick={() => setStore(st)}>{st}</button>)}
        <button type="button" className="press" onClick={() => open(<NewStore onPick={(v) => setStore(v)} />)}>+ Loja</button>
      </div>
      <form className="add-row" onSubmit={add} autoComplete="off"><label className="sr" htmlFor="new-item">Novo artigo</label><input id="new-item" className="field" placeholder="Adicionar" value={name} onChange={(e) => setName(e.target.value)} /><button className="sq press" aria-label="Adicionar"><Icon n="plus" /></button></form>
      {groups.length ? (
        <div className="tile card">{groups.map(([key, a, l, head]) => (
          <div key={key}>{head && <p className="shop-store-h">{head}</p>}<p className="aisle s">{a}{live && <span className="aisle-who">{[...(mine === a ? [me!] : []), ...company.filter((m) => here[m.id].aisle === a)].map((m) => <span key={m.id} className="who" style={{ ['--c' as any]: m.color }} title={`${m.id === me?.id ? 'Tu' : m.name} neste corredor`}>{m.name[0]}</span>)}</span>}</p><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{l.map((it) => {
            const b = it.done ? who(it.done_by) : null;
            return (
              <li key={it.id} className={`item${it.done ? ' done' : ''}${flash.has(it.id) ? ' flash' : ''}`}>
                <button className="check" aria-pressed={it.done} aria-label={it.name} onClick={() => tick(it)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ground)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg></button>
                <span className="nm" role="button" tabIndex={0} onClick={() => open(<StorePick it={it} stores={stores} onPick={(v) => moveTo(it, v)} />)}>{it.name}{asker(it.created_by) && <span className="asked">pedido por {asker(it.created_by)!.name}</span>}</span>
                <span className="q s">{b && <span className="who" style={{ ['--c' as any]: b.color }}>{b.name[0]}</span>}</span>
              </li>
            );
          })}</ul></div>
        ))}</div>
      ) : <p className="s" style={{ fontSize: 'var(--t-m)' }}>Lista vazia. Escreve o primeiro artigo.</p>}
    </>
  );
}

/** As sugestões: o que costumam comprar e que já devia ter acabado. Um toque junta à lista, com a quantidade. */
function Suggestions({ list, onAdd }: { list: Suggestion[]; onAdd: (x: Suggestion, q: number) => Promise<void> }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const half = (x: Suggestion) => niceQty(x.qty / 2, x.unit);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="l">Faltará isto?</p>
      <div className="tile card rows">{list.filter((x) => !gone.has(x.product)).map((x) => {
        const h = half(x);
        return (
          <div key={x.product} className="sug-row">
            <span className="st2"><span>{x.product}</span><span className="s">{qtyText(x.perMonth, x.unit)} por mês · a última há {x.daysSince} dias</span></span>
            <span className="sug-btns">
              {h !== x.qty && <button type="button" className="tb press" onClick={async () => { await onAdd(x, h); setGone((g) => new Set(g).add(x.product)); }}>{qtyText(h, x.unit)}</button>}
              <button type="button" className="tb press on" onClick={async () => { await onAdd(x, x.qty); setGone((g) => new Set(g).add(x.product)); }}>{qtyText(x.qty, x.unit)}</button>
            </span>
          </div>
        );
      })}</div>
      <p className="s">Pelas faturas do supermercado que juntaram às despesas.</p>
    </div>
  );
}

const store0 = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Uma loja nova (Continente, Lidl, Pingo Doce…): passa a ser a escolhida, e o que se juntar vai para lá. */
function NewStore({ onPick }: { onPick: (v: string) => void }) {
  const { close } = useOverlays();
  const [v, setV] = useState('');
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); const n = v.trim().slice(0, 40); if (!n) return; onPick(n[0].toUpperCase() + n.slice(1)); close(); }} autoComplete="off">
      <p className="l">Que loja?</p>
      <input className="field" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="ex.: Continente, Lidl, Mercado" maxLength={40} />
      <div className="chips">{['Continente', 'Pingo Doce', 'Lidl', 'Auchan', 'Mercadona', 'Aldi'].map((x) => <button key={x} type="button" className="press" onClick={() => { onPick(x); close(); }}>{x}</button>)}</div>
      <button className="btn wide press">Escolher <Icon n="arrow" s={20} /></button>
    </form>
  );
}

/** Mudar um artigo de loja: um toque no nome. */
function StorePick({ it, stores, onPick }: { it: ShopItem; stores: string[]; onPick: (v: string | null) => void }) {
  const { close } = useOverlays();
  const [v, setV] = useState('');
  const pick = (x: string | null) => { onPick(x); close(); };
  return (
    <div className="form">
      <p className="l">{it.name}</p>
      <p className="s">Onde se compra?</p>
      <div className="chips">
        <button type="button" className="press" aria-pressed={!it.store} onClick={() => pick(null)}>Em qualquer loja</button>
        {stores.map((st) => <button key={st} type="button" className="press" aria-pressed={it.store === st} onClick={() => pick(st)}>{st}</button>)}
      </div>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); const n = v.trim().slice(0, 40); if (n) pick(n[0].toUpperCase() + n.slice(1)); }}>
        <input className="field" value={v} onChange={(e) => setV(e.target.value)} placeholder="Outra loja" maxLength={40} aria-label="Outra loja" />
        <button className="sq press" aria-label="Escolher"><Icon n="plus" /></button>
      </form>
    </div>
  );
}
