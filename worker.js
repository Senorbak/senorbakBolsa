/* ===================== senorbakBolsa · servidor (Cloudflare Worker) =====================
   - Trae cotizaciones, gráficas, buscador y datos de empresas de Yahoo Finanzas (todas las bolsas).
   - Junta noticias en español (RSS) y de cada valor.
   - Calcula un índice propio de miedo/codicia.
   - Vigila tu cartera cada pocos minutos y te avisa al móvil con ntfy.
   Necesita: un espacio KV enlazado con el nombre STATE y un disparador cron cada 2 minutos.
   Opcional: Workers AI enlazado con el nombre AI (IA de reserva gratuita). */
const VERSION = '1.1.0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const Y1 = 'https://query1.finance.yahoo.com', Y2 = 'https://query2.finance.yahoo.com';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '86400' };
const json = (o, st = 200, extra = {}) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------- indicadores (compartidos con la app) ----------------------- */
// Indicadores técnicos (funciones puras; también las usa el servidor de Cloudflare)
function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
function ema(a, n) { const o = new Array(a.length).fill(null); const k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++) { if (i < n - 1) continue; if (e === null) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
function rsi(a, n = 14) {
  const o = new Array(a.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < a.length; i++) {
    const d = a[i] - a[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return o;
}
function macd(a, f = 12, s = 26, sig = 9) {
  const ef = ema(a, f), es = ema(a, s); const m = a.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const first = m.findIndex((x) => x != null); const sg = new Array(a.length).fill(null);
  if (first >= 0) { const e = ema(m.slice(first), sig); for (let i = 0; i < e.length; i++) sg[first + i] = e[i]; }
  return { macd: m, signal: sg, hist: m.map((x, i) => (x != null && sg[i] != null ? x - sg[i] : null)) };
}
function bollinger(a, n = 20, k = 2) {
  const m = sma(a, n); const up = [], lo = [];
  for (let i = 0; i < a.length; i++) { if (m[i] == null) { up.push(null); lo.push(null); continue; } let v = 0; for (let j = i - n + 1; j <= i; j++) v += (a[j] - m[i]) ** 2; const sd = Math.sqrt(v / n); up.push(m[i] + k * sd); lo.push(m[i] - k * sd); }
  return { mid: m, up, lo };
}
function stdev(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }
function returns(a) { const r = []; for (let i = 1; i < a.length; i++) r.push(a[i] / a[i - 1] - 1); return r; }
function volatility(a, n = 20) { const r = returns(a.slice(-n - 1)); return r.length > 2 ? stdev(r) * Math.sqrt(252) : null; }
function atr(h, l, c, n = 14) { const tr = c.map((x, i) => (i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])))); return sma(tr, n); }
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

/* ---- Puntuación técnica en el día i (solo con datos hasta ese día) ----
   Devuelve factores en [-1, 1] para corto plazo (días-semanas) y largo plazo (meses). */
function prep(closes, vols) {
  return { c: closes, v: vols || null, s20: sma(closes, 20), s50: sma(closes, 50), s200: sma(closes, 200), e20: ema(closes, 20), r: rsi(closes, 14), m: macd(closes), b: bollinger(closes, 20, 2), v20: vols ? sma(vols, 20) : null };
}
function factorsAt(P, i) {
  const c = P.c, p = c[i]; if (i < 30) return null;
  const S = [], Lf = [];
  // RSI: sobreventa/sobrecompra
  const r = P.r[i];
  if (r != null) S.push(['rsi', r < 30 ? clamp((30 - r) / 15 + 0.3) : r > 70 ? -clamp((r - 70) / 15 + 0.3) : (50 - r) / 100, r]);
  // MACD: dirección del histograma y cruce
  const h = P.m.hist[i], h1 = P.m.hist[i - 1];
  if (h != null && h1 != null) { const scale = p * 0.01; let f = clamp(h / scale); if (h > 0 && h1 <= 0) f = Math.max(f, 0.7); if (h < 0 && h1 >= 0) f = Math.min(f, -0.7); S.push(['macd', f, h]); }
  // Bandas de Bollinger: posición dentro de las bandas (rebote)
  const up = P.b.up[i], lo = P.b.lo[i];
  if (up != null && up > lo) { const pb = (p - lo) / (up - lo); S.push(['bb', pb < 0.05 ? 0.6 : pb > 0.95 ? -0.6 : (0.5 - pb) * 0.6, pb]); }
  // Tendencia corta: precio frente a la media de 20 sesiones y su pendiente
  const e = P.e20[i], e5 = P.e20[i - 5];
  if (e != null && e5 != null) S.push(['trend20', clamp(((p - e) / e) * 12 + ((e - e5) / e5) * 25), (p - e) / e]);
  // Impulso de 5 días
  S.push(['mom5', clamp((p / c[i - 5] - 1) * 8), p / c[i - 5] - 1]);
  // Volumen anómalo en la dirección del día
  if (P.v && P.v20 && P.v20[i]) { const vr = P.v[i] / P.v20[i]; if (vr > 1.8) S.push(['vol', clamp((c[i] > c[i - 1] ? 1 : -1) * (vr - 1) * 0.35), vr]); }
  // Largo plazo
  const s50 = P.s50[i], s200 = P.s200[i];
  if (s200 != null) { Lf.push(['ma200', clamp(((p - s200) / s200) * 5), (p - s200) / s200]); Lf.push(['cross', s50 > s200 ? 0.5 : -0.5, s50 / s200 - 1]); const s200b = P.s200[i - 20]; if (s200b) Lf.push(['slope200', clamp(((s200 - s200b) / s200b) * 20), (s200 - s200b) / s200b]); }
  else if (s50 != null) Lf.push(['ma50', clamp(((p - s50) / s50) * 6), (p - s50) / s50]);
  if (i >= 252) { const m12 = c[i - 21] / c[i - 252] - 1; Lf.push(['mom12', clamp(m12 * 2.5), m12]); }
  else if (i >= 126) { const m6 = c[i - 10] / c[i - 126] - 1; Lf.push(['mom6', clamp(m6 * 3.5), m6]); }
  const look = Math.min(i, 252); let hi = 0; for (let j = i - look; j <= i; j++) hi = Math.max(hi, c[j]);
  const dd = p / hi - 1; Lf.push(['dd', dd > -0.05 ? 0.2 : dd < -0.35 ? -0.4 : dd * 0.8, dd]);
  if (r != null && r > 80) Lf.push(['hot', -0.3, r]);
  return { S, L: Lf };
}
const W = { rsi: 1.1, macd: 1.0, bb: 0.7, trend20: 1.0, mom5: 0.6, vol: 0.5, news: 0.8, ma200: 1.2, cross: 0.8, slope200: 0.8, ma50: 1.0, mom12: 1.1, mom6: 1.0, dd: 0.6, hot: 0.5, analyst: 1.2, value: 0.5 };
function combine(fs) { let s = 0, w = 0; for (const [k, v] of fs) { const ww = W[k] ?? 0.5; s += v * ww; w += ww; } return w ? Math.round((s / w) * 100) : 0; }
function label(score) { return score >= 40 ? 'sbuy' : score >= 15 ? 'buy' : score > -15 ? 'hold' : score > -40 ? 'sell' : 'ssell'; }

