import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Linhas de uma tabela da casa, sempre atualizadas: lê e volta a ler quando alguém muda alguma coisa
 * (tempo real do Supabase). O canal tem um sufixo aleatório para sobreviver ao StrictMode.
 */
export function useLive<T>(table: string, householdId: string | null | undefined, select = '*', order?: { column: string; ascending?: boolean }) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!householdId) { setRows([]); setLoading(false); return; }
    // Paginado: o PostgREST devolve no máximo 1000 linhas por pedido.
    const all: T[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select(select).eq('household_id', householdId).range(from, from + 999);
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      const { data, error: e } = await q;
      if (e) { setError(e.message); break; }
      all.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) break;
    }
    setRows(all); setLoading(false);
  }, [table, householdId, select, order?.column, order?.ascending]);

  useEffect(() => {
    load();
    if (!householdId) return;
    const ch = supabase.channel(`nikki-${table}-${householdId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'nikki', table, filter: `household_id=eq.${householdId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, table, householdId]);

  return { rows, setRows, loading, error, reload: load };
}
