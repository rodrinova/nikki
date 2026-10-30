// Entrar noutro aparelho (função device-link): o aparelho com sessão pede um código curto; o aparelho novo troca-o
// por uma sessão sua. Cada aparelho fica com a sua sessão: sair num não tira o outro.
import { supabase } from '@/lib/supabase';

type Res<T> = { ok: true; v: T } | { ok: false; why: string };

async function call<T>(body: Record<string, unknown>): Promise<Res<T>> {
  const { data, error } = await supabase.functions.invoke('device-link', { body });
  if (!error && data && !(data as { error?: string }).error) return { ok: true, v: data as T };
  let why = (data as { error?: string } | null)?.error ?? '';
  try { why = why || ((await (error as { context?: Response })?.context?.json()) as { error?: string })?.error || ''; } catch { /* sem corpo */ }
  return { ok: false, why: why || 'sem rede' };
}

/** Um código novo (8 letras, 10 minutos, uma só vez) para entrar com esta conta noutro aparelho. */
export const newDeviceCode = () => call<{ code: string; expires_at: string }>({ action: 'create' });

/** Entrar neste aparelho com o código de outro. */
export async function enterWithCode(code: string): Promise<string | null> {
  const r = await call<{ token_hash: string }>({ action: 'redeem', code });
  if (!r.ok) return r.why === 'código inválido' ? 'Esse código não serve: já foi usado, passou o prazo de 10 minutos, ou tem uma letra trocada.' : 'Não deu para entrar. Tenta outra vez.';
  const { error } = await supabase.auth.verifyOtp({ token_hash: r.v.token_hash, type: 'magiclink' });
  return error ? 'Não deu para entrar. Pede um código novo no outro aparelho.' : null;
}