/* ---------------------------------- Yahoo ---------------------------------- */
async function yget(url, { ttl = 20, text = false, cookie } = {}) {
  const cache = caches.default; const key = new Request(url.replace(/&crumb=[^&]+/, ''), { method: 'GET' });
  if (ttl) { const hit = await cache.match(key); if (hit) return text ? hit.text() : hit.json(); }
  const h = { 'User-Agent': UA, Accept: text ? 'application/rss+xml, application/xml, text/xml, */*' : 'application/json', 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' };
  if (cookie) h.Cookie = cookie;
  let r = await fetch(url, { headers: h, cf: { cacheTtl: 0 } });
  if (r.status === 429 || r.status >= 500) { await sleep(400); r = await fetch(url.replace('query1.', 'query2.'), { headers: h }); }
  if (!r.ok) throw new Error('yahoo ' + r.status);
  const body = await r.text();
  if (ttl) await cache.put(key, new Response(body, { headers: { 'content-type': text ? 'text/xml' : 'application/json', 'Cache-Control': 'public, max-age=' + ttl } }));
  return text ? body : JSON.parse(body);
}
let crumbMem = null;
async function crumb(env) {
  if (crumbMem && Date.now() - crumbMem.t < 6 * 36e5) return crumbMem;
  try { const k = await env.STATE.get('ycrumb', 'json'); if (k && Date.now() - k.t < 20 * 36e5) return (crumbMem = k); } catch {}
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const sc = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).filter((c) => /^(A1|A3|B)=/.test(c)).join('; ');
    if (!sc) return null;
    const c = await fetch(Y2 + '/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: sc } });
    const cr = (await c.text()).trim(); if (!c.ok || !cr || cr.includes('<') || cr.length > 30) return null;
    crumbMem = { cookie: sc, crumb: cr, t: Date.now() }; await env.STATE.put('ycrumb', JSON.stringify(crumbMem)); return crumbMem;
  } catch { return null; }
}
const SUFCUR = { MC: 'EUR', DE: 'EUR', PA: 'EUR', AS: 'EUR', MI: 'EUR', BR: 'EUR', LS: 'EUR', L: 'GBp', SW: 'CHF', CO: 'DKK', ST: 'SEK', T: 'JPY', HK: 'HKD', KS: 'KRW', SS: 'CNY' };
const guessCur = (s) => (s.startsWith('BTC-') ? s.slice(4) : s.endsWith('=X') ? s.slice(3, 6) : s.endsWith('=F') ? 'USD' : s.startsWith('^') ? null : SUFCUR[s.split('.')[1]] || (s.includes('.') ? null : 'USD'));
function metaQuote(s, meta, closes) {
  const last = closes?.length ? closes.filter((x) => x != null).pop() : null;
  const price = meta.regularMarketPrice ?? last; const prev = meta.chartPreviousClose ?? meta.previousClose;
  return { s, price, prev, open: meta.regularMarketOpen ?? null, high: meta.regularMarketDayHigh ?? null, low: meta.regularMarketDayLow ?? null, volume: meta.regularMarketVolume ?? null, cur: meta.currency, name: meta.longName || meta.shortName || null, ex: meta.exchangeName, type: meta.instrumentType, w52h: meta.fiftyTwoWeekHigh ?? null, w52l: meta.fiftyTwoWeekLow ?? null, t: (meta.regularMarketTime || 0) * 1000, tz: meta.exchangeTimezoneName };
}
async function chart(s, range = '1d', interval = '5m', ttl) {
  const u = `${Y1}/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`;
  const j = await yget(u, { ttl: ttl ?? (interval.endsWith('m') ? 25 : interval === '1h' ? 120 : 1800) });
  const r = j?.chart?.result?.[0]; if (!r) throw new Error(j?.chart?.error?.description || 'sin datos');
  const q = r.indicators?.quote?.[0] || {}; const ts = r.timestamp || [];
  const candles = []; for (let i = 0; i < ts.length; i++) { const c = q.close?.[i]; if (c == null) continue; candles.push({ time: ts[i], open: q.open?.[i] ?? c, high: q.high?.[i] ?? c, low: q.low?.[i] ?? c, close: c, volume: q.volume?.[i] ?? 0 }); }
  return { meta: r.meta, candles, events: r.events || {} };
}
async function quotes(list, env) {
  list = [...new Set(list)].slice(0, 60); const out = new Map();
  // 1) cotización completa en bloque (necesita la "galleta" de Yahoo)
  const cr = await crumb(env);
  if (cr) {
    for (let i = 0; i < list.length; i += 50) {
      try {
        const j = await yget(`${Y2}/v7/finance/quote?symbols=${encodeURIComponent(list.slice(i, i + 50).join(','))}&crumb=${encodeURIComponent(cr.crumb)}`, { ttl: 15, cookie: cr.cookie });
        for (const q of j?.quoteResponse?.result || []) out.set(q.symbol, { s: q.symbol, price: q.regularMarketPrice, prev: q.regularMarketPreviousClose, open: q.regularMarketOpen, high: q.regularMarketDayHigh, low: q.regularMarketDayLow, volume: q.regularMarketVolume, cur: q.currency, name: q.longName || q.shortName, ex: q.fullExchangeName, mcap: q.marketCap ?? null, pe: q.trailingPE ?? null, eps: q.epsTrailingTwelveMonths ?? null, dy: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : q.dividendYield ?? null, w52h: q.fiftyTwoWeekHigh, w52l: q.fiftyTwoWeekLow, rating: q.averageAnalystRating ?? null, state: q.marketState, t: (q.regularMarketTime || 0) * 1000, delay: q.exchangeDataDelayedBy ?? null });
      } catch { crumbMem = null; }
    }
  }
  // 2) lo que falte: "spark" en bloques de 20
  let miss = list.filter((s) => !out.has(s));
  for (let i = 0; i < miss.length; i += 20) {
    try {
      const j = await yget(`${Y1}/v8/finance/spark?symbols=${encodeURIComponent(miss.slice(i, i + 20).join(','))}&range=1d&interval=5m`, { ttl: 20 });
      for (const [s, v] of Object.entries(j || {})) { if (!v || !v.close) continue; const cl = v.close.filter((x) => x != null); if (!cl.length) continue; out.set(s, { s, price: cl[cl.length - 1], prev: v.chartPreviousClose ?? v.previousClose, high: Math.max(...cl), low: Math.min(...cl), cur: guessCur(s), t: (v.timestamp?.[v.timestamp.length - 1] || 0) * 1000 }); }
    } catch {}
  }
  // 3) y si aún falta algo, la gráfica de cada uno
  miss = list.filter((s) => !out.has(s)).slice(0, 35);
  await Promise.all(miss.map(async (s) => { try { const c = await chart(s, '1d', '5m'); out.set(s, metaQuote(s, c.meta, c.candles.map((k) => k.close))); } catch {} }));
  return list.map((s) => out.get(s)).filter(Boolean);
}
async function fundamentals(s, env) {
  const o = {};
  try { const [q] = await quotes([s], env); Object.assign(o, q || {}); } catch {}
  const cr = await crumb(env);
  if (cr) {
    try {
      const j = await yget(`${Y2}/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents,recommendationTrend&crumb=${encodeURIComponent(cr.crumb)}`, { ttl: 6 * 3600, cookie: cr.cookie });
      const r = j?.quoteSummary?.result?.[0] || {}; const v = (x) => (x && typeof x === 'object' ? x.raw ?? null : x ?? null);
      const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, ap = r.assetProfile || {}, ce = r.calendarEvents || {};
      Object.assign(o, { pe: v(sd.trailingPE) ?? o.pe, fpe: v(sd.forwardPE), dy: v(sd.dividendYield) != null ? v(sd.dividendYield) * 100 : o.dy, beta: v(sd.beta) ?? v(ks.beta), mcap: v(sd.marketCap) ?? o.mcap, w52h: v(sd.fiftyTwoWeekHigh) ?? o.w52h, w52l: v(sd.fiftyTwoWeekLow) ?? o.w52l, eps: v(ks.trailingEps) ?? o.eps, pb: v(ks.priceToBook),
        target: v(fd.targetMeanPrice), targetHi: v(fd.targetHighPrice), targetLo: v(fd.targetLowPrice), nAnalysts: v(fd.numberOfAnalystOpinions), recKey: fd.recommendationKey || null, margin: v(fd.profitMargins) != null ? v(fd.profitMargins) * 100 : null, roe: v(fd.returnOnEquity) != null ? v(fd.returnOnEquity) * 100 : null, rev: v(fd.revenueGrowth) != null ? v(fd.revenueGrowth) * 100 : null, debtEq: v(fd.debtToEquity),
        industry: ap.industry || ap.sector || null, web: ap.website || null, about: (ap.longBusinessSummary || '').slice(0, 900) || null, employees: ap.fullTimeEmployees || null, country: ap.country || null,
        nextEarnings: v(ce.earnings?.earningsDate?.[0]) ? v(ce.earnings.earningsDate[0]) * 1000 : null, exDiv: v(ce.exDividendDate) ? v(ce.exDividendDate) * 1000 : null, divDate: v(ce.dividendDate) ? v(ce.dividendDate) * 1000 : null });
      const rt = r.recommendationTrend?.trend?.[0]; if (rt) o.analyst = { strongBuy: rt.strongBuy, buy: rt.buy, hold: rt.hold, sell: rt.sell, strongSell: rt.strongSell, period: rt.period };
    } catch {}
  }
  return o;
}
async function search(q) {
  const j = await yget(`${Y2}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&lang=es-ES&region=ES`, { ttl: 3600 });
  const T = { EQUITY: 'stock', ETF: 'etf', INDEX: 'index', CURRENCY: 'fx', FUTURE: 'cmd', CRYPTOCURRENCY: 'crypto', MUTUALFUND: 'fund' };
  return (j.quotes || []).filter((x) => x.symbol && T[x.quoteType]).map((x) => ({ s: x.symbol, n: x.longname || x.shortname || x.symbol, ex: x.exchDisp || x.exchange, t: T[x.quoteType] }));
}

