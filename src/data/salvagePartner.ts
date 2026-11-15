import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// O sócio dos salvados (com conta na NIKKI): a base devolve-lhe o código da ligação ativa do dono, e a app abre o
// módulo pelo lado do sócio. A mais ninguém devolve nada. Uma pergunta por sessão.
let cache: Promise<string | null> | null = null;
export function useSalvagePartnerCode(on: boolean): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!on) { setCode(null); return; }
    cache ??= Promise.resolve(supabase.rpc('salvage_partner_code')).then(({ data }) => (typeof data === 'string' && data ? data : null), () => null);
    let live = true;
    cache.then((c) => { if (live) setCode(c); });
    return () => { live = false; };
  }, [on]);
  return code;
}
