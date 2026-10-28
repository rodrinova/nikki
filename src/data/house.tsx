import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { monthKey, nextMonth, parseDate, prevMonth, todayStr } from '@/lib/dates';
import { useLive } from './live';
import { useSession } from './session';
import type { Expense, Transfer } from '@/lib/money';

export interface ExpenseRow extends Expense { created_by: string; note: string | null; created_at: string }
export interface TransferRow extends Transfer { id: string; created_by: string }
export interface ShopItem { id: string; name: string; aisle: string; done: boolean; done_by: string | null; created_by: string; created_at: string }
export interface InviteRow { id: string; email: string; role: 'admin' | 'member'; token: string; code: string; expires_at: string; accepted_at: string | null }
export interface DeadlineRow { id: string; title: string; due_on: string; amount: string | null; paid_at: string | null }
export interface EventRow { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; owner_id: string | null; private: boolean; created_by: string }
export interface BusyRow { id: string; starts_at: string; ends_at: string | null; all_day: boolean; owner_id: string }

/**
 * Eventos privados dos outros, só com a hora (a base nunca devolve o título; a app mostra «ocupado»).
 * Lê de dois meses atrás a seis à frente e volta a ler quando os eventos mudam.
 */
function useBusy(h: string | undefined, events: unknown) {
  const [rows, setRows] = useState<BusyRow[]>([]);
  const load = useCallback(async () => {
    if (!h) { setRows([]); return; }
    const mk = monthKey(todayStr());
    let end = mk;
    for (let k = 0; k < 6; k++) end = nextMonth(end);
    const { data, error } = await supabase.rpc('busy_slots', { h, from_ts: parseDate(`${prevMonth(prevMonth(mk))}-01`).toISOString(), to_ts: parseDate(`${end}-01`).toISOString() });
    if (!error) setRows((data ?? []) as BusyRow[]);
  }, [h]);
  useEffect(() => { load(); }, [load, events]);
  return { rows, reload: load };
}

// Dados da casa atual, partilhados por todos os ecrãs (um só canal de tempo real por tabela).
function useHouseData() {
  const { house } = useSession();
  const h = house?.id;
  const d = {
    expenses: useLive<ExpenseRow>('expenses', h, 'id, paid_by, other_id, amount, split, payer_share, spent_on, category, created_by, note, created_at', { column: 'spent_on', ascending: false }),
    transfers: useLive<TransferRow>('transfers', h, 'id, from_id, to_id, amount, made_on, created_by', { column: 'made_on', ascending: false }),
    shop: useLive<ShopItem>('shopping_items', h, 'id, name, aisle, done, done_by, created_by, created_at', { column: 'created_at' }),
    deadlines: useLive<DeadlineRow>('deadlines', h, 'id, title, due_on, amount, paid_at', { column: 'due_on' }),
    events: useLive<EventRow>('events', h, 'id, title, starts_at, ends_at, all_day, owner_id, private, created_by', { column: 'starts_at' }),
  };
  const busy = useBusy(h, d.events.rows);
  // Voltar a ler tudo (puxar para atualizar).
  const { expenses: e, transfers: t, shop: s, deadlines: dl, events: ev } = d;
  const reloadAll = useCallback(() => Promise.all([e.reload(), t.reload(), s.reload(), dl.reload(), ev.reload(), busy.reload()]), [e.reload, t.reload, s.reload, dl.reload, ev.reload, busy.reload]);
  return { ...d, busy, reloadAll };
}

const Ctx = createContext<ReturnType<typeof useHouseData> | null>(null);
export function HouseProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useHouseData()}>{children}</Ctx.Provider>;
}
export const useHouse = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHouse fora do HouseProvider');
  return c;
};
