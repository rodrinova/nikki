import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo';

// Projeto Supabase próprio da NIKKI (a app antiga do Lovable tem o seu, que fica intacto); tudo no schema "nikki".
// A chave publicável é pública por natureza: a proteção está nas regras de acesso (RLS) da base de dados.
export const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://imbflvhufvvjcfetljsd.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_rNKjS41_m89cIDAgMb6kNg_R1_IDMxL';

/** VITE_DEMO=1: a mesma app com dados de exemplo em memória (para ver sem base de dados). */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export const supabase: SupabaseClient<any, 'nikki', any> = DEMO
  ? (createDemoClient() as unknown as SupabaseClient<any, 'nikki', any>)
  : createClient(url, key, { db: { schema: 'nikki' }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
