// senorbakBolsa: la app funciona sin conexión (los datos en directo necesitan internet)
const CACHE = 'sbolsa-mvnrchsx';
const FILES = [
  "./",
  "ai.js",
  "alerts.js",
  "app.js",
  "apple-touch-icon.png",
  "asistente.js",
  "asset.js",
  "brokers.js",
  "calendar.js",
  "charts.js",
  "compare.js",
  "config.js",
  "data.js",
  "demo.js",
  "fmt.js",
  "heatmap.js",
  "home.js",
  "i18n.js",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "index.html",
  "indicators.js",
  "lang-es.js",
  "lang-eu.js",
  "lightweight-charts.standalone.production.js",
  "manifest.webmanifest",
  "md.js",
  "more.js",
  "news.js",
  "notifs.js",
  "portfolio.js",
  "scoreboard.js",
  "screener.js",
  "search.js",
  "senales.js",
  "sentiment.js",
  "settings.js",
  "signals.js",
  "simulator.js",
  "store.js",
  "style.css",
  "taxes.js",
  "ui.js",
  "universe.js",
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url);
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); c.put(req, r.clone()); return r; }));
    return;
  }
  if (url.origin !== location.origin) return; // datos de mercado: siempre de la red
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || (req.mode === 'navigate' ? c.match('./') : undefined));
    return hit || net;
  }));
});
