// Capa de datos: elige la mejor fuente para cada cosa y guarda en caché.
// Servidor propio (Cloudflare) → Yahoo Finanzas para todo el mundo, RSS de noticias en español, avisos.
// Finnhub → EE. UU. en directo, noticias, analistas, resultados.  Twelve Data → gráficas de EE. UU., divisas y bitcoin.
// Alpha Vantage → tono de las noticias.  Binance → bitcoin en directo.  BCE (Frankfurter) → cambio de divisas.
import { store } from './store.js';
import { info, isUS, isBTC, UNIVERSE } from './universe.js';
import * as D from './demo.js';
import { sentiment } from './sentiment.js';

const S = () => store.s;
const now = () => Date.now();
const mem = new Map(); // caché en memoria: clave → {t, v}
function cached(k, ttl, fn) {
  const e = mem.get(k); if (e && now() - e.t < ttl) return e.v instanceof Promise ? e.v : Promise.resolve(e.v);
  const p = fn().then((v) => { mem.set(k, { t: now(), v }); return v; }).catch((err) => { mem.delete(k); if (e) return e.v; throw err; });
  mem.set(k, { t: e?.t ?? 0, v: p }); return p;
}
function persist(k, v) { try { localStorage.setItem('sbc:' + k, JSON.stringify({ t: now(), v })); } catch {} }
function restore(k, maxAge = 864e5 * 3) { try { const o = JSON.parse(localStorage.getItem('sbc:' + k)); return o && now() - o.t < maxAge ? o.v : null; } catch { return null; } }
async function get(url, opt = {}, ms = 9000) {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: c.signal }); if (!r.ok) throw new Error(r.status + ' ' + url.split('?')[0]); return opt.text ? r.text() : r.json(); } finally { clearTimeout(tm); }
}

export const status = { worker: false, fh: false, td: false, av: false, demo: true, errors: [], lastOk: 0 };
const W = () => (S().worker || window.SB_CONFIG?.worker || '').replace(/\/$/, '');
const wget = (path, ms) => get(W() + path, { headers: S().token ? { Authorization: 'Bearer ' + S().token } : {} }, ms);
const FHK = () => S().keys.finnhub, TDK = () => S().keys.twelve, AVK = () => S().keys.alpha;
const fh = (path) => get('https://finnhub.io/api/v1' + path, { headers: { 'X-Finnhub-Token': FHK() } });
const td = (path) => get('https://api.twelvedata.com' + path + (path.includes('?') ? '&' : '?') + 'apikey=' + TDK());
export function refreshStatus() {
  status.worker = !!W(); status.fh = !!FHK(); status.td = !!TDK(); status.av = !!AVK();
  status.demo = !status.worker && !status.fh && !status.td;
  return status;
}
refreshStatus(); store.on(refreshStatus);
function err(where, e) { status.errors.unshift({ t: now(), where, msg: String(e?.message || e) }); status.errors.length = Math.min(status.errors.length, 20); }

/* ------------------------- emparejar con el servidor ------------------------- */
export async function claim(url, code) {
  url = url.replace(/\/$/, '');
  const r = await get(url + '/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code || '' }) });
  if (!r.token) throw new Error(r.error || 'claim');
  store.set({ worker: url, token: r.token }); refreshStatus(); syncServer(); return r;
}
export const serverInfo = (url) => get((url || W()).replace(/\/$/, '') + '/', {}, 8000);
export const pairCode = () => wget('/paircode');
export async function testKeys() {
  const out = {};
  out.finnhub = FHK() ? await fh('/quote?symbol=AAPL').then((r) => (r.c ? 'ok' : 'error')).catch((e) => String(e.message)) : 'none';
  out.twelve = TDK() ? await td('/quote?symbol=EUR/USD').then((r) => (r.close ? 'ok' : r.message || 'error')).catch((e) => String(e.message)) : 'none';
  out.server = W() ? await serverInfo().then((r) => (r.app === 'senorbakBolsa' ? 'ok' : 'old')).catch((e) => String(e.message)) : 'none';
  return out;
}
let syncT = 0;
export function syncServer() {
  clearTimeout(syncT);
  syncT = setTimeout(async () => {
    if (!W() || !S().token) return;
    const s = S();
    try { await get(W() + '/sync', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + s.token }, body: JSON.stringify({ positions: s.positions.map((p) => ({ id: p.id, s: p.s, n: p.n, cur: p.cur, qty: p.qty, price: p.price, date: p.date, stop: p.stop, target: p.target, trail: p.trail })), alerts: s.alerts, events: (s.events || []).slice(0, 80), prefs: s.prefs, lang: s.lang, topic: s.topic, appUrl: location.origin + location.pathname }) }); status.synced = now(); }
    catch (e) { err('sync', e); }
  }, 1200);
}
export const serverNotifs = () => (W() && S().token ? wget('/notifs').catch(() => []) : Promise.resolve([]));
export const testNotify = () => get(W() + '/test', { method: 'POST', headers: { Authorization: 'Bearer ' + S().token } });

