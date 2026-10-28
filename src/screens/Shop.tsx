import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/data/session';
import { useHouse, type ShopItem } from '@/data/house';
import { useOverlays } from '@/ui/overlays';
import { Icon } from '@/ui/Icon';
import { Top } from './Home';

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
const aisleOf = (n: string) => AISLES.find(([, re]) => re.test(n))?.[0] ?? 'Mercearia';
const ORDER = [...AISLES.map(([a]) => a), 'Mercearia'];

export function Shop() {
  const { me, partner, house, members } = useSession();
  const { shop } = useHouse();
  const { toast } = useOverlays();
  const [name, setName] = useState('');
  const left = shop.rows.filter((i) => !i.done).length, done = shop.rows.filter((i) => i.done);

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !me || !house) return;
    const nice = n[0].toUpperCase() + n.slice(1);
    setName('');
    const tmp: ShopItem = { id: 'tmp-' + Date.now(), name: nice, aisle: aisleOf(n), done: false, done_by: null, created_by: me.id, created_at: new Date().toISOString() };
    shop.setRows((r) => [...r, tmp]); // otimista; o tempo real confirma
    const { error } = await supabase.from('shopping_items').insert({ household_id: house.id, name: nice, aisle: tmp.aisle, created_by: me.id });
    if (error) { shop.setRows((r) => r.filter((x) => x.id !== tmp.id)); toast('Não ficou na lista. Tenta outra vez.'); }
  }
  async function tick(it: ShopItem) {
    const doneNow = !it.done;
    shop.setRows((r) => r.map((x) => (x.id === it.id ? { ...x, done: doneNow, done_by: doneNow ? me!.id : null } : x)));
    const { error } = await supabase.from('shopping_items').update({ done: doneNow, done_by: doneNow ? me!.id : null, done_at: doneNow ? new Date().toISOString() : null }).eq('id', it.id);
    if (error) { shop.reload(); toast('Não foi possível riscar.'); }
  }
  async function clear() {
    const ids = done.map((i) => i.id);
    shop.setRows((r) => r.filter((x) => !x.done));
    const { error } = await supabase.from('shopping_items').delete().in('id', ids);
    if (error) { shop.reload(); toast(error.message); } else toast(`${ids.length} riscados limpos.`);
  }

  const groups = ORDER.map((a) => [a, shop.rows.filter((i) => i.aisle === a)] as const).filter(([, l]) => l.length);
  const who = (id: string | null) => members.find((m) => m.id === id);
  return (
    <>
      <Top title="Compras" right={done.length ? <button className="tb press" onClick={clear}>Limpar riscados</button> : null} />
      <p className="s">{left} por comprar{partner ? ` · em tempo real com ${partner.name}` : ''}</p>
      <form className="add-row" onSubmit={add} autoComplete="off"><label className="sr" htmlFor="new-item">Novo artigo</label><input id="new-item" className="field" placeholder="Adicionar" value={name} onChange={(e) => setName(e.target.value)} /><button className="sq press" aria-label="Adicionar"><Icon n="plus" /></button></form>
      {groups.length ? (
        <div className="tile card">{groups.map(([a, l]) => (
          <div key={a}><p className="aisle s">{a}</p><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{l.map((it) => {
            const b = it.done ? who(it.done_by) : null;
            return (
              <li key={it.id} className={`item${it.done ? ' done' : ''}`}>
                <button className="check" aria-pressed={it.done} aria-label={it.name} onClick={() => tick(it)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ground)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg></button>
                <span className="nm">{it.name}</span>
                <span className="q s">{b && <span className="who" style={{ ['--c' as any]: b.color }}>{b.name[0]}</span>}</span>
              </li>
            );
          })}</ul></div>
        ))}</div>
      ) : <p className="s" style={{ fontSize: 'var(--t-m)' }}>A lista está vazia. Escreve o primeiro artigo; a NIKKI arruma por corredor.</p>}
    </>
  );
}