/* --------------------------------- noticias --------------------------------- */
const FEEDS = [
  ['Expansión', 'https://e00-expansion.uecdn.es/rss/mercados.xml'],
  ['Cinco Días', 'https://feeds.elpais.com/mrss-s/list/ep/site/cincodias.elpais.com/section/mercados'],
  ['Expansión', 'https://e00-expansion.uecdn.es/rss/economia.xml'],
  ['Europa Press', 'https://www.europapress.es/rss/rss.aspx?ch=00136'],
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
];
const ent = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, ' ').trim();
function parseRSS(xml, src, lang, syms) {
  const out = []; const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  for (const it of items.slice(0, 25)) {
    const g = (t) => { const m = it.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? ent(m[1]) : ''; };
    const img = (it.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+url="([^"]+)"/) || [])[1] || null;
    const title = g('title'); if (!title) continue; const t = Date.parse(g('pubDate') || g('dc:date')) || Date.now();
    out.push({ id: src + ':' + (g('guid') || g('link')).slice(-60), t, title, sum: g('description').slice(0, 280), url: g('link'), src, img, lang, syms: syms || [] });
  }
  return out;
}
// La app puede mandar su propia lista de fuentes (así se cambian sin tocar el servidor), siempre de medios conocidos
const NEWS_HOSTS = /(^|\.)(expansion\.com|uecdn\.es|elpais\.com|eleconomista\.es|europapress\.es|bolsamania\.com|investing\.com|elconfidencial\.com|vozpopuli\.com|larazon\.es|abc\.es|elmundo\.es|rtve\.es|eitb\.eus|yahoo\.com|cnbc\.com|marketwatch\.com|nasdaq\.com|ft\.com|bloomberg\.com|reuters\.com|wsj\.com|coindesk\.com|cointelegraph\.com|feedburner\.com|google\.com)$/;
async function news(syms, custom, debug) {
  let list = FEEDS;
  if (custom) { const c = custom.split('|').map((x) => x.split('~')).filter(([n, u]) => { try { return n && NEWS_HOSTS.test(new URL(u).hostname); } catch { return false; } }).slice(0, 10); if (c.length) list = c; }
  const dbg = {};
  const jobs = list.map(([n, u]) => yget(u, { ttl: 300, text: true }).then((x) => { const r = parseRSS(x, n, /coindesk|cointelegraph|yahoo|cnbc|marketwatch|nasdaq/i.test(u) ? 'en' : 'es'); dbg[n] = r.length; return r; }).catch((e) => { dbg[n] = String(e.message || e); return []; }));
  if (syms.length) jobs.push(yget(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(syms.slice(0, 10).join(','))}&region=ES&lang=es-ES`, { ttl: 300, text: true }).then((x) => parseRSS(x, 'Yahoo Finanzas', 'en')).catch(() => []));
  const all = (await Promise.all(jobs)).flat(); const seen = new Set();
  if (debug) return dbg;
  return all.filter((x) => { const k = x.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.t - a.t).slice(0, 80);
}

/* ------------------------- índice propio de miedo y codicia ------------------------- */
const BREADTH = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'XOM', 'WMT', 'JNJ', 'PG', 'HD', 'KO', 'BAC', 'CVX', 'MRK', 'PEP', 'CSCO', 'MCD', 'DIS', 'CAT', 'IBM', 'GS', 'BA', 'NKE', 'INTC', 'PFE', 'T', 'UNH', 'ITX.MC', 'SAN.MC', 'IBE.MC', 'BBVA.MC', 'CABK.MC', 'FER.MC', 'AENA.MC', 'TEF.MC', 'REP.MC', 'AMS.MC'];
async function fearGreed() {
  const cache = caches.default; const key = new Request('https://sbolsa.local/fg'); const hit = await cache.match(key); if (hit) return hit.json();
  const [sp, vix, gold] = await Promise.all([chart('^GSPC', '1y', '1d'), chart('^VIX', '1y', '1d'), chart('GC=F', '3mo', '1d')]);
  const c = sp.candles.map((k) => k.close), v = vix.candles.map((k) => k.close), g = gold.candles.map((k) => k.close);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length; const clamp = (x) => Math.max(0, Math.min(100, x));
  const mom = clamp(50 + (c[c.length - 1] / avg(c.slice(-125)) - 1) * 600);
  const vx = clamp(50 - (v[v.length - 1] / avg(v.slice(-50)) - 1) * 180);
  const sh = clamp(50 + ((c[c.length - 1] / c[c.length - 21] - 1) - (g[g.length - 1] / g[g.length - 21] - 1)) * 500);
  let above = 0, n = 0, hi = 0, lo = 0;
  for (let i = 0; i < BREADTH.length; i += 20) {
    try { const j = await yget(`${Y1}/v8/finance/spark?symbols=${encodeURIComponent(BREADTH.slice(i, i + 20).join(','))}&range=1y&interval=1d`, { ttl: 3600 });
      for (const val of Object.values(j || {})) { const cl = (val?.close || []).filter((x) => x != null); if (cl.length < 60) continue; n++; const last = cl[cl.length - 1]; if (last > avg(cl.slice(-50))) above++; const mx = Math.max(...cl), mn = Math.min(...cl); if (last >= mx * 0.97) hi++; if (last <= mn * 1.03) lo++; } } catch {}
  }
  const br = n ? clamp((above / n) * 100) : 50; const st = n ? clamp(50 + ((hi - lo) / n) * 150) : 50;
  const parts = { momentum: Math.round(mom), volatility: Math.round(vx), safeHaven: Math.round(sh), breadth: Math.round(br), strength: Math.round(st) };
  const value = Math.round(avg(Object.values(parts)));
  const out = { value, parts, t: Date.now(), hist: c.slice(-60).map((x, i, a) => i) && null };
  await cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=3600' } }));
  return out;
}

/* ------------------------------ dispositivos ------------------------------ */
const rnd = (n = 32) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function authed(req, env) { const t = (req.headers.get('Authorization') || '').replace('Bearer ', ''); if (!t) return false; const dev = (await env.STATE.get('devices', 'json')) || []; return dev.includes(await sha(t)); }
async function addDevice(env) { const tok = rnd(24); const dev = (await env.STATE.get('devices', 'json')) || []; dev.push(await sha(tok)); await env.STATE.put('devices', JSON.stringify(dev.slice(-6))); return tok; }

/* ------------------------------- avisos (ntfy) ------------------------------- */
async function push(cfg, n) {
  const body = { topic: cfg.topic, title: n.title, message: n.msg, tags: n.tags || [], priority: n.prio || 3 };
  if (cfg.appUrl) body.click = cfg.appUrl + (n.s ? '#/a/' + encodeURIComponent(n.s) : '#/avisos');
  const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok;
}
const madrid = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, wd: p.weekday, m: +p.hour * 60 + +p.minute }; };
const exOf = (s) => { if (s.startsWith('BTC')) return 'BTC'; const suf = s.includes('.') ? s.split('.').pop() : ''; if (suf === 'MC' || s === '^IBEX') return 'MC'; if (['DE', 'PA', 'AS', 'MI', 'SW', 'CO', 'L'].includes(suf)) return 'EU'; if (['T', 'HK', 'SS', 'KS'].includes(suf)) return 'ASIA'; return 'US'; };
function openNow(ex, M) { if (ex === 'BTC') return true; if (M.wd === 'Sat' || M.wd === 'Sun') return false; const m = M.m; if (ex === 'MC' || ex === 'EU') return m >= 9 * 60 && m <= 17 * 60 + 40; if (ex === 'US') return m >= 15 * 60 + 25 && m <= 22 * 60 + 5; if (ex === 'ASIA') return m >= 60 || m <= 9 * 60; return false; }
const T = {
  es: { drop: (n, p) => `📉 ${n} cae ${p} hoy`, rise: (n, p) => `🚀 ${n} sube ${p} hoy`, fromBuyDown: (n, p) => `${n}: ${p} desde que compraste`, fromBuyUp: (n, p) => `${n}: ${p} desde que compraste`, stop: (n) => `🛑 Stop-loss alcanzado en ${n}`, target: (n) => `🎯 Objetivo alcanzado en ${n}`, trail: (n) => `🛑 ${n} ha caído desde su máximo (stop dinámico)`, now: 'Precio ahora', pos: 'Tu posición', alertAbove: (n, v) => `🔔 ${n} supera ${v}`, alertBelow: (n, v) => `🔔 ${n} baja de ${v}`, fc: (n, h, l) => `🔮 Previsión ${h}: ${n} pasa a ${l}`, short: 'a corto plazo', long: 'a largo plazo', labels: { sbuy: 'COMPRA FUERTE', buy: 'COMPRA', hold: 'MANTENER', sell: 'VENTA', ssell: 'VENTA FUERTE' }, sumOpen: '☀️ Apertura de tu cartera', sumClose: '🌙 Cierre de tu cartera', sumUS: '🇺🇸 Cierre de Wall Street', best: 'Mejor', worst: 'Peor', today: 'hoy', btc: (p, m) => `₿ Bitcoin ${p} en la última hora (${m})`, newsT: (n) => `📰 Noticia sobre ${n}`, test: '✅ Avisos de senorbakBolsa funcionando', testMsg: 'Así te llegarán las alertas de tu cartera.', why: 'Motivos' },
  eu: { drop: (n, p) => `📉 ${n} ${p} jaitsi da gaur`, rise: (n, p) => `🚀 ${n} ${p} igo da gaur`, fromBuyDown: (n, p) => `${n}: ${p} erosi zenuenetik`, fromBuyUp: (n, p) => `${n}: ${p} erosi zenuenetik`, stop: (n) => `🛑 Stop-loss-a iritsi da: ${n}`, target: (n) => `🎯 Helburua lortu da: ${n}`, trail: (n) => `🛑 ${n} bere maximotik jaitsi da (stop dinamikoa)`, now: 'Prezioa orain', pos: 'Zure posizioa', alertAbove: (n, v) => `🔔 ${n} ${v} gainetik`, alertBelow: (n, v) => `🔔 ${n} ${v} azpitik`, fc: (n, h, l) => `🔮 Aurreikuspena ${h}: ${n} → ${l}`, short: 'epe laburrean', long: 'epe luzean', labels: { sbuy: 'EROSKETA SENDOA', buy: 'EROSI', hold: 'MANTENDU', sell: 'SALDU', ssell: 'SALMENTA SENDOA' }, sumOpen: '☀️ Zure zorroaren irekiera', sumClose: '🌙 Zure zorroaren itxiera', sumUS: '🇺🇸 Wall Streeten itxiera', best: 'Onena', worst: 'Txarrena', today: 'gaur', btc: (p, m) => `₿ Bitcoin ${p} azken orduan (${m})`, newsT: (n) => `📰 ${n}-ri buruzko albistea`, test: '✅ senorbakBolsa abisuak badabiltza', testMsg: 'Horrela iritsiko zaizkizu zure zorroaren alertak.', why: 'Arrazoiak' },
};
const P = (x) => (x > 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + ' %';
const M2 = (x, cur) => { const c = { EUR: '€', USD: '$', GBP: '£', GBp: 'p' }[cur] || cur || ''; const d = Math.abs(x) >= 100 ? 2 : Math.abs(x) >= 1 ? 2 : 4; return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ' + c; };
const REASON = { es: { rsi: (v) => (v > 70 ? `RSI ${v.toFixed(0)} (sobrecompra)` : v < 30 ? `RSI ${v.toFixed(0)} (sobreventa)` : null), macd: (v) => (v > 0 ? 'MACD alcista' : 'MACD bajista'), trend20: (v) => (v > 0 ? 'por encima de su media de 20 días' : 'por debajo de su media de 20 días'), ma200: (v) => (v > 0 ? 'por encima de la media de 200 días' : 'por debajo de la media de 200 días'), cross: (v) => (v > 0 ? 'cruce dorado (50 > 200)' : 'cruce de la muerte (50 < 200)'), mom12: (v) => `${P(v * 100)} en 12 meses`, dd: (v) => `${P(v * 100)} desde su máximo` }, eu: { rsi: (v) => (v > 70 ? `RSI ${v.toFixed(0)} (gainerosketa)` : v < 30 ? `RSI ${v.toFixed(0)} (gainsalmenta)` : null), macd: (v) => (v > 0 ? 'MACD goranzkoa' : 'MACD beheranzkoa'), trend20: (v) => (v > 0 ? '20 eguneko batez bestekoaren gainetik' : '20 eguneko batez bestekoaren azpitik'), ma200: (v) => (v > 0 ? '200 eguneko batez bestekoaren gainetik' : '200 eguneko batez bestekoaren azpitik'), cross: (v) => (v > 0 ? 'urrezko gurutzea' : 'heriotzaren gurutzea'), mom12: (v) => `${P(v * 100)} 12 hilabetetan`, dd: (v) => `${P(v * 100)} maximotik` } };

async function watcher(env, force) {
  const cfg = await env.STATE.get('cfg', 'json'); if (!cfg || !cfg.topic) return { skip: 'sin configuración' };
  const L = T[cfg.lang] || T.es; const pr = cfg.prefs || {}; const M = madrid();
  const st = (await env.STATE.get('st', 'json')) || { last: {}, peak: {}, sig: {}, sum: {}, log: [], rot: 0 };
  const pos = (cfg.positions || []).filter((p) => p.qty > 0); const alerts = (cfg.alerts || []).filter((a) => a.on);
  const syms = [...new Set([...pos.map((p) => p.s), ...alerts.map((a) => a.s)])];
  const quiet = pr.quiet && (M.m >= 23 * 60 || M.m < 7 * 60 + 30);
  const sumSlot = M.wd !== 'Sat' && M.wd !== 'Sun' ? (M.m >= 9 * 60 + 5 && M.m < 9 * 60 + 20 ? 'open' : M.m >= 17 * 60 + 40 && M.m < 17 * 60 + 55 ? 'close' : M.m >= 22 * 60 + 10 && M.m < 22 * 60 + 25 ? 'us' : null) : null;
  const evSlot = M.m >= 19 * 60 && M.m < 19 * 60 + 15;
  const fcSlot = (M.m >= 8 * 60 + 30 && M.m < 8 * 60 + 45) || (M.m >= 18 * 60 + 15 && M.m < 18 * 60 + 30);
  const active = syms.filter((s) => openNow(exOf(s), M));
  if (!force && !active.length && !sumSlot && !fcSlot && !evSlot) return { skip: 'mercados cerrados' };
  const sent = []; let dirty = false;
  const send = async (key, n, urgent) => {
    if (quiet && !urgent) return; if (st.last[key]) return;
    if (await push(cfg, n).catch(() => false)) { st.last[key] = Date.now(); st.log.unshift({ t: Date.now(), title: n.title, msg: n.msg, s: n.s || null, k: n.k || '' }); st.log = st.log.slice(0, 60); sent.push(key); dirty = true; }
  };
  // limpia marcas antiguas (cada aviso se repite como mucho una vez al día)
  for (const k of Object.keys(st.last)) if (Date.now() - st.last[k] > 20 * 36e5) { delete st.last[k]; dirty = true; }
  const fxSyms = [...new Set(pos.map((p) => p.cur).filter((c) => c && c !== 'EUR'))].map((c) => (c === 'GBp' ? 'GBP' : c) + 'EUR=X');
  const qs = new Map((await quotes([...new Set([...syms, ...fxSyms])], env)).map((q) => [q.s, q]));
  const fx = (cur) => (!cur || cur === 'EUR' ? 1 : cur === 'GBp' ? (qs.get('GBPEUR=X')?.price || 1.15) / 100 : qs.get(cur + 'EUR=X')?.price || 1);
  const day = M.day;
  for (const p of pos) {
    const q = qs.get(p.s); if (!q || q.price == null) continue; const name = p.n || p.s; const cur = q.cur || p.cur;
    const isOpen = openNow(exOf(p.s), M); const dayPct = q.prev ? (q.price / q.prev - 1) * 100 : 0; const fromBuy = (q.price / p.price - 1) * 100;
    const posLine = `${L.now}: ${M2(q.price, cur)} · ${L.pos}: ${P(fromBuy)} (${M2((q.price - p.price) * p.qty * fx(cur), 'EUR')})`;
    if (p.stop && q.price <= p.stop) await send(`stop:${p.id}:${day}`, { title: L.stop(name), msg: posLine, s: p.s, prio: 5, tags: ['rotating_light'], k: 'stop' }, true);
    if (p.target && q.price >= p.target) await send(`tgt:${p.id}:${day}`, { title: L.target(name), msg: posLine, s: p.s, prio: 4, tags: ['dart'], k: 'target' });
    if (p.trail) { const pk = Math.max(st.peak[p.id] || p.price, q.price); if (pk > (st.peak[p.id] || 0) * 1.005) { st.peak[p.id] = pk; dirty = true; } if (q.price <= pk * (1 - p.trail / 100)) await send(`trail:${p.id}:${day}`, { title: L.trail(name), msg: posLine, s: p.s, prio: 5, tags: ['rotating_light'], k: 'stop' }, true); }
    if (isOpen) {
      const dd = pr.dropDay || 3, ru = pr.riseDay || 4;
      if (dayPct <= -dd) { const lvl = Math.floor(-dayPct / dd); await send(`dd:${p.s}:${day}:${lvl}`, { title: L.drop(name, P(dayPct)), msg: posLine, s: p.s, prio: lvl > 1 ? 5 : 4, tags: ['chart_with_downwards_trend'], k: 'drop' }); }
      if (dayPct >= ru) { const lvl = Math.floor(dayPct / ru); await send(`du:${p.s}:${day}:${lvl}`, { title: L.rise(name, P(dayPct)), msg: posLine, s: p.s, prio: 3, tags: ['rocket'], k: 'rise' }); }
      const fb = pr.dropFromBuy || 8, fu = pr.riseFromBuy || 15;
      if (fromBuy <= -fb) { const lvl = Math.floor(-fromBuy / 5); await send(`fb:${p.id}:${lvl}`, { title: L.fromBuyDown(name, P(fromBuy)), msg: posLine, s: p.s, prio: 4, tags: ['warning'], k: 'drop' }); }
      if (fromBuy >= fu) { const lvl = Math.floor(fromBuy / 5); await send(`fu:${p.id}:${lvl}`, { title: L.fromBuyUp(name, P(fromBuy)), msg: posLine, s: p.s, prio: 3, tags: ['moneybag'], k: 'rise' }); }
    }
  }
  // Bitcoin: movimiento fuerte en una hora
  if (syms.some((s) => s.startsWith('BTC')) && pr.btcMove) {
    try { const s = syms.find((x) => x.startsWith('BTC')); const c = await chart(s, '1d', '5m'); const k = c.candles; if (k.length > 13) { const a = k[k.length - 13].close, b = k[k.length - 1].close; const m = (b / a - 1) * 100; if (Math.abs(m) >= pr.btcMove) await send(`btc:${M.day}:${Math.round(M.m / 60)}`, { title: L.btc(P(m), M2(b, c.meta.currency)), msg: '', s, prio: 4, tags: [m > 0 ? 'rocket' : 'chart_with_downwards_trend'], k: m > 0 ? 'rise' : 'drop' }); } } catch {}
  }
  // Alertas personalizadas
  let cfgDirty = false;
  for (const a of alerts) {
    const q = qs.get(a.s); if (!q || q.price == null) continue; const n = a.n || a.s; const pct = q.prev ? (q.price / q.prev - 1) * 100 : 0; let hit = null;
    if (a.kind === 'above' && q.price >= a.value) hit = L.alertAbove(n, M2(a.value, q.cur));
    if (a.kind === 'below' && q.price <= a.value) hit = L.alertBelow(n, M2(a.value, q.cur));
    if (a.kind === 'dayUp' && pct >= a.value) hit = L.rise(n, P(pct));
    if (a.kind === 'dayDown' && pct <= -a.value) hit = L.drop(n, P(pct));
    if (hit) { await send(`al:${a.id}:${day}`, { title: hit, msg: `${L.now}: ${M2(q.price, q.cur)} (${P(pct)} ${L.today})`, s: a.s, prio: 4, tags: ['bell'], k: 'alert' }); if (a.kind === 'above' || a.kind === 'below') { a.on = false; cfgDirty = true; } }
  }
  // Resúmenes de apertura y cierre
  if (sumSlot && (sumSlot === 'open' ? pr.sumOpen : pr.sumClose) && pos.length && !st.sum[sumSlot + day]) {
    const rel = pos.filter((p) => sumSlot === 'us' ? exOf(p.s) === 'US' : exOf(p.s) !== 'US'); const list = rel.length ? rel : pos;
    let val = 0, chg = 0; const mv = [];
    for (const p of list) { const q = qs.get(p.s); if (!q?.price) continue; const r = fx(q.cur || p.cur); val += q.price * p.qty * r; const d = q.prev ? (q.price - q.prev) * p.qty * r : 0; chg += d; mv.push([p.n || p.s, q.prev ? (q.price / q.prev - 1) * 100 : 0]); }
    mv.sort((a, b) => b[1] - a[1]);
    if (val) { const pc = (chg / (val - chg)) * 100; const title = sumSlot === 'open' ? L.sumOpen : sumSlot === 'close' ? L.sumClose : L.sumUS;
      const msg = `${P(pc)} (${chg >= 0 ? '+' : ''}${M2(chg, 'EUR')}) · ${M2(val, 'EUR')}` + (mv.length > 1 ? `\n${L.best}: ${mv[0][0]} ${P(mv[0][1])} · ${L.worst}: ${mv[mv.length - 1][0]} ${P(mv[mv.length - 1][1])}` : '');
      await send(`sum:${sumSlot}:${day}`, { title, msg, prio: 2, tags: ['briefcase'], k: 'summary' }, false); st.sum[sumSlot + day] = 1; dirty = true; }
  }
  // Previsión: recalcula 2 valores por pasada (para no gastar CPU) y avisa si cambia la recomendación
  if ((fcSlot || force) && pr.forecast !== false && pos.length) {
    const order = [...new Set(pos.map((p) => p.s))]; const pick = [order[st.rot % order.length], order[(st.rot + 1) % order.length]]; st.rot = (st.rot + 2) % Math.max(1, order.length); dirty = true;
    for (const s of [...new Set(pick)]) {
      try {
        const c = await chart(s, '2y', '1d', 3600); const cl = c.candles.map((k) => k.close); if (cl.length < 60) continue;
        const Pp = prep(cl, c.candles.map((k) => k.volume || 0)); const f = factorsAt(Pp, cl.length - 1); if (!f) continue;
        const now = { s: label(combine(f.S)), l: label(combine(f.L)) }; const old = st.sig[s] || {}; st.sig[s] = { ...now, d: Date.now() };
        const name = pos.find((p) => p.s === s)?.n || s; const R = REASON[cfg.lang] || REASON.es;
        for (const h of ['s', 'l']) {
          if (!old[h] || old[h] === now[h]) continue; const grp = (x) => (x.includes('buy') ? 1 : x.includes('sell') ? -1 : 0); if (grp(old[h]) === grp(now[h])) continue;
          const why = (h === 's' ? f.S : f.L).map(([k, v, raw]) => [k, Math.abs(v), R[k]?.(raw)]).filter((x) => x[2]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[2]).join(' · ');
          await send(`fc:${s}:${h}:${now[h]}:${day}`, { title: L.fc(name, h === 's' ? L.short : L.long, L.labels[now[h]]), msg: why ? `${L.why}: ${why}` : '', s, prio: grp(now[h]) < 0 ? 4 : 3, tags: ['crystal_ball'], k: 'forecast' });
        }
      } catch {}
    }
  }
  // Noticias fuertes sobre tus valores (cada 30 min)
  if (pr.news !== false && pos.length && M.m % 30 < 2 && !quiet) {
    try {
      const items = await news(pos.map((p) => p.s).filter((s) => !s.startsWith('BTC')));
      const names = pos.map((p) => ({ s: p.s, rx: new RegExp('\\b(' + (p.n || p.s).split(/[\s(]/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i') }));
      st.seen = st.seen || [];
      for (const it of items.slice(0, 40)) {
        if (Date.now() - it.t > 3 * 36e5 || st.seen.includes(it.id)) continue; const m = names.find((x) => x.rx.test(it.title)); if (!m) continue;
        const sc = tone(it.title); if (Math.abs(sc) < 0.45) continue;
        st.seen.unshift(it.id); st.seen = st.seen.slice(0, 80); dirty = true;
        await send(`nw:${it.id}`, { title: L.newsT(pos.find((p) => p.s === m.s)?.n || m.s), msg: it.title, s: m.s, prio: 3, tags: [sc > 0 ? 'green_circle' : 'red_circle'], k: 'news' });
      }
    } catch {}
  }
  // Calendario: aviso la víspera (resultados, dividendos, bancos centrales) a partir de las 19:00
  if (pr.calendar !== false && M.m >= 19 * 60 && M.m < 19 * 60 + 15 && (cfg.events || []).length) {
    const tom = madrid(new Date(Date.now() + 864e5)).day;
    for (const e of cfg.events) if (e.d === tom) await send(`ev:${e.id || e.k + e.s + e.d}`, { title: (cfg.lang === 'eu' ? '📅 Bihar: ' : '📅 Mañana: ') + e.title, msg: e.msg || '', s: e.s || null, prio: 3, tags: ['calendar'], k: 'calendar' });
  }
  if (cfgDirty) await env.STATE.put('cfg', JSON.stringify(cfg));
  if (dirty) await env.STATE.put('st', JSON.stringify(st));
  return { sent, active: active.length };
}
// tono rápido de un titular (mismo criterio que la app)
const TP = /\b(sube|suben|dispara|récord|máximos|gana|beneficio|supera|mejora|rebota|recupera|crece|impulsa|alza|surge|soar|jump|rally|record|beat|upgrade|rise|gain|profit|strong)\w*/gi;
const TN = /\b(cae|caen|desploma|hunde|pierde|pérdidas|recorta|baja|mínimos|crisis|quiebra|despidos|multa|investigación|demanda|advierte|decepciona|retrocede|plunge|fall|drop|crash|loss|miss|cut|downgrade|weak|warning|lawsuit|probe|recession|fraud)\w*/gi;
function tone(t) { const p = (t.match(TP) || []).length, n = (t.match(TN) || []).length; return p + n ? (p - n) / (p + n + 0.5) : 0; }

/* ---------------------------------- rutas ---------------------------------- */
export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url); const p = url.pathname.replace(/\/+$/, '') || '/'; const q = (k) => url.searchParams.get(k) || '';
    try {
      if (p === '/') { const kv = !!env.STATE; const claimed = kv ? !!(await env.STATE.get('devices')) : false; return json({ ok: true, app: 'senorbakBolsa', version: VERSION, kv, claimed, time: Date.now() }); }
      if (!env.STATE && !['/q', '/c', '/s', '/f', '/e', '/n', '/fg', '/sp'].includes(p)) return json({ error: 'Falta enlazar el KV con el nombre STATE' }, 500);
      if (p === '/q') return json(await quotes(q('s').split(',').filter(Boolean), env), 200, { 'Cache-Control': 'public, max-age=10' });
      if (p === '/sp') { // mini-gráficas en bloque: cierres intradía o diarios de hasta 60 valores
        const list = q('s').split(',').filter(Boolean).slice(0, 60); const range = q('range') || '1d', iv = q('interval') || (range === '1d' ? '15m' : '1d'); const out = {};
        await Promise.all(Array.from({ length: Math.ceil(list.length / 20) }, (_, i) => yget(`${Y1}/v8/finance/spark?symbols=${encodeURIComponent(list.slice(i * 20, i * 20 + 20).join(','))}&range=${range}&interval=${iv}`, { ttl: range === '1d' ? 60 : 1800 }).then((j) => { for (const [k, v] of Object.entries(j || {})) if (v?.close) out[k] = { c: v.close.filter((x) => x != null).map((x) => +x.toPrecision(7)), prev: v.chartPreviousClose ?? v.previousClose ?? null }; }).catch(() => {})));
        return json(out, 200, { 'Cache-Control': 'public, max-age=30' });
      }
      if (p === '/c') { const c = await chart(q('s'), q('range') || '1mo', q('interval') || '1d'); return json({ candles: c.candles, meta: { cur: c.meta.currency, name: c.meta.longName || c.meta.shortName, ex: c.meta.exchangeName, tz: c.meta.exchangeTimezoneName } }); }
      if (p === '/s') return json(await search(q('q')));
      if (p === '/f') return json(await fundamentals(q('s'), env));
      if (p === '/e') { const c = await chart(q('s'), '5y', '1mo', 86400); return json({ div: Object.values(c.events.dividends || {}).map((d) => ({ t: d.date * 1000, v: d.amount })).sort((a, b) => b.t - a.t).slice(0, 20), split: Object.values(c.events.splits || {}).map((d) => ({ t: d.date * 1000, r: d.splitRatio })) }); }
      if (p === '/n') return json(await news(q('syms').split(',').filter(Boolean), q('feeds'), q('debug')));
      if (p === '/fg') return json(await fearGreed());
      if (p === '/claim' && req.method === 'POST') {
        const dev = await env.STATE.get('devices', 'json'); const body = await req.json().catch(() => ({}));
        if (dev && dev.length) { const code = await env.STATE.get('paircode'); if (!code || String(body.code || '') !== code) return json({ error: 'claimed' }, 403); await env.STATE.delete('paircode'); }
        return json({ token: await addDevice(env) });
      }
      if (!(await authed(req, env))) return json({ error: 'auth' }, 401);
      if (p === '/paircode') { const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); await env.STATE.put('paircode', code, { expirationTtl: 900 }); return json({ code }); }
      if (p === '/sync' && req.method === 'POST') { const b = await req.json(); const cfg = { positions: (b.positions || []).slice(0, 200), alerts: (b.alerts || []).slice(0, 200), events: (b.events || []).slice(0, 80), prefs: b.prefs || {}, lang: b.lang === 'eu' ? 'eu' : 'es', topic: String(b.topic || '').slice(0, 64), appUrl: String(b.appUrl || '').slice(0, 200), t: Date.now() }; await env.STATE.put('cfg', JSON.stringify(cfg)); return json({ ok: true }); }
      if (p === '/ai' && req.method === 'POST') { // IA de reserva con Cloudflare Workers AI (necesita el enlace "AI")
        if (!env.AI) return json({ error: { message: 'Falta enlazar Workers AI con el nombre AI' } }, 501);
        const b = await req.json(); const model = /^@cf\//.test(b.model || '') ? b.model : '@cf/openai/gpt-oss-120b';
        const input = { messages: b.messages, max_tokens: Math.min(b.max_tokens || 2000, 4000) }; if (b.tools) input.tools = b.tools;
        let r; try { r = await env.AI.run(model, input); } catch (e) { return json({ error: { message: String(e.message || e) } }, /4006|neurons|limit/i.test(String(e.message)) ? 429 : 502); }
        if (r?.choices) return json(r);
        // otros formatos → formato OpenAI
        const calls = (r?.tool_calls || []).map((c, i) => ({ id: c.id || 'c' + i, type: 'function', function: { name: c.name || c.function?.name, arguments: typeof (c.arguments ?? c.function?.arguments) === 'string' ? (c.arguments ?? c.function?.arguments) : JSON.stringify(c.arguments ?? c.function?.arguments ?? {}) } }));
        let text = r?.response ?? r?.output_text ?? '';
        if (!text && Array.isArray(r?.output)) text = r.output.filter((o) => o.type === 'message').flatMap((o) => o.content || []).map((c) => c.text || '').join('');
        return json({ choices: [{ message: { role: 'assistant', content: typeof text === 'string' ? text : JSON.stringify(text), tool_calls: calls.length ? calls : undefined } }] });
      }
      if (p === '/notifs') { const st = (await env.STATE.get('st', 'json')) || {}; return json(st.log || []); }
      if (p === '/test' && req.method === 'POST') { const cfg = await env.STATE.get('cfg', 'json'); if (!cfg?.topic) return json({ error: 'topic' }, 400); const L = T[cfg.lang] || T.es; const ok = await push(cfg, { title: L.test, msg: L.testMsg, tags: ['white_check_mark'], prio: 3 }); return json({ ok }); }
      if (p === '/run') return json(await watcher(env, true));
      return json({ error: 'not found' }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 502); }
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(watcher(env, false).catch(() => {})); },
};