/* ------------------------- cambio de divisas a euros ------------------------- */
let fx = restore('fx', 864e5 * 10) || { USD: 0.893, GBP: 1.147, CHF: 1.077, JPY: 0.00583, HKD: 0.115, DKK: 0.134, SEK: 0.091, NOK: 0.087, KRW: 0.00064, CNY: 0.125, TWD: 0.0278, CAD: 0.64, AUD: 0.58 };
export async function loadFx() {
  try {
    const r = await cached('fx', 36e5, () => get('https://api.frankfurter.dev/v1/latest?base=EUR'));
    const o = {}; for (const [c, v] of Object.entries(r.rates)) o[c] = 1 / v; fx = { ...fx, ...o }; persist('fx', fx);
  } catch (e) { err('fx', e); }
  return fx;
}
export function toEUR(v, cur) { if (v == null) return null; if (!cur || cur === 'EUR') return v; if (cur === 'GBp') return (v / 100) * (fx.GBP || 1.15); return v * (fx[cur] ?? 1); }
export const rate = (cur) => toEUR(1, cur);

/* ------------------------------- cotizaciones ------------------------------- */
const quotes = new Map(); // s → quote
export const lastQuote = (s) => quotes.get(s);
const qSubs = new Set();
export const onQuote = (f) => { qSubs.add(f); return () => qSubs.delete(f); };
function putQuote(q) { const old = quotes.get(q.s); const m = { ...old, ...q }; if (m.prev && m.price != null) { m.chg = m.price - m.prev; m.pct = (m.price / m.prev - 1) * 100; } quotes.set(q.s, m); qSubs.forEach((f) => f(m, old)); return m; }

