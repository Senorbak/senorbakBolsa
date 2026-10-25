// Formato de números, monedas y fechas (es-ES / eu-ES)
// Los números se escriben igual en castellano y en euskera (1.234,56); las fechas, en cada idioma
const LOC = 'es-ES'; let DLOC = 'es-ES';
export const setLocale = (l) => { DLOC = l === 'eu' ? 'eu-ES' : 'es-ES'; };
const nf = new Map();
const F = (o) => { const k = LOC + JSON.stringify(o); if (!nf.has(k)) nf.set(k, new Intl.NumberFormat(LOC, o)); return nf.get(k); };
const SYM = { USD: '$', EUR: '€', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'CHF', HKD: 'HK$', DKK: 'kr', SEK: 'kr', KRW: '₩', CNY: '¥', TWD: 'NT$' };
export function dec(v) { const a = Math.abs(v); return a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6; }
export function num(v, d) { if (v == null || !isFinite(v)) return '—'; return F({ minimumFractionDigits: d ?? dec(v), maximumFractionDigits: d ?? dec(v) }).format(v); }
export function price(v, cur, d) {
  if (v == null || !isFinite(v)) return '—';
  const s = num(v, d); const c = SYM[cur] ?? (cur || '');
  if (!c) return s;
  return cur === 'USD' || cur === 'GBP' || cur === 'HKD' || cur === 'TWD' ? c + s : s + ' ' + c;
}
export const eur = (v, d = 2) => price(v, 'EUR', d);
export function pct(v, d = 2, sign = true) { if (v == null || !isFinite(v)) return '—'; return (sign && v > 0 ? '+' : '') + F({ minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + ' %'; }
export function signed(v, cur, d = 2) { if (v == null || !isFinite(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + price(Math.abs(v), cur, d); }
export function big(v, cur) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v); const u = DLOC.startsWith('eu') ? ['', 'mila', 'M', 'mila M', 'B'] : ['', 'mil', 'M', 'mil M', 'B'];
  let s, i = 0; const steps = [1, 1e3, 1e6, 1e9, 1e12];
  for (let k = steps.length - 1; k >= 0; k--) if (a >= steps[k]) { i = k; break; }
  s = F({ maximumFractionDigits: a / steps[i] >= 100 ? 0 : 1 }).format(v / steps[i]);
  const unit = i === 0 ? '' : ' ' + u[i];
  return cur ? (SYM[cur] && (cur === 'USD') ? SYM[cur] + s + unit : s + unit + ' ' + (SYM[cur] || cur)) : s + unit;
}
export function vol(v) { return big(v); }
export function cls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
export function date(t, o = { day: 'numeric', month: 'short' }) { return new Intl.DateTimeFormat(DLOC, o).format(new Date(t)); }
export function time(t) { return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(t)); }
export function ago(t, tr) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return tr('now');
  if (s < 3600) return tr('minAgo', Math.floor(s / 60));
  if (s < 86400) return tr('hAgo', Math.floor(s / 3600));
  return tr('dAgo', Math.floor(s / 86400));
}
export const iso = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
