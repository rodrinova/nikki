import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo';

// Projeto Supabase próprio da NIKKI (a app antiga do Lovable tem o seu, que fica intacto); tudo no schema "nikki".
// A chave publicável é pública por natureza: a proteção está nas regras de acesso (RLS) da base de dados.
export const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://imbflvhufvvjcfetljsd.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_rNKjS41_m89cIDAgMb6kNg_R1_IDMxL';

/**
 * Demonstração: VITE_DEMO=1 (a página de demonstração) ou aberta pela administração da app real (fica marcada neste
 * separador; ao fechar a app volta a ser a NIKKI verdadeira). Os dados de exemplo vivem só em memória.
 */
export const DEMO_VISIT = (() => { try { return sessionStorage.getItem('nikki_demo') === '1'; } catch { return false; } })();
export const DEMO = import.meta.env.VITE_DEMO === '1' || DEMO_VISIT;
export function startDemo() { try { sessionStorage.setItem('nikki_demo', '1'); } catch { /* sem armazenamento */ } location.reload(); }
export function stopDemo() {
  try {
    sessionStorage.removeItem('nikki_demo');
    // O que a demonstração deixou guardado neste aparelho (a casa escolhida, resumos, caches) sai também.
    for (const k of Object.keys(localStorage)) if (k.includes('demo-') || localStorage.getItem(k)?.startsWith('demo-')) localStorage.removeItem(k);
  } catch { /* sem armazenamento */ }
  location.reload();
}

export const supabase: SupabaseClient<any, 'nikki', any> = DEMO
  ? (createDemoClient({ visit: DEMO_VISIT }) as unknown as SupabaseClient<any, 'nikki', any>)
  : createClient(url, key, { db: { schema: 'nikki' }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
