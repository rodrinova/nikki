// Desbloquear com Face ID ou impressão digital (opcional, por aparelho). Usa uma chave de acesso (WebAuthn) do próprio
// telemóvel: no iPhone, Face ID/Touch ID; no Android, impressão digital ou cara. A chave nunca sai do aparelho e não
// substitui a sessão: só tranca o ecrã ao abrir e quando se volta à app depois de 5 minutos fora.
// Se falhar ou não houver biometria, «Entrar de novo pelo e-mail» termina a sessão neste aparelho.
import { useEffect, useState } from 'react';
import { store } from '@/lib/store';
import { supabase, DEMO } from '@/lib/supabase';
import { Face } from '@/brand/Face';

const KEY = 'nikki_lock';
const AWAY = 5 * 60_000;
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** O telemóvel tem biometria (ou PIN do sistema) para chaves de acesso? */
export async function canLock() {
  if (DEMO || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
export const lockOn = () => !!store.get(KEY);

/** Liga: cria a chave neste aparelho (o telemóvel pede o Face ID ou a impressão digital). */
export async function enableLock(name: string): Promise<string | null> {
  try {
    const c = (await navigator.credentials.create({ publicKey: {
      challenge: rnd(32), rp: { name: 'NIKKI', id: location.hostname },
      user: { id: rnd(16), name: name || 'NIKKI', displayName: name || 'NIKKI' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000, attestation: 'none',
    } })) as PublicKeyCredential | null;
    if (!c) return 'Não ficou ligado.';
    store.set(KEY, b64(c.rawId));
    return null;
  } catch { return 'Não ficou ligado. Tenta outra vez.'; }
}
export const disableLock = () => store.remove(KEY);

async function verify(): Promise<boolean> {
  const id = store.get(KEY);
  if (!id) return true;
  try {
    const r = await navigator.credentials.get({ publicKey: { challenge: rnd(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60_000 } });
    return !!r;
  } catch { return false; }
}

/** O ecrã trancado: aparece ao abrir e ao voltar depois de 5 minutos fora (só se estiver ligado neste aparelho). */
export function LockGate() {
  const [locked, setLocked] = useState(lockOn);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let left = 0;
    const vis = () => {
      if (document.hidden) left = Date.now();
      else if (lockOn() && left && Date.now() - left > AWAY) setLocked(true);
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  if (!locked) return null;
  const open = async () => { setErr(false); if (await verify()) setLocked(false); else setErr(true); };
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label="NIKKI trancada">
      <Face h={34} mode="still" />
      <p>A NIKKI está trancada.</p>
      <button type="button" className="btn accent press" autoFocus onClick={open}>Abrir com Face ID ou impressão digital</button>
      {err && <p className="s">Não deu. Tenta outra vez.</p>}
      <button type="button" className="tb quiet press" onClick={async () => { disableLock(); await supabase.auth.signOut(); location.reload(); }}>Entrar de novo pelo e-mail</button>
    </div>
  );
}
