import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './session';

/** Na administração: contas à espera e tickets novos (o ponto no avatar). Só para quem administra a app. */
export function useAdminBadge() {
  const { appAdmin } = useSession();
  const [b, setB] = useState({ pending: 0, novo: 0 });
  useEffect(() => {
    if (!appAdmin) return;
    supabase.rpc('admin_kpis').then(({ data }) => {
      const k = data as { accounts?: { pending?: number }; tickets?: { novo?: number } } | null;
      if (k) setB({ pending: k.accounts?.pending ?? 0, novo: k.tickets?.novo ?? 0 });
    }, () => undefined);
  }, [appAdmin]);
  return b;
}
