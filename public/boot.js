/* NIKKI · arranque. Corre antes da app, como um script clássico (ES5), para os iPads e iPhones antigos:
   1) acrescenta o que falta aos browsers antigos (o resto do código é compilado para o Safari 12);
   2) guarda os erros do arranque;
   3) se ao fim de 15 segundos a app não abriu, troca a cara a piscar por uma mensagem com o erro e duas saídas
      (tentar outra vez; limpar a cópia guardada da app e tentar). Os dados e a sessão não se apagam. */
(function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window;
  if (typeof globalThis === 'undefined') g.globalThis = g;
  function def(o, k, f) { if (!o[k]) Object.defineProperty(o, k, { value: f, writable: true, configurable: true }); }
  function at(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; }
  def(Array.prototype, 'at', at);
  def(String.prototype, 'at', at);
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(Array.prototype, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; return undefined; });
  def(Array.prototype, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(String.prototype, 'replaceAll', function (a, b) {
    if (a instanceof RegExp) return this.replace(a, b);
    return this.split(String(a)).join(typeof b === 'function' ? b(String(a)) : String(b));
  });
  def(String.prototype, 'matchAll', function (re) {
    var r = new RegExp(re.source, re.flags.indexOf('g') < 0 ? re.flags + 'g' : re.flags), out = [], m;
    while ((m = r.exec(this)) !== null) { out.push(m); if (m[0] === '') r.lastIndex++; }
    return out;
  });
  def(Object, 'fromEntries', function (it) { var o = {}; Array.from(it).forEach(function (p) { o[p[0]] = p[1]; }); return o; });
  if (typeof g.queueMicrotask !== 'function') g.queueMicrotask = function (f) { Promise.resolve().then(f); };

  var errs = [];
  g.__nikkiBootErrors = errs;
  g.addEventListener('error', function (e) { errs.push((e.message || 'erro') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')); });
  g.addEventListener('unhandledrejection', function (e) { var r = e.reason; errs.push(String((r && r.message) || r)); });

  function stuck() {
    var root = document.getElementById('root');
    if (!root) return;
    var still = root.querySelector('.boot') || root.querySelector('.wait-page');
    if (!still || document.querySelector('.boot-fail')) return;
    var ios = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
    var box = document.createElement('div');
    box.className = 'boot-fail';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:28px;background:#0B0B0B;color:#F4F4F4;font:17px/1.4 -apple-system,Helvetica,Arial,sans-serif';
    box.innerHTML = '<p style="margin:0;font-size:22px">A NIKKI está a demorar a abrir neste aparelho.</p>'
      + '<p style="margin:0;color:#9B9B9B;font-size:15px">' + (ios ? 'iOS ' + ios[1] + '.' + ios[2] + '. ' : '') + (errs.length ? 'O que correu mal: ' + errs[0].replace(/</g, '&lt;') : 'A rede pode estar lenta.') + '</p>'
      + '<button type="button" id="boot-again" style="min-height:48px;border:0;border-radius:999px;background:#F4F4F4;color:#0B0B0B;font:inherit">Tentar outra vez</button>'
      + '<button type="button" id="boot-clean" style="min-height:48px;border:1px solid #444;border-radius:999px;background:none;color:#F4F4F4;font:inherit">Limpar a cópia guardada e tentar</button>'
      + '<p style="margin:0;color:#7D7D7D;font-size:13px">Limpar não apaga nada da casa nem a tua sessão: só a cópia da app guardada neste aparelho.</p>';
    document.body.appendChild(box);
    // Se a app acabar por abrir (rede lenta), a mensagem sai sozinha.
    var watch = setInterval(function () {
      if (!root.querySelector('.boot') && !root.querySelector('.wait-page')) { clearInterval(watch); if (box.parentNode) box.parentNode.removeChild(box); }
    }, 1500);
    document.getElementById('boot-again').onclick = function () { location.reload(); };
    document.getElementById('boot-clean').onclick = function () {
      var jobs = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (g.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
    };
  }
  setTimeout(stuck, 15000);
  setTimeout(stuck, 30000);
})();
