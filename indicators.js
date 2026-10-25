// Indicadores técnicos (funciones puras; también las usa el servidor de Cloudflare)
export function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
export function ema(a, n) { const o = new Array(a.length).fill(null); const k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++) { if (i < n - 1) continue; if (e === null) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
export function rsi(a, n = 14) {
  const o = new Array(a.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < a.length; i++) {
    const d = a[i] - a[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return o;
}
export function macd(a, f = 12, s = 26, sig = 9) {
  const ef = ema(a, f), es = ema(a, s); const m = a.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const first = m.findIndex((x) => x != null); const sg = new Array(a.length).fill(null);
  if (first >= 0) { const e = ema(m.slice(first), sig); for (let i = 0; i < e.length; i++) sg[first + i] = e[i]; }
  return { macd: m, signal: sg, hist: m.map((x, i) => (x != null && sg[i] != null ? x - sg[i] : null)) };
}
export function bollinger(a, n = 20, k = 2) {
  const m = sma(a, n); const up = [], lo = [];
  for (let i = 0; i < a.length; i++) { if (m[i] == null) { up.push(null); lo.push(null); continue; } let v = 0; for (let j = i - n + 1; j <= i; j++) v += (a[j] - m[i]) ** 2; const sd = Math.sqrt(v / n); up.push(m[i] + k * sd); lo.push(m[i] - k * sd); }
  return { mid: m, up, lo };
}
export function stdev(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }
export function returns(a) { const r = []; for (let i = 1; i < a.length; i++) r.push(a[i] / a[i - 1] - 1); return r; }
export function volatility(a, n = 20) { const r = returns(a.slice(-n - 1)); return r.length > 2 ? stdev(r) * Math.sqrt(252) : null; }
export function atr(h, l, c, n = 14) { const tr = c.map((x, i) => (i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])))); return sma(tr, n); }
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

/* ---- Puntuación técnica en el día i (solo con datos hasta ese día) ----
   Devuelve factores en [-1, 1] para corto plazo (días-semanas) y largo plazo (meses). */
export function prep(closes, vols) {
  return { c: closes, v: vols || null, s20: sma(closes, 20), s50: sma(closes, 50), s200: sma(closes, 200), e20: ema(closes, 20), r: rsi(closes, 14), m: macd(closes), b: bollinger(closes, 20, 2), v20: vols ? sma(vols, 20) : null };
}
export function factorsAt(P, i) {
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
export const W = { rsi: 1.1, macd: 1.0, bb: 0.7, trend20: 1.0, mom5: 0.6, vol: 0.5, news: 0.8, ma200: 1.2, cross: 0.8, slope200: 0.8, ma50: 1.0, mom12: 1.1, mom6: 1.0, dd: 0.6, hot: 0.5, analyst: 1.2, value: 0.5 };
export function combine(fs) { let s = 0, w = 0; for (const [k, v] of fs) { const ww = W[k] ?? 0.5; s += v * ww; w += ww; } return w ? Math.round((s / w) * 100) : 0; }
export function label(score) { return score >= 40 ? 'sbuy' : score >= 15 ? 'buy' : score > -15 ? 'hold' : score > -40 ? 'sell' : 'ssell'; }
