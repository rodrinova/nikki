import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Presença no ecrã das compras: quem está lá agora e em que corredor riscou por último. O Hoje também ouve o canal
// (para mostrar «Marta está nas compras»), mas como quem só espreita: conta como presente quem tem as Compras abertas.
// Ao contrário das tabelas, o canal tem o mesmo nome para os dois (sem sufixo aleatório). Para sobreviver ao
// StrictMode, o canal só fecha um instante depois de sair o último e reaproveita-se se alguém voltar.
export type Here = Record<string, { aisle: string | null }>;
type Entry = { ch: any; key: string; users: number; shop: number; aisle: string | null; ready: boolean; close?: ReturnType<typeof setTimeout>; listeners: Set<(h: Here) => void> };
const open = new Map<string, Entry>();

function othersOf(e: Entry): Here {
  const st = e.ch.presenceState() as Record<string, { aisle?: string | null; watch?: boolean }[]>;
  const out: Here = {};
  for (const [k, metas] of Object.entries(st)) {
    const m = metas[metas.length - 1];
    if (k !== e.key && m && !m.watch) out[k] = { aisle: m.aisle ?? null };
  }
  return out;
}

/** O que digo aos outros: nas compras (com o corredor) ou só a espreitar. */
const track = (e: Entry) => { if (e.ready) e.ch.track(e.shop > 0 ? { aisle: e.aisle } : { watch: true }); };

function join(topic: string, key: string, f: (h: Here) => void, watch: boolean) {
  const had = open.get(topic);
  if (had) { clearTimeout(had.close); had.users++; if (!watch && had.shop++ === 0) { had.aisle = null; track(had); } had.listeners.add(f); f(othersOf(had)); return; }
  const ch = supabase.channel(topic, { config: { presence: { key } } });
  const e: Entry = { ch, key, users: 1, shop: watch ? 0 : 1, aisle: null, ready: false, listeners: new Set([f]) };
  ch.on('presence', { event: 'sync' }, () => { const h = othersOf(e); e.listeners.forEach((x) => x(h)); });
  ch.subscribe((status: string) => { if (status === 'SUBSCRIBED') { e.ready = true; track(e); } });
  open.set(topic, e);
}

function leave(topic: string, f: (h: Here) => void, watch: boolean) {
  const e = open.get(topic);
  if (!e) return;
  e.listeners.delete(f);
  if (!watch && --e.shop === 0) track(e);
  if (--e.users > 0) return;
  e.close = setTimeout(() => { e.ch.untrack(); supabase.removeChannel(e.ch); open.delete(topic); }, 300);
}

/** Quem mais está no ecrã das compras desta casa, e uma função para dizer em que corredor estou. */
export function useShopPresence(houseId: string | undefined, me: string | undefined, watch = false) {
  const [here, setHere] = useState<Here>({});
  const topic = `nikki-compras-${houseId}`;
  useEffect(() => {
    if (!houseId || !me) return;
    join(topic, me, setHere, watch);
    return () => leave(topic, setHere, watch);
  }, [topic, houseId, me, watch]);
  const at = useCallback((aisle: string) => { const e = open.get(topic); if (e) { e.aisle = aisle; track(e); } }, [topic]);
  return { here, at };
}
