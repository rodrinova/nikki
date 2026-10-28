import { createContext, useContext, type ReactNode } from 'react';
import { useLive } from './live';
import { useSession } from './session';
import type { Expense, Transfer } from '@/lib/money';

export interface ExpenseRow extends Expense { created_by: string; note: string | null; created_at: string }
export interface TransferRow extends Transfer { id: string; created_by: string }
export interface ShopItem { id: string; name: string; aisle: string; done: boolean; done_by: string | null; created_by: string; created_at: string }
export interface InviteRow { id: string; email: string; role: 'admin' | 'member'; token: string; code: string; expires_at: string; accepted_at: string | null }
export interface DeadlineRow { id: string; title: string; due_on: string; amount: string | null; paid_at: string | null }

// Dados da casa atual, partilhados por todos os ecrãs (um só canal de tempo real por tabela).
function useHouseData() {
  const { house } = useSession();
  const h = house?.id;
  return {
    expenses: useLive<ExpenseRow>('expenses', h, 'id, paid_by, other_id, amount, split, payer_share, spent_on, category, created_by, note, created_at', { column: 'spent_on', ascending: false }),
    transfers: useLive<TransferRow>('transfers', h, 'id, from_id, to_id, amount, made_on, created_by', { column: 'made_on', ascending: false }),
    shop: useLive<ShopItem>('shopping_items', h, 'id, name, aisle, done, done_by, created_by, created_at', { column: 'created_at' }),
    deadlines: useLive<DeadlineRow>('deadlines', h, 'id, title, due_on, amount, paid_at', { column: 'due_on' }),
  };
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