async function btcQuote(s) {
  const pair = s === 'BTC-USD' ? 'BTCUSDT' : 'BTCEUR';
  try {
    const r = await get('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + pair, {}, 6000);
    return { s, price: +r.lastPrice, prev: +r.prevClosePrice || +r.openPrice, open: +r.openPrice, high: +r.highPrice, low: +r.lowPrice, volume: +r.volume, cur: s === 'BTC-USD' ? 'USD' : 'EUR', name: 'Bitcoin', t: now(), src: 'Binance' };
  } catch (e) {
    const prod = s === 'BTC-USD' ? 'BTC-USD' : 'BTC-EUR';
    const [t, st] = await Promise.all([get('https://api.exchange.coinbase.com/products/' + prod + '/ticker'), get('https://api.exchange.coinbase.com/products/' + prod + '/stats')]);
    return { s, price: +t.price, prev: +st.open, open: +st.open, high: +st.high, low: +st.low, volume: +st.volume, cur: s === 'BTC-USD' ? 'USD' : 'EUR', name: 'Bitcoin', t: now(), src: 'Coinbase' };
  }
}
async function fhQuote(s) {
  const r = await fh('/quote?symbol=' + encodeURIComponent(s.replace('-', '.')));
  if (!r || !r.c) throw new Error('sin datos');
  return { s, price: r.c, prev: r.pc, open: r.o, high: r.h, low: r.l, cur: 'USD', t: r.t * 1000, src: 'Finnhub' };
}
export async function getQuotes(list) {
  list = [...new Set(list)].filter(Boolean);
  if (refreshStatus().demo) return list.map((s) => putQuote(D.quote(s)));
  const out = []; const rest = [];
  const btc = list.filter(isBTC);
  await Promise.all(btc.map(async (s) => { try { out.push(putQuote(await cached('q:' + s, 4000, () => btcQuote(s)))); } catch (e) { err('btc', e); } }));
  const others = list.filter((s) => !isBTC(s));
  if (W() && others.length) {
    for (let i = 0; i < others.length; i += 40) {
      const chunk = others.slice(i, i + 40);
      try {
        const r = await cached('wq:' + chunk.join(','), 12000, () => wget('/q?s=' + encodeURIComponent(chunk.join(',')), 15000));
        for (const q of r) if (q && q.price != null) out.push(putQuote({ ...q, t: q.t || now() }));
        const got = new Set(r.filter((q) => q && q.price != null).map((q) => q.s)); chunk.forEach((s) => got.has(s) || rest.push(s));
        status.lastOk = now();
      } catch (e) { err('worker /q', e); rest.push(...chunk); }
    }
  } else rest.push(...others);
  if (FHK()) await Promise.all(rest.filter(isUS).slice(0, 30).map(async (s) => { try { out.push(putQuote(await cached('fq:' + s, 10000, () => fhQuote(s)))); } catch (e) { err('finnhub quote', e); } }));
  return out;
}

/* --------------------------------- gráficas --------------------------------- */
// rangos: 1D 1W 1M 3M 1Y 5Y MAX y 'A' (diario 5 años para el análisis)
const YR = { '1D': ['1d', '5m'], '1W': ['5d', '30m'], '1M': ['1mo', '1h'], '3M': ['3mo', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'], MAX: ['max', '1mo'], A: ['5y', '1d'], B: ['2y', '1d'] };
const TTL = { '1D': 60e3, '1W': 3e5, '1M': 6e5, '3M': 36e5, '1Y': 36e5, '5Y': 864e5, MAX: 864e5, A: 36e5 * 3, B: 36e5 * 3 };
export function candles(s, range = '1M') {
  return cached('c:' + s + ':' + range, TTL[range], async () => {
    if (refreshStatus().demo) return demoCandles(s, range);
    let v = null;
    if (isBTC(s)) { try { v = await btcCandles(s, range); } catch (e) { err('btc velas', e); } }
    if (!v && W()) { try { const [rg, iv] = YR[range]; v = await wget(`/c?s=${encodeURIComponent(s)}&range=${rg}&interval=${iv}`, 15000); if (v?.candles) v = v.candles; } catch (e) { err('worker /c', e); } }
    if ((!v || !v.length) && TDK() && (isUS(s) || info(s).t === 'fx' || isBTC(s))) { try { v = await tdCandles(s, range); } catch (e) { err('twelvedata', e); } }
    if (!v || !v.length) { const old = restore('c:' + s + ':' + range, 864e5 * 30); if (old) return old; throw new Error('nodata'); }
    v = v.filter((k) => k.close != null && isFinite(k.close));
    if (range === 'A' || range === '1Y') persist('c:' + s + ':' + range, v);
    return v;
  });
}
function demoCandles(s, range) {
  const d = D.daily(s);
  if (range === '1D') return D.intraday(s, 1, 5);
  if (range === '1W') return D.intraday(s, 5, 30);
  if (range === '1M') return D.intraday(s, 22, 60);
  const n = { '3M': 66, '1Y': 252, A: 1260, B: 504, '5Y': 1260, MAX: 1560 }[range];
  let out = d.slice(-n).map((k) => ({ ...k })); out[out.length - 1].close = D.live(s);
  if (range === '5Y' || range === 'MAX') { const w = []; for (let i = 0; i < out.length; i += 5) { const g = out.slice(i, i + 5); w.push({ time: g[0].time, open: g[0].open, high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)), close: g[g.length - 1].close, volume: g.reduce((a, x) => a + x.volume, 0) }); } out = w; }
  return out;
}
async function btcCandles(s, range) {
  const pair = s === 'BTC-USD' ? 'BTCUSDT' : 'BTCEUR';
  const m = { '1D': ['5m', 288], '1W': ['30m', 336], '1M': ['2h', 360], '3M': ['1d', 92], '1Y': ['1d', 366], A: ['1d', 1000], B: ['1d', 730], '5Y': ['1w', 261], MAX: ['1M', 120] }[range];
  const r = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${m[0]}&limit=${m[1]}`);
  return r.map((k) => ({ time: k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}
async function tdCandles(s, range) {
  const sym = isBTC(s) ? (s === 'BTC-USD' ? 'BTC/USD' : 'BTC/EUR') : info(s).t === 'fx' ? s.slice(0, 3) + '/' + s.slice(3, 6) : s.replace('-', '.');
  const m = { '1D': ['5min', 100], '1W': ['30min', 70], '1M': ['1h', 170], '3M': ['1day', 66], '1Y': ['1day', 252], A: ['1day', 1260], B: ['1day', 504], '5Y': ['1week', 261], MAX: ['1month', 300] }[range];
  const r = await td(`/time_series?symbol=${encodeURIComponent(sym)}&interval=${m[0]}&outputsize=${m[1]}&order=ASC&timezone=UTC`);
  if (r.status === 'error') throw new Error(r.message);
  return r.values.map((v) => ({ time: Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +(v.volume || 0) }));
}
// Precio de cierre en una fecha (para el marcador de aciertos y la cartera)
export async function closeOn(s, ts) {
  const k = await candles(s, 'A').catch(() => null); if (!k?.length) return null;
  const t = ts / 1000; let best = null; for (const c of k) { if (c.time <= t + 86400) best = c.close; else break; } return best;
}

/* -------------------------------- buscador -------------------------------- */
export async function search(q) {
  q = q.trim(); if (!q) return [];
  const low = q.toLowerCase();
  const local = UNIVERSE.filter((u) => u.s.toLowerCase().includes(low) || u.n.toLowerCase().includes(low)).slice(0, 12).map((u) => ({ s: u.s, n: u.n, ex: u.g, t: u.t }));
  let remote = [];
  if (W() && !status.demo) { try { remote = await cached('s:' + low, 6e5, () => wget('/s?q=' + encodeURIComponent(q))); } catch (e) { err('buscar', e); } }
  if (!remote.length && FHK()) { try { const r = await cached('fs:' + low, 6e5, () => fh('/search?q=' + encodeURIComponent(q))); remote = (r.result || []).slice(0, 15).map((x) => ({ s: x.symbol.replace('.', '-'), n: x.description, ex: x.type, t: 'stock' })); } catch (e) { err('buscar finnhub', e); } }
  const seen = new Set(local.map((x) => x.s));
  // De las criptomonedas, solo bitcoin
  return local.concat(remote.filter((x) => !(x.t === 'crypto' || /-(USD|EUR|USDT)$/.test(x.s)) || /^BTC-(EUR|USD)$/.test(x.s)).filter((x) => !seen.has(x.s) && seen.add(x.s)));
}

/* ------------------------------- fundamentales ------------------------------ */
export function fundamentals(s) {
  return cached('f:' + s, 36e5 * 6, async () => {
    const o = {};
    if (status.demo) { const q = D.quote(s); return { pe: q.pe, dy: q.dy, mcap: q.mcap, w52h: q.w52h, w52l: q.w52l, beta: 1.1, eps: q.price / (q.pe || 20), demo: true }; }
    if (W()) { try { Object.assign(o, await wget('/f?s=' + encodeURIComponent(s))); } catch (e) { err('worker /f', e); } }
    if (FHK() && isUS(s)) {
      try {
        const [m, p] = await Promise.all([fh('/stock/metric?metric=all&symbol=' + s.replace('-', '.')), fh('/stock/profile2?symbol=' + s.replace('-', '.'))]);
        const x = m.metric || {};
        Object.assign(o, { pe: x.peTTM ?? x.peBasicExclExtraTTM ?? o.pe, eps: x.epsTTM ?? o.eps, dy: x.dividendYieldIndicatedAnnual ?? o.dy, beta: x.beta ?? o.beta, w52h: x['52WeekHigh'] ?? o.w52h, w52l: x['52WeekLow'] ?? o.w52l, mcap: p.marketCapitalization ? p.marketCapitalization * 1e6 : o.mcap, name: p.name || o.name, logo: p.logo, industry: p.finnhubIndustry || o.industry, web: p.weburl || o.web, roe: x.roeTTM, margin: x.netProfitMarginTTM, rev: x.revenueGrowthTTMYoy });
      } catch (e) { err('finnhub fundamentales', e); }
    }
    return o;
  });
}
export function analysts(s) {
  return cached('a:' + s, 36e5 * 12, async () => {
    if (status.demo) return info(s).t === 'stock' ? D.analyst(s) : null;
    if (FHK() && isUS(s)) { const r = await fh('/stock/recommendation?symbol=' + s.replace('-', '.')); return r[0] || null; }
    return null;
  }).catch(() => null);
}

/* -------------------------------- noticias -------------------------------- */
const NAME_RX = () => {
  const list = [...UNIVERSE.filter((u) => u.t === 'stock' || u.t === 'crypto' || u.t === 'cmd'), ...S().positions.map((p) => ({ s: p.s, n: p.n }))];
  return list.map((u) => ({ s: u.s, rx: new RegExp('\\b(' + [u.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s*\(.*\)/, ''), isUS(u.s) && u.s.length > 2 ? u.s : null].filter(Boolean).join('|') + ')\\b', 'i') }));
};
let rxCache = null, rxKey = '';
function tagSyms(text) { const k = S().positions.length; if (!rxCache || rxKey !== k) { rxCache = NAME_RX(); rxKey = k; } const out = []; for (const r of rxCache) if (r.rx.test(text)) out.push(r.s); if (/\bbitcoin|\bBTC\b/i.test(text) && !out.includes('BTC-EUR')) out.push('BTC-EUR'); return out.slice(0, 4); }
export function news(force) {
  return cached('news', force ? 0 : 9e4, async () => {
    if (status.demo) return D.news();
    const items = []; const s = S(); const jobs = [];
    if (FHK()) {
      jobs.push(fh('/news?category=general').then((r) => r.slice(0, 40).forEach((x) => items.push({ id: 'fh' + x.id, t: x.datetime * 1000, title: x.headline, sum: x.summary, url: x.url, src: x.source, img: x.image, lang: 'en' }))).catch((e) => err('noticias finnhub', e)));
      const usSyms = [...new Set([...s.positions.map((p) => p.s), ...s.watch])].filter(isUS).slice(0, 8);
      const from = new Date(now() - 3 * 864e5).toISOString().slice(0, 10), to = new Date().toISOString().slice(0, 10);
      for (const sym of usSyms) jobs.push(cached('cn:' + sym, 6e5, () => fh(`/company-news?symbol=${sym}&from=${from}&to=${to}`)).then((r) => r.slice(0, 6).forEach((x) => items.push({ id: 'fh' + x.id, t: x.datetime * 1000, title: x.headline, sum: x.summary, url: x.url, src: x.source, img: x.image, lang: 'en', syms: [sym] }))).catch(() => {}));
    }
    if (W()) {
      const other = [...new Set([...s.positions.map((p) => p.s), ...s.watch])].filter((x) => !isUS(x) && !isBTC(x)).slice(0, 10);
      jobs.push(wget('/n?syms=' + encodeURIComponent(other.join(',')), 15000).then((r) => r.forEach((x) => items.push(x))).catch((e) => err('worker /n', e)));
    }
    await Promise.all(jobs);
    // Tono de las noticias: el del servidor si lo trae, si no, diccionario propio (el de Alpha Vantage ahora es de pago)
    const av = new Map();
    const seen = new Set(); const out = [];
    for (const it of items.sort((a, b) => b.t - a.t)) {
      const key = (it.title || '').toLowerCase().slice(0, 60); if (!it.title || seen.has(key)) continue; seen.add(key);
      const a = av.get(it.url) || av.get(key);
      if (it.sent != null) it.sentSrc = it.sentSrc || 'srv'; else if (a != null) { it.sent = a; it.sentSrc = 'av'; } else { it.sent = sentiment(it.title + ' ' + (it.sum || ''), it.lang); it.sentSrc = 'lex'; }
      it.syms = [...new Set([...(it.syms || []), ...tagSyms(it.title + ' ' + (it.sum || '').slice(0, 300))])];
      out.push(it);
    }
    persist('news', out.slice(0, 120));
    return out.slice(0, 150);
  }).catch(() => restore('news', 864e5 * 2) || []);
}
// Tono medio de las noticias de un valor en las últimas 48 h
export async function newsTone(s) {
  const n = await news().catch(() => []); const rel = n.filter((x) => x.syms?.includes(s) && now() - x.t < 48 * 36e5);
  if (!rel.length) return { tone: null, n: 0 };
  return { tone: rel.reduce((a, x) => a + (x.sent || 0), 0) / rel.length, n: rel.length };
}

/* ------------------------------- calendario ------------------------------- */
export function earnings() {
  return cached('earn', 36e5 * 6, async () => {
    if (status.demo || !FHK()) return [];
    const from = new Date().toISOString().slice(0, 10), to = new Date(now() + 35 * 864e5).toISOString().slice(0, 10);
    const r = await fh(`/calendar/earnings?from=${from}&to=${to}`);
    const want = new Set([...UNIVERSE.filter((u) => u.g === 'us').map((u) => u.s.replace('-', '.')), ...S().positions.map((p) => p.s), ...S().watch]);
    return (r.earningsCalendar || []).filter((e) => want.has(e.symbol)).map((e) => ({ s: e.symbol.replace('.', '-'), d: e.date, hour: e.hour, eps: e.epsEstimate, q: e.quarter, y: e.year }));
  }).catch(() => []);
}
export function events(s) { return W() && !status.demo ? cached('ev:' + s, 36e5 * 12, () => wget('/e?s=' + encodeURIComponent(s))).catch(() => null) : Promise.resolve(null); }
export function fearGreed() {
  return cached('fg', 36e5, async () => {
    if (W() && !status.demo) { try { return await wget('/fg', 20000); } catch (e) { err('worker /fg', e); } }
    return null;
  });
}

/* ------------------------------ precios en directo ------------------------------ */
// Bitcoin: Binance por WebSocket. EE. UU.: Finnhub por WebSocket. Resto: consulta cada 15 s al servidor.
const watchers = new Map(); // s → Set(cb)
let fhWS = null, fhSubs = new Set(), bnWS = null, poll = 0, demoT = 0;
export function watch(list, cb) {
  list = [...new Set(list)];
  for (const s of list) { if (!watchers.has(s)) watchers.set(s, new Set()); watchers.get(s).add(cb); }
  plan();
  return () => { for (const s of list) { watchers.get(s)?.delete(cb); if (!watchers.get(s)?.size) watchers.delete(s); } plan(); };
}
function emit(s, p, extra) {
  const q = lastQuote(s) || { s };
  const m = putQuote({ ...q, s, price: p, t: now(), ...extra });
  watchers.get(s)?.forEach((f) => f(m));
}
function plan() {
  const syms = [...watchers.keys()];
  clearInterval(demoT); demoT = 0;
  if (status.demo) { if (syms.length) demoT = setInterval(() => syms.forEach((s) => { if (Math.random() < (isBTC(s) ? 0.9 : 0.35)) emit(s, D.tick(s)); }), 1100); return; }
  // Bitcoin
  const wantBTC = syms.filter(isBTC);
  if (wantBTC.length && !bnWS) openBinance(); else if (!wantBTC.length && bnWS) { bnWS.close(); bnWS = null; }
  // EE. UU. por Finnhub
  const us = syms.filter(isUS);
  if (FHK() && us.length) { openFinnhub(); const want = new Set(us.map((s) => s.replace('-', '.'))); for (const s of fhSubs) if (!want.has(s)) { fhSend({ type: 'unsubscribe', symbol: s }); fhSubs.delete(s); } for (const s of want) if (!fhSubs.has(s)) { fhSend({ type: 'subscribe', symbol: s }); fhSubs.add(s); } }
  // Resto por sondeo
  clearInterval(poll); poll = 0;
  const pollable = syms.filter((s) => !isBTC(s) && (!isUS(s) || !FHK()));
  if (pollable.length) { const f = () => document.visibilityState === 'visible' && getQuotes(pollable).then((qs) => qs.forEach((q) => watchers.get(q.s)?.forEach((cb) => cb(q)))).catch(() => {}); poll = setInterval(f, 15000); }
}
function openBinance() {
  try {
    bnWS = new WebSocket('wss://data-stream.binance.vision/stream?streams=btceur@miniTicker/btcusdt@miniTicker');
    let lastE = 0, lastU = 0;
    bnWS.onmessage = (ev) => {
      const d = JSON.parse(ev.data).data; if (!d) return; const s = d.s === 'BTCEUR' ? 'BTC-EUR' : 'BTC-USD'; const t = now();
      if ((s === 'BTC-EUR' ? t - lastE : t - lastU) < 900) return; if (s === 'BTC-EUR') lastE = t; else lastU = t;
      emit(s, +d.c, { open: +d.o, high: +d.h, low: +d.l, cur: s === 'BTC-EUR' ? 'EUR' : 'USD' });
    };
    bnWS.onclose = () => { bnWS = null; setTimeout(() => [...watchers.keys()].some(isBTC) && openBinance(), 4000); };
  } catch (e) { err('binance ws', e); }
}
let fhQueue = [];
function fhSend(m) { if (fhWS?.readyState === 1) fhWS.send(JSON.stringify(m)); else fhQueue.push(m); }
function openFinnhub() {
  if (fhWS) return;
  try {
    fhWS = new WebSocket('wss://ws.finnhub.io?token=' + FHK());
    fhWS.onopen = () => { fhQueue.forEach((m) => fhWS.send(JSON.stringify(m))); fhQueue = []; };
    const lastT = new Map();
    fhWS.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type !== 'trade') return; for (const tr of m.data) { const s = tr.s.replace('.', '-'); if (now() - (lastT.get(s) || 0) < 700) continue; lastT.set(s, now()); emit(s, tr.p); } };
    fhWS.onclose = () => { fhWS = null; const keep = [...fhSubs]; fhSubs = new Set(); setTimeout(() => { if ([...watchers.keys()].some(isUS)) { fhQueue = keep.map((s) => ({ type: 'subscribe', symbol: s })); keep.forEach((s) => fhSubs.add(s)); openFinnhub(); } }, 5000); };
  } catch (e) { err('finnhub ws', e); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') plan(); });

/* ------------------------- mini-gráficas en bloque ------------------------- */
export async function sparks(list, range = '1d') {
  list = [...new Set(list)].filter(Boolean); const out = {};
  if (status.demo) { for (const s of list) { const k = range === '1d' ? D.intraday(s, 1, 15) : D.daily(s).slice(-22); out[s] = { c: k.map((x) => x.close), prev: range === '1d' ? D.daily(s).slice(-2)[0].close : null }; } return out; }
  const btc = list.filter(isBTC);
  await Promise.all(btc.map(async (s) => { try { const k = await candles(s, range === '1d' ? '1D' : '1M'); out[s] = { c: k.map((x) => x.close), prev: k[0]?.open }; } catch {} }));
  const rest = list.filter((s) => !isBTC(s));
  if (W() && rest.length) {
    for (let i = 0; i < rest.length; i += 60) {
      const chunk = rest.slice(i, i + 60);
      try { Object.assign(out, await cached('sp:' + range + chunk.join(','), range === '1d' ? 6e4 : 18e5, () => wget(`/sp?s=${encodeURIComponent(chunk.join(','))}&range=${range}`, 15000))); }
      catch (e) { err('worker /sp', e); // servidor antiguo: una a una (solo unas pocas)
        await Promise.all(chunk.slice(0, 14).map(async (s) => { try { const k = await candles(s, range === '1d' ? '1D' : range === '1mo' ? '1M' : '1Y'); out[s] = { c: k.map((x) => x.close), prev: lastQuote(s)?.prev ?? null }; } catch {} })); }
    }
  }
  return out;
}
