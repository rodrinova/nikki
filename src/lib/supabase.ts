import { createClient } from '@supabase/supabase-js';

// Projeto Supabase partilhado com a app antiga; a NIKKI usa só o schema "nikki".
// A chave publicável é pública por natureza: a proteção está nas regras de acesso (RLS) da base de dados.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://xjhlcfgihyoiewuamzfv.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_dPb4L739-_u6cVheVlK9iA_tONH19Vo';

export const supabase = createClient(url, key, {
  db: { schema: 'nikki' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
