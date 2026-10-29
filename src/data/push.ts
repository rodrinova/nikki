import { useCallback, useEffect, useState } from 'react';
import { DEMO, supabase } from '@/lib/supabase';
import { useSession } from './session';

// Notificações no telemóvel (Web Push): pedir licença, registar este aparelho e guardar a subscrição.
// No iPhone só funcionam com a NIKKI no ecrã principal (iOS 16.4 ou mais recente).

const VAPID = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;
const key = (b64: string) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

export type PushState = 'demo' | 'unsupported' | 'install' | 'blocked' | 'off' | 'on' | 'nokey';
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function usePush() {
  const { me, house } = useSession();
  const [state, setState] = useState<PushState>('off');
  const [morning, setMorning] = useState(true);
  const check = useCallback(async () => {
    if (DEMO) return setState('demo');
    if (ios() && !standalone()) return setState('install');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
    if (!VAPID) return setState('nokey');
    if (Notification.permission === 'denied') return setState('blocked');
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return setState('off');
    const { data } = await supabase.from('push_subs').select('morning').eq('endpoint', sub.endpoint).maybeSingle();
    setMorning((data as { morning: boolean } | null)?.morning ?? true);
    setState(data ? 'on' : 'off');
  }, []);
  useEffect(() => { check(); }, [check]);

  const enable = async (): Promise<string | null> => {
    if (state === 'demo' || !me || !house || !VAPID) return null;
    if ((await Notification.requestPermission()) !== 'granted') { setState('blocked'); return 'Sem licença para notificações. Muda nas definições do telemóvel.'; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID) }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await supabase.from('push_subs').upsert({ endpoint: j.endpoint, profile_id: me.id, household_id: house.id, p256dh: j.keys.p256dh, auth: j.keys.auth, morning });
    if (error) return error.message;
    setState('on');
    await supabase.functions.invoke('push', { body: { test: true } }).catch(() => undefined);
    return null;
  };
  const disable = async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    setState('off');
  };
  const setMorningOn = async (v: boolean) => {
    setMorning(v);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await supabase.from('push_subs').update({ morning: v }).eq('endpoint', sub.endpoint);
  };
  return { state, morning, enable, disable, setMorning: setMorningOn };
}
