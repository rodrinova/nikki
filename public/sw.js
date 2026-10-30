// NIKKI · service worker: a app abre do telemóvel, mesmo com a rede lenta ou sem rede.
// Ao instalar uma versão, guarda a página e todos os ficheiros dela (a lista entra no build). Ao abrir, a página vem
// logo do telemóvel; os dados vêm do Supabase (e da cópia local da app enquanto a rede não responde). Uma versão nova
// instala-se em segundo plano e entra na abertura seguinte. Página e ficheiros vêm sempre da mesma versão.
const VERSION = '/*VERSION*/';
const CACHE = `nikki-${VERSION}`;
const PRECACHE = /*PRECACHE*/[]; // o essencial para abrir: ao instalar
const LATER = /*LATER*/[]; // os ecrãs que se abrem depois: quando a app pede, um de cada vez
// A app pode viver num subcaminho (ex.: /nikki/ no GitHub Pages): tudo é relativo ao âmbito do service worker.
const BASE = self.registration.scope;
const at = (p) => new URL(String(p).replace(/^\//, ''), BASE).href;

// Um ficheiro com o nome a mudar a cada versão (assets/…-hash.js) que já esteja guardado de uma versão anterior
// passa para a nova sem voltar à rede (as bibliotecas mudam pouco); os outros vêm da rede.
async function take(c, u) {
  const old = await caches.match(u);
  if (old) return c.put(u, old);
  const r = await fetch(u);
  if (r.ok) await c.put(u, r);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    // A página e o manifesto vêm sempre da rede (mudam sem mudar de nome).
    await c.addAll([new Request(BASE, { cache: 'no-cache' }), new Request(at('manifest.webmanifest'), { cache: 'no-cache' })]);
    await Promise.all([at('icons/icon-192.png'), ...PRECACHE.map(at)].map((u) => take(c, u)));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nikki-') && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Com a app aberta e sossegada, a página pede o resto: guarda-se um ficheiro de cada vez (sem disputar a rede).
self.addEventListener('message', (e) => {
  if (e.data !== 'warm') return;
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const f of LATER) {
      const u = at(f);
      if (await c.match(u)) continue;
      try { await take(c, u); } catch { return; }
    }
  }));
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
