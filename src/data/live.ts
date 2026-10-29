import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO, supabase } from '@/lib/supabase';
import { cache } from '@/lib/cache';

/**
 * Linhas de uma tabela da casa, sempre atualizadas: lê e volta a ler quando alguém muda alguma coisa
 * (tempo real do Supabase). O canal tem um sufixo aleatório para sobreviver ao StrictMode.
 * Abre logo com a cópia guardada neste aparelho (se houver) e troca-a pelos dados da rede quando chegam.
 */
export function useLive<T>(table: string, householdId: string | null | undefined, select = '*', order?: { column: string; ascending?: boolean }) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = `${table}|${householdId}|${select}`;
  const fresh = useRef<string | null>(null); // já chegaram dados da rede para esta chave (a cópia não os substitui)

  const load = useCallback(async () => {
    if (!householdId) { setRows([]); setLoading(false); return; }
    // Paginado: o PostgREST devolve no máximo 1000 linhas por pedido.
    const all: T[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select(select).eq('household_id', householdId).range(from, from + 999);
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      const { data, error: e } = await q;
      // Sem rede ou com erro: fica o que já se mostra (a cópia), em vez de esvaziar o ecrã.
      if (e) { setError(e.message); setLoading(false); return; }
      all.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) break;
    }
    fresh.current = key;
    setError(null); setRows(all); setLoading(false);
    if (!DEMO) cache.set(key, all);
  }, [key, table, householdId, select, order?.column, order?.ascending]);

  useEffect(() => {
    fresh.current = null;
    if (householdId && !DEMO) cache.get<T[]>(key).then((c) => { if (c && fresh.current !== key) { setRows(c); setLoading(false); } });
    load();
    if (!householdId) return;
    const ch = supabase.channel(`nikki-${table}-${householdId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'nikki', table, filter: `household_id=eq.${householdId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, key, table, householdId]);

  return { rows, setRows, loading, error, reload: load };
}
