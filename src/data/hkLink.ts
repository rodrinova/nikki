// Quem faz o housekeeping entra por um link (função hk-link): sem e-mail nem convite. Quem administra a casa gera o
// link (anula o anterior) e envia-o por WhatsApp ou como quiser; quem o abre fica com a NIKKI dela nesse aparelho.
import { supabase } from '@/lib/supabase';

async function call<T>(body: Record<string, unknown>): Promise<{ ok: true; v: T } | { ok: false; why: string }> {
  const { data, error } = await supabase.functions.invoke('hk-link', { body });
  if (!error && data && !(data as { error?: string }).error) return { ok: true, v: data as T };
  let why = (data as { error?: string } | null)?.error ?? '';
  try { why = why || ((await (error as { context?: Response })?.context?.json()) as { error?: string })?.error || ''; } catch { /* sem corpo */ }
  return { ok: false, why: why || 'sem rede' };
}

export const hkLinkUrl = (token: string) => `${location.origin}${import.meta.env.BASE_URL}h/${token}`;

/** Um link novo para a ficha (o anterior deixa de servir). */
export const newHkLink = (hk_id: string) => call<{ token: string }>({ action: 'create', hk_id });

/** Entrar neste aparelho com o link. Devolve o erro (para mostrar) ou null. */
export async function enterWithHkLink(token: string): Promise<string | null> {
  const r = await call<{ token_hash: string; name: string }>({ action: 'redeem', token });
  if (!r.ok) return r.why === 'link inválido' ? 'Este link já não serve. Peça um novo a quem o enviou.' : 'Não deu para entrar agora. Tente outra vez daqui a pouco.';
  const { error } = await supabase.auth.verifyOtp({ token_hash: r.v.token_hash, type: 'magiclink' });
  return error ? 'Não deu para entrar agora. Tente outra vez daqui a pouco.' : null;
}
