// Juntar uma pessoa à casa por um link ou QR (função join-link): sem e-mail nem palavra-passe.
import { supabase } from '@/lib/supabase';

async function call<T>(body: Record<string, unknown>): Promise<{ ok: true; v: T } | { ok: false; why: string }> {
  const { data, error } = await supabase.functions.invoke('join-link', { body });
  if (!error && data && !(data as { error?: string }).error) return { ok: true, v: data as T };
  let why = (data as { error?: string } | null)?.error ?? '';
  try { why = why || ((await (error as { context?: Response })?.context?.json()) as { error?: string })?.error || ''; } catch { /* sem corpo */ }
  return { ok: false, why: why || 'sem rede' };
}

export const joinLinkUrl = (token: string) => `${location.origin}${import.meta.env.BASE_URL}e/${token}`;
export const newJoinLink = (household_id: string) => call<{ token: string; expires_at: string }>({ action: 'create', household_id });
export const peekJoinLink = (token: string) => call<{ house: string; from: string; used: boolean }>({ action: 'peek', token });

/** O porquê de um link não servir, em português de gente. */
export const joinWhy = (w: string) => ({
  'link inválido': 'Este link não existe (ou foi substituído por um novo).',
  expirado: 'Este link já passou do prazo (7 dias). Peça um novo a quem o enviou.',
  usado: 'Este link já foi usado. Para entrar noutro aparelho: no aparelho onde já tem a NIKKI, Perfil → «Entrar noutro aparelho».',
  'casa cheia': 'Esta casa já tem duas pessoas.',
}[w] ?? 'Não deu para entrar agora. Tente outra vez daqui a pouco.');

/** Entrar neste aparelho com o link (e o nome, na primeira vez). Devolve o erro (para mostrar) ou null. */
export async function enterWithJoinLink(token: string, name: string): Promise<string | null> {
  const r = await call<{ token_hash: string }>({ action: 'redeem', token, name });
  if (!r.ok) return joinWhy(r.why);
  const { error } = await supabase.auth.verifyOtp({ token_hash: r.v.token_hash, type: 'magiclink' });
  return error ? 'Não deu para entrar agora. Tente outra vez daqui a pouco.' : null;
}
