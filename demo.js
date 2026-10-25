// Datos simulados para el modo demostración (cuando aún no hay servidor ni claves). Siempre se avisa en pantalla.
import { info } from './universe.js';
const BASE = { '^IBEX': 18990, '^GSPC': 6850, '^IXIC': 23400, '^DJI': 47100, '^STOXX50E': 5650, '^GDAXI': 24300, '^FCHI': 8200, '^FTSE': 9600, 'FTSEMIB.MI': 43000, '^N225': 49000, '^HSI': 26000, '000001.SS': 3900, '^VIX': 17,
  AAPL: 347, MSFT: 524, NVDA: 186, AMZN: 248, GOOGL: 255, META: 735, TSLA: 440, 'BRK-B': 490, JPM: 300, V: 345, 'BTC-EUR': 72150, 'BTC-USD': 80290, 'GC=F': 4100, 'SI=F': 48, 'CL=F': 61, 'BZ=F': 65, 'NG=F': 3.4, 'HG=F': 5.1, 'ZW=F': 5.3,
  'EURUSD=X': 1.1203, 'EURGBP=X': 0.872, 'EURJPY=X': 171.5, 'EURCHF=X': 0.928, 'GBPUSD=X': 1.338, 'USDJPY=X': 153.1, '^TNX': 4.05, '^TYX': 4.6,
  'ITX.MC': 49, 'SAN.MC': 11.51, 'IBE.MC': 17.4, 'BBVA.MC': 16.2, 'TEF.MC': 4.3, 'REP.MC': 14.6, 'CABK.MC': 8.4, 'AENA.MC': 24.5, 'FER.MC': 51, 'AMS.MC': 66 };
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r()); }
const cache = new Map();
// Serie diaria de 6 años, determinista por símbolo, que termina en el precio base
export function daily(s) {
  if (cache.has(s)) return cache.get(s);
  const h = hash(s); const r = rng(h); const n = 1560;
  const vol = info(s).t === 'fx' ? 0.005 : info(s).t === 'index' ? 0.011 : s.startsWith('BTC') ? 0.032 : 0.018;
  const drift = (r() - 0.35) * 0.0012; const raw = [1];
  for (let i = 1; i < n; i++) raw.push(raw[i - 1] * Math.exp(drift + vol * gauss(r) + Math.sin(i / (40 + (h % 60))) * vol * 0.12));
  const base = BASE[s] ?? 20 + (h % 380); const k = base / raw[n - 1];
  const day = 86400000; const end = new Date(); end.setHours(0, 0, 0, 0);
  const out = []; let d = new Date(end.getTime());
  const dates = []; while (dates.length < n) { const wd = d.getDay(); if (s.startsWith('BTC') || (wd !== 0 && wd !== 6)) dates.unshift(d.getTime()); d = new Date(d.getTime() - day); }
  for (let i = 0; i < n; i++) { const c = raw[i] * k, o = (raw[i - 1] ?? raw[i]) * k; const sp = Math.abs(gauss(r)) * vol * 0.6; out.push({ time: dates[i] / 1000, open: o, high: Math.max(o, c) * (1 + sp), low: Math.min(o, c) * (1 - sp), close: c, volume: Math.round((1 + r() * 2) * (5e5 + (h % 9) * 3e5)) }); }
  cache.set(s, out); return out;
}
export function intraday(s, days, stepMin) {
  const d = daily(s); const r = rng(hash(s + days + stepMin)); const out = [];
  const last = d.slice(-days - 1); const vol = 0.0016 * (s.startsWith('BTC') ? 2.2 : 1);
  const now = Date.now() / 1000;
  for (let j = 1; j < last.length; j++) {
    const o = last[j - 1].close, c = j === last.length - 1 ? live(s) : last[j].close; const steps = Math.round((s.startsWith('BTC') ? 1440 : 510) / stepMin);
    const t0 = last[j].time + (s.startsWith('BTC') ? 0 : 9 * 3600); let p = o;
    for (let i = 0; i < steps; i++) { const t = t0 + i * stepMin * 60; if (t > now) break; const target = o + (c - o) * ((i + 1) / steps); const np = p + (target - p) * 0.35 + p * vol * gauss(r); out.push({ time: t, open: p, high: Math.max(p, np) * (1 + vol * 0.3), low: Math.min(p, np) * (1 - vol * 0.3), close: np, volume: Math.round(1e4 + r() * 4e4) }); p = np; }
  }
  return out;
}
const liveP = new Map();
export function live(s) {
  const d = daily(s); const last = d[d.length - 1];
  if (!liveP.has(s)) liveP.set(s, last.close * (1 + (rng(hash(s + 'x'))() - 0.5) * 0.02));
  return liveP.get(s);
}
export function tick(s) { const p = live(s); const v = s.startsWith('BTC') ? 0.0009 : 0.0004; const np = p * (1 + (Math.random() - 0.5) * 2 * v); liveP.set(s, np); return np; }
export function quote(s) {
  const d = daily(s); const prev = d[d.length - 2].close; const p = live(s); const y = d.slice(-252); const i = info(s);
  return { s, price: p, prev, chg: p - prev, pct: (p / prev - 1) * 100, open: d[d.length - 1].open, high: Math.max(p, d[d.length - 1].high), low: Math.min(p, d[d.length - 1].low), volume: d[d.length - 1].volume, cur: i.cur ?? (i.t === 'index' || i.t === 'bond' ? null : 'USD'), name: i.n, mcap: i.c ? i.c * 1e9 : null, w52h: Math.max(...y.map((k) => k.high)), w52l: Math.min(...y.map((k) => k.low)), pe: i.t === 'stock' ? 8 + (hash(s) % 30) : null, dy: i.t === 'stock' ? (hash(s) % 50) / 10 : null, t: Date.now(), demo: true };
}
const HEAD = [
  ['El BCE mantiene los tipos y deja la puerta abierta a nuevos recortes', 0.3, ['^STOXX50E', '^IBEX']], ['Inditex dispara sus ventas en el arranque de la campaña de invierno', 0.6, ['ITX.MC']],
  ['NVIDIA presenta resultados récord gracias a la demanda de chips de IA', 0.7, ['NVDA']], ['El petróleo cae por el aumento de inventarios en EE. UU.', -0.4, ['CL=F', 'REP.MC']],
  ['Santander supera las previsiones de beneficio del trimestre', 0.5, ['SAN.MC']], ['Tesla retrasa la entrega de su nuevo modelo y la acción se hunde', -0.7, ['TSLA']],
  ['Bitcoin recupera terreno tras la entrada de flujos en los ETF', 0.5, ['BTC-EUR']], ['Iberdrola anuncia una inversión millonaria en redes eléctricas', 0.4, ['IBE.MC']],
  ['La inflación de la eurozona repunta más de lo esperado', -0.4, ['^STOXX50E']], ['Apple decepciona con las ventas del iPhone en China', -0.5, ['AAPL']],
  ['Wall Street cierra en máximos impulsada por la tecnología', 0.5, ['^GSPC', '^IXIC']], ['Telefónica recorta su previsión de flujo de caja', -0.5, ['TEF.MC']],
];
export function news() { const now = Date.now(); return HEAD.map(([title, sent, syms], i) => ({ id: 'demo' + i, t: now - i * 47 * 60000, title: title, sum: '', url: '', src: 'Demo', syms, sent, sentSrc: 'demo', demo: true })); }
export function analyst(s) { const h = hash(s); return { strongBuy: h % 12, buy: (h >> 3) % 18, hold: (h >> 6) % 12, sell: (h >> 9) % 4, strongSell: (h >> 12) % 2, period: '' }; }
