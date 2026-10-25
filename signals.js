// Motor de señales: combina indicadores técnicos, analistas y noticias, y mide su fiabilidad con el propio historial del valor.
import { prep, factorsAt, combine, label, atr, volatility } from './indicators.js';
const H = { s: 10, l: 120 }; // horizonte en sesiones: corto ≈ 2 semanas, largo ≈ 6 meses

export function analyze(candles, extra = {}) {
  const c = candles.map((k) => k.close), v = candles.map((k) => k.volume || 0);
  const n = c.length; if (n < 40) return null;
  const P = prep(c, v.some((x) => x > 0) ? v : null);
  const i = n - 1; const f = factorsAt(P, i); if (!f) return null;
  const S = f.S.slice(), Lf = f.L.slice();
  // Noticias (tono medio de las últimas 48 h, de -1 a 1)
  if (extra.news != null && extra.newsN >= 2) S.push(['news', Math.max(-1, Math.min(1, extra.news * 1.6)), extra.news]);
  // Consenso de analistas (Finnhub, solo EE. UU.)
  if (extra.analyst) { const a = extra.analyst; const tot = a.strongBuy + a.buy + a.hold + a.sell + a.strongSell; if (tot >= 3) { const sc = (a.strongBuy * 2 + a.buy - a.sell - a.strongSell * 2) / (tot * 2); Lf.push(['analyst', Math.max(-1, Math.min(1, sc * 1.6)), sc]); } }
  // Valoración (PER), con peso bajo
  if (extra.pe != null && extra.pe > 0) Lf.push(['value', extra.pe < 12 ? 0.4 : extra.pe < 20 ? 0.15 : extra.pe < 35 ? -0.1 : -0.4, extra.pe]);
  const sS = combine(S), sL = combine(Lf);
  const bt = backtest(P, n);
  // La etiqueta final mezcla la puntuación de hoy con lo que pasó en el pasado con puntuaciones parecidas
  const cal = (sc, pr) => (pr.prob != null && pr.base != null && pr.n >= 30 ? Math.round(0.65 * sc + 0.35 * Math.max(-100, Math.min(100, (pr.prob - pr.base) * 250))) : sc);
  const pS = probAt(bt.s, sS), pL = probAt(bt.l, sL); const fS = cal(sS, pS), fL = cal(sL, pL);
  const res = {
    s: { score: fS, raw: sS, label: label(fS), factors: S, ...pS, h: H.s },
    l: { score: fL, raw: sL, label: label(fL), factors: Lf, ...pL, h: H.l },
    price: c[i], vol: volatility(c, 20), strategy: bt.strategy,
  };
  // Niveles: soporte / resistencia (mín./máx. de 20 sesiones) y stop sugerido por volatilidad (2 × ATR)
  const hs = candles.map((k) => k.high ?? k.close), ls = candles.map((k) => k.low ?? k.close);
  const a = atr(hs, ls, c, 14)[i];
  const w = candles.slice(-20);
  res.levels = { support: Math.min(...w.map((k) => k.low ?? k.close)), resistance: Math.max(...w.map((k) => k.high ?? k.close)), atr: a, stop: a ? c[i] - 2 * a : c[i] * 0.93, target: a ? c[i] + 3 * a : c[i] * 1.1 };
  return res;
}

// Recorre el historial: para cada día calcula la puntuación técnica y qué pasó después.
function backtest(P, n) {
  const s = [], l = []; const c = P.c;
  let eq = 1, inPos = false, trades = 0, wins = 0, entry = 0; const start = Math.max(60, n - 504);
  for (let i = 60; i < n; i++) {
    const f = factorsAt(P, i); if (!f) continue;
    const ss = combine(f.S), sl = combine(f.L);
    if (i + H.s < n) s.push([ss, c[i + H.s] / c[i] - 1]);
    if (i + H.l < n && f.L.length >= 3) l.push([sl, c[i + H.l] / c[i] - 1]);
    // Estrategia simple en los últimos ~2 años: compra con señal ≥ 15 a corto, vende con ≤ -15
    if (i >= start && i < n - 1) {
      if (inPos) eq *= c[i + 1] / c[i];
      if (!inPos && ss >= 15) { inPos = true; entry = c[i]; trades++; }
      else if (inPos && ss <= -15) { inPos = false; if (c[i] > entry) wins++; }
    }
  }
  if (inPos && c[n - 1] > entry) wins++;
  const hold = c[n - 1] / c[start] - 1;
  return { s, l, strategy: { ret: eq - 1, hold, trades, wins, days: n - start } };
}
function probAt(rows, score) {
  if (rows.length < 30) return { prob: null, avg: null, n: rows.length, base: null };
  const base = rows.filter((r) => r[1] > 0).length / rows.length;
  let near = rows.filter((r) => Math.abs(r[0] - score) <= 10);
  if (near.length < 25) near = rows.filter((r) => Math.abs(r[0] - score) <= 20);
  if (near.length < 15) return { prob: null, avg: null, n: near.length, base };
  const up = near.filter((r) => r[1] > 0).length / near.length;
  const avg = near.reduce((a, r) => a + r[1], 0) / near.length;
  return { prob: up, avg, n: near.length, base };
}

// Consejo para una posición que ya tienes
export function adviceFor(pos, price, an, peak) {
  const out = []; const ch = price / pos.price - 1;
  if (pos.stop && price <= pos.stop) out.push({ k: 'stopHit', act: 'sell', lvl: 3 });
  if (pos.target && price >= pos.target) out.push({ k: 'targetHit', act: 'sell', lvl: 2 });
  if (pos.trail && peak && price <= peak * (1 - pos.trail / 100)) out.push({ k: 'trailHit', act: 'sell', lvl: 3 });
  if (an) {
    if (an.s.score <= -40 && an.l.score <= -15) out.push({ k: 'bothBad', act: 'sell', lvl: 2 });
    else if (an.l.score <= -40) out.push({ k: 'longBad', act: 'sell', lvl: 2 });
    else if (an.s.score <= -40 && ch > 0.1) out.push({ k: 'takeProfit', act: 'reduce', lvl: 1 });
    else if (an.s.score <= -15) out.push({ k: 'shortWeak', act: 'watch', lvl: 1 });
    if (an.s.score >= 40 && an.l.score >= 15) out.push({ k: 'strong', act: 'hold', lvl: 0 });
  }
  if (ch < -0.15 && (!an || an.l.score < 0)) out.push({ k: 'deepLoss', act: 'review', lvl: 2 });
  if (!out.length) out.push({ k: 'ok', act: 'hold', lvl: 0 });
  return out.sort((a, b) => b.lvl - a.lvl);
}

// Comprueba las señales guardadas cuyo plazo ya ha pasado: ¿acertaron?
export function scoreLog(log, closeOn) {
  let done = 0, ok = 0; const rows = [];
  for (const e of log) {
    if (e.lab === 'hold') continue;
    const hDays = e.h === 's' ? 14 : 180; const due = e.d + hDays * 86400000;
    if (Date.now() < due) { rows.push({ ...e, st: 'wait' }); continue; }
    const p2 = closeOn(e.s, due); if (p2 == null) continue;
    const r = p2 / e.p - 1; const hit = e.lab.includes('buy') ? r > 0 : r < 0;
    done++; if (hit) ok++; rows.push({ ...e, st: hit ? 'ok' : 'ko', r });
  }
  return { done, ok, rows };
}
