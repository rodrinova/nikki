import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo';

// Projeto Supabase partilhado com a app antiga; a NIKKI usa só o schema "nikki".
// A chave publicável é pública por natureza: a proteção está nas regras de acesso (RLS) da base de dados.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://xjhlcfgihyoiewuamzfv.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_dPb4L739-_u6cVheVlK9iA_tONH19Vo';

/** VITE_DEMO=1: a mesma app com dados de exemplo em memória (para ver sem base de dados). */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export const supabase: SupabaseClient<any, 'nikki', any> = DEMO
  ? (createDemoClient() as unknown as SupabaseClient<any, 'nikki', any>)
  : createClient(url, key, { db: { schema: 'nikki' }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
