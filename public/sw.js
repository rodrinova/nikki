// NIKKI · service worker mínimo: a app abre sem rede; os dados vêm sempre do Supabase quando há rede.
const CACHE = 'nikki-v3';
// A app pode viver num subcaminho (ex.: /nikki/ no GitHub Pages): tudo é relativo ao âmbito do service worker.
const BASE = self.registration.scope;
const at = (p) => new URL(String(p).replace(/^\//, ''), BASE).href;
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, at('manifest.webmanifest'), at('icons/icon-192.png')]))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase e fontes: sempre da rede
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(() => caches.match(BASE))); return; }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })));
});

// Notificações: mostrar e, ao tocar, abrir a NIKKI no sítio certo.
self.addEventListener('push', (e) => {
  let m = { title: 'NIKKI', body: '', url: '/' };
  try { m = { ...m, ...e.data.json() }; } catch { /* sem dados: aviso simples */ }
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, icon: at('icons/icon-192.png'), badge: at('icons/icon-192.png'), lang: 'pt-PT', data: { url: m.url }, tag: m.url }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = at(e.notification.data?.url ?? '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.startsWith(BASE));
    return w ? w.focus().then(() => w.navigate(url)) : self.clients.openWindow(url);
  }));
});
