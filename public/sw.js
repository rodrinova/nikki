// NIKKI · service worker: a app abre do telemóvel, mesmo com a rede lenta ou sem rede.
// Ao instalar uma versão, guarda a página e todos os ficheiros dela (a lista entra no build). Ao abrir, a página vem
// logo do telemóvel; os dados vêm do Supabase (e da cópia local da app enquanto a rede não responde). Uma versão nova
// instala-se em segundo plano e entra na abertura seguinte. Página e ficheiros vêm sempre da mesma versão.
const VERSION = '/*VERSION*/';
const CACHE = `nikki-${VERSION}`;
const PRECACHE = /*PRECACHE*/[];
// A app pode viver num subcaminho (ex.: /nikki/ no GitHub Pages): tudo é relativo ao âmbito do service worker.
const BASE = self.registration.scope;
const at = (p) => new URL(String(p).replace(/^\//, ''), BASE).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, at('manifest.webmanifest'), at('icons/icon-192.png'), ...PRECACHE.map(at)])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nikki-') && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase: sempre da rede
  // Abrir a app (qualquer ecrã): a página guardada, já; sem ela, a rede.
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then((c) => c.match(BASE).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(BASE, r.clone()); return r; }))).catch(() => fetch(e.request)));
    return;
  }
  // Ficheiros (com o nome a mudar a cada versão): do telemóvel; o que faltar vem da rede e fica guardado.
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
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
