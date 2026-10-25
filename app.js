// senorbakBolsa — arranque, navegación y marco de la app
import { store } from './store.js';
import { t, setLang, lang } from './i18n.js';
import { I, $, $$, toast } from './ui.js';
import * as D from './data.js';
import { setLocale } from './fmt.js';

const ROUTES = [
  [/^\/?$/, 'home', { tab: 'home' }],
  [/^\/a\/(.+)$/, 'asset', { back: true }],
  [/^\/cartera$/, 'portfolio', { tab: 'portfolio' }],
  [/^\/senales$/, 'signals', { tab: 'signals' }],
  [/^\/ia$/, 'ai', { tab: 'ai' }],
  [/^\/noticias$/, 'news', { tab: 'news' }],
  [/^\/mas$/, 'more', { tab: 'more' }],
  [/^\/bitcoin$/, 'asset', { back: true, fixed: 'BTC-EUR' }],
  [/^\/calendario$/, 'calendar', { back: true }],
  [/^\/alertas$/, 'alerts', { back: true }],
  [/^\/simulador$/, 'simulator', { back: true }],
  [/^\/filtros$/, 'screener', { back: true }],
  [/^\/comparar(?:\/(.+))?$/, 'compare', { back: true }],
  [/^\/brokers$/, 'brokers', { back: true }],
  [/^\/renta$/, 'taxes', { back: true }],
  [/^\/ajustes$/, 'settings', { back: true }],
  [/^\/buscar$/, 'search', { back: true }],
  [/^\/avisos$/, 'notifs', { back: true }],
  [/^\/marcador$/, 'scoreboard', { back: true }],
  [/^\/mapa$/, 'heatmap', { back: true }],
];
const view = $('#view'); let cleanup = null; let current = '';
export const app = { setTitle, refreshBadges };

function shell() {
  $('#nav').innerHTML = [['home', '#/', I.markets, 'tabMarkets'], ['portfolio', '#/cartera', I.wallet, 'tabPortfolio'], ['ai', '#/ia', I.spark, 'tabAI'], ['signals', '#/senales', I.signal, 'tabSignals'], ['news', '#/noticias', I.news, 'tabNews'], ['more', '#/mas', I.more, 'tabMore']]
    .map(([k, h, ic, l]) => k === 'ai' ? `<a href="${h}" data-tab="${k}" class="ai-tab"><span class="orbmini">${ic}</span><span>${t(l)}</span></a>` : `<a href="${h}" data-tab="${k}">${ic}<span>${t(l)}</span></a>`).join('');
}
function setTitle(title, { back } = {}) {
  const top = $('#top');
  top.innerHTML = back
    ? `<button class="back ib" aria-label="${t('back')}" id="bk">${I.back}</button><div class="ttl">${title || ''}</div><div class="sp"></div><a class="ib" href="#/buscar" aria-label="${t('search')}">${I.search}</a>`
    : `<div class="brand"><span class="w">senorbak</span><span class="b">${t('bolsa')}</span></div><div class="sp"></div><a class="ib" href="#/buscar" aria-label="${t('search')}">${I.search}</a><a class="ib" href="#/avisos" aria-label="${t('notifs')}" id="bell">${I.bell}</a>`;
  const bk = $('#bk'); if (bk) bk.onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
  refreshBadges();
}
let lastNotifs = [];
async function refreshBadges() {
  const bell = $('#bell'); if (!bell) return;
  const unseen = lastNotifs.filter((n) => n.t > store.s.seen.notifs).length;
  bell.querySelector('.dot')?.remove(); if (unseen) bell.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
}
async function pollNotifs() {
  try { const n = await D.serverNotifs(); if (Array.isArray(n)) { const fresh = n.filter((x) => x.t > (lastNotifs[0]?.t || Date.now() - 6e5)); lastNotifs = n; app.notifs = n; refreshBadges(); if (fresh.length && document.visibilityState === 'visible' && lastNotifs.length) fresh.slice(0, 2).forEach((x) => toast(`<b>${x.title}</b>${x.msg ? '<br><span class="muted small">' + x.msg + '</span>' : ''}`, 5000)); } } catch {}
}
async function route() {
  const h = location.hash.replace(/^#/, '') || '/'; const path = h.split('?')[0];
  if (path === current && !route.force) return; current = path; route.force = false;
  let m, r; for (const x of ROUTES) { m = path.match(x[0]); if (m) { r = x; break; } }
  if (!r) { location.hash = '#/'; return; }
  try { cleanup?.(); } catch {} cleanup = null;
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r[2].tab));
  setTitle('', { back: r[2].back });
  view.innerHTML = ''; view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  window.scrollTo(0, 0);
  try {
    const mod = await import(`./${({ signals: 'senales', ai: 'asistente' })[r[1]] || r[1]}.js`);
    const param = r[2].fixed || (m[1] ? decodeURIComponent(m[1]) : null);
    cleanup = (await mod.render(view, param, { app, query: new URLSearchParams(h.split('?')[1] || '') })) || null;
  } catch (e) { console.error(e); view.innerHTML = `<div class="empty"><b>${t('errPage')}</b><p class="muted small">${String(e.message || e)}</p></div>`; }
}
export function go(hash) { if (location.hash === hash) { route.force = true; route(); } else location.hash = hash; }
window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 4), { passive: true });
store.on(() => { D.syncServer(); });

async function boot() {
  setLang(store.s.lang); setLocale(store.s.lang); document.documentElement.lang = store.s.lang;
  if (!store.s.topic) store.set({ topic: 'sbolsa-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('') });
  if (!store.s.worker && window.SB_CONFIG?.worker) store.set({ worker: window.SB_CONFIG.worker });
  shell(); D.refreshStatus(); D.loadFx();
  if (store.s.token) D.syncServer();
  route();
  pollNotifs(); setInterval(pollNotifs, 60000);
  setTimeout(() => { if (store.s.evDay !== new Date().toISOString().slice(0, 10)) import('./calendar.js').then((m) => m.refreshEvents()).catch(() => {}); }, 6000);
  if ('serviceWorker' in navigator && isSecureContext) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
    // Cuando llega una versión nueva de la app, recarga una vez para usarla
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !sessionStorage.getItem('sbReloaded')) { sessionStorage.setItem('sbReloaded', '1'); location.reload(); } });
  }
  window.app = app; app.ready = true;
}
app.rerender = () => { shell(); route.force = true; route(); };
boot();
