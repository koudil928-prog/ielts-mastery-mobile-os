/* IELTS Mastery Mobile OS v5.0 Service Worker — network-first for HTML/JS/CSS (no stale-code lock-in), cache-first for other shell assets.
   Cross-origin requests (GAS etc.) are NEVER intercepted or cached (token safety). */
var CACHE = 'imos-v5-0';
var SHELL = ['./', './index.html', './manifest.json', './css/app.css', './js/core.js', './js/pack-adapters.js', './js/sync.js', './js/qr.js', './js/audio-dsp.js', './js/sfx.js', './js/vfx-engine.js', './js/game-bestiary.js', './js/game-rider.js', './js/game-seminar.js', './js/sanctuary.js', './js/app.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', function (e) {
  // Per-file caching: one missing optional module must never break the whole shell install.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () { return null; }); }));
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function isCodeAsset(url) { return /\.(?:html|js|css)$/.test(url.pathname) || url.pathname.endsWith('/'); }
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // GAS etc: network only, never cached
  if (isCodeAsset(url)) {
    // Network-first: fresh code wins; cache is the offline fallback.
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); }); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match('./index.html'); });
  }));
});
self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
