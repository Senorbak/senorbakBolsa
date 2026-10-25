// Estado persistente en el móvil (localStorage), con avisos de cambio
const KEY = 'sbolsa';
const DEF = {
  v: 1,
  lang: 'es',
  worker: '',          // URL del servidor de Cloudflare
  token: '',           // token del dispositivo (emparejado)
  keys: { finnhub: '', twelve: '', alpha: '', groq: '', anthropic: '' },
  ai: { engine: 'auto', claudeModel: 'claude-sonnet-5-5' },
  topic: '',           // tema de ntfy para las notificaciones
  watch: ['^IBEX', 'SAN.MC', 'ITX.MC', 'IBE.MC', 'AAPL', 'NVDA', 'MSFT', 'BTC-EUR'],
  positions: [],       // {id, s, n, cur, qty, price, date, fee, stop, target, trail, note}
  sales: [],           // {id, s, n, cur, qty, price, date, fee, fx}  (para plusvalías FIFO)
  lots: [],            // compras para FIFO {id, s, qty, price, date, fee, fx}
  events: [],          // próximos eventos para avisar la víspera {id, d, title, msg, s}
  evDay: '',
  alerts: [],          // {id, s, kind: 'above'|'below'|'dayUp'|'dayDown'|'rsiHigh'|'rsiLow'|'signal', value, on, last}
  prefs: { dropDay: 3, riseDay: 4, dropFromBuy: 8, riseFromBuy: 15, btcMove: 4, forecast: true, news: true, sumOpen: true, sumClose: true, quiet: true, calendar: true },
  sim: { cash: 10000, start: 10000, created: 0, pos: [], hist: [] },
  signalLog: [],       // {s, d, p, h: 's'|'l', lab, sc}
  seen: { news: 0, notifs: 0 },
  heatTab: 'es', horizon: 's', chartType: 'area', range: '1M', ind: { sma: true, bb: false, rsi: false, macd: false, vol: true },
};
let state;
try { state = { ...structuredClone(DEF), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = structuredClone(DEF); }
for (const k of ['keys', 'prefs', 'sim', 'seen', 'ind', 'ai']) state[k] = { ...DEF[k], ...(state[k] || {}) };
const subs = new Set();
let saveT = 0;
export const store = {
  get s() { return state; },
  set(patch) { Object.assign(state, typeof patch === 'function' ? patch(state) || {} : patch); this.save(); subs.forEach((f) => f(state)); },
  save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }, 120); },
  on(f) { subs.add(f); return () => subs.delete(f); },
  reset() { state = structuredClone(DEF); this.save(); },
  uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
};
