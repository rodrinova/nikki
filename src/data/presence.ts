import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Presença no ecrã das compras: quem está lá agora e em que corredor riscou por último.
// Ao contrário das tabelas, o canal tem o mesmo nome para os dois (sem sufixo aleatório). Para sobreviver ao
// StrictMode, o canal só fecha um instante depois de sair o último e reaproveita-se se alguém voltar.
export type Here = Record<string, { aisle: string | null }>;
type Entry = { ch: any; key: string; users: number; close?: ReturnType<typeof setTimeout>; listeners: Set<(h: Here) => void> };
const open = new Map<string, Entry>();

function othersOf(e: Entry): Here {
  const st = e.ch.presenceState() as Record<string, { aisle?: string | null }[]>;
  const out: Here = {};
  for (const [k, metas] of Object.entries(st)) if (k !== e.key && metas.length) out[k] = { aisle: metas[metas.length - 1].aisle ?? null };
  return out;
}

function join(topic: string, key: string, f: (h: Here) => void) {
  const had = open.get(topic);
  if (had) { clearTimeout(had.close); had.users++; had.listeners.add(f); f(othersOf(had)); return; }
  const ch = supabase.channel(topic, { config: { presence: { key } } });
  const e: Entry = { ch, key, users: 1, listeners: new Set([f]) };
  ch.on('presence', { event: 'sync' }, () => { const h = othersOf(e); e.listeners.forEach((x) => x(h)); });
  ch.subscribe((status: string) => { if (status === 'SUBSCRIBED') ch.track({ aisle: null }); });
  open.set(topic, e);
}

function leave(topic: string, f: (h: Here) => void) {
  const e = open.get(topic);
  if (!e) return;
  e.listeners.delete(f);
  if (--e.users > 0) return;
  e.close = setTimeout(() => { e.ch.untrack(); supabase.removeChannel(e.ch); open.delete(topic); }, 300);
}

/** Quem mais está no ecrã das compras desta casa, e uma função para dizer em que corredor estou. */
export function useShopPresence(houseId: string | undefined, me: string | undefined) {
  const [here, setHere] = useState<Here>({});
  const topic = `nikki-compras-${houseId}`;
  useEffect(() => {
    if (!houseId || !me) return;
    join(topic, me, setHere);
    return () => leave(topic, setHere);
  }, [topic, houseId, me]);
  const at = useCallback((aisle: string) => { open.get(topic)?.ch.track({ aisle }); }, [topic]);
  return { here, at };
}
