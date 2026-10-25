// Gráficas: TradingView Lightweight Charts para la grande, y lienzos propios para mini-gráficas, donut, medidor y mapa de calor.
const LC = () => window.LightweightCharts;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
export const COL = () => ({ up: css('--up'), down: css('--down'), acc: css('--acc'), tx2: css('--tx2'), tx3: css('--tx3'), line: css('--line'), bg: css('--bg'), warn: css('--warn'), c1: css('--c1'), c2: css('--c2'), c3: css('--c3') });

function base(el, h, opts = {}) {
  const c = COL();
  return LC().createChart(el, {
    height: h, autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.tx3, fontFamily: 'Archivo, system-ui, sans-serif', fontSize: 11, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: alpha(c.line, 0.55), style: 1 } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: { borderVisible: false, rightOffset: 3, fixLeftEdge: true, fixRightEdge: false, lockVisibleTimeRangeOnResize: true },
    crosshair: { mode: 1, vertLine: { color: alpha(c.acc, 0.5), width: 1, style: 0, labelBackgroundColor: c.bg }, horzLine: { color: alpha(c.acc, 0.35), style: 2, labelBackgroundColor: c.bg } },
    handleScale: { axisPressedMouseMove: false, pinch: true, mouseWheel: true }, handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
    localization: { locale: 'es-ES' },
    ...opts,
  });
}
const lineData = (k) => k.map((x) => ({ time: x.time, value: x.close }));
const tz = (k) => { const off = -new Date().getTimezoneOffset() * 60; return k.map((x) => ({ ...x, time: Math.round(x.time + off) })); }; // muestra la hora local

export class PriceChart {
  constructor(el, { height = 300, intraday = false } = {}) {
    this.el = el; this.chart = base(el, height, { timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 3, fixLeftEdge: true } });
    this.series = null; this.extra = []; this.subs = [];
  }
  set(k, { type = 'area', cur, ind = {}, markers = [], intraday = false, lines = [] } = {}) {
    const c = COL(); k = tz(k); this.k = k;
    this.chart.applyOptions({ timeScale: { timeVisible: intraday } });
    if (this.series) this.chart.removeSeries(this.series); this.extra.forEach((s) => this.chart.removeSeries(s)); this.extra = [];
    const first = k[0]?.close, last = k[k.length - 1]?.close; const good = last >= first; const col = good ? c.up : c.down;
    const fmt = { type: 'price', precision: last < 1 ? 4 : 2, minMove: last < 1 ? 0.0001 : 0.01 };
    if (type === 'candle') {
      this.series = this.chart.addCandlestickSeries({ upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: alpha(c.up, 0.8), wickDownColor: alpha(c.down, 0.8), priceFormat: fmt });
      this.series.setData(k.map((x) => ({ time: x.time, open: x.open ?? x.close, high: x.high ?? x.close, low: x.low ?? x.close, close: x.close })));
    } else {
      this.series = this.chart.addAreaSeries({ lineColor: col, lineWidth: 2, topColor: alpha(col, 0.28), bottomColor: alpha(col, 0.0), priceLineVisible: true, priceLineColor: alpha(col, 0.6), priceLineStyle: 2, lastValueVisible: true, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: c.bg, crosshairMarkerBackgroundColor: col, priceFormat: fmt, lineType: 0 });
      this.series.setData(lineData(k));
    }
    this.col = col; this.type = type;
    const closes = k.map((x) => x.close);
    const addLine = (vals, color, w = 1.5, style = 0) => { const s = this.chart.addLineSeries({ color, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(k.map((x, i) => (vals[i] == null ? { time: x.time } : { time: x.time, value: vals[i] }))); this.extra.push(s); };
    if (ind.sma && k.length > 25) { addLine(I.sma(closes, 20), alpha(c.c1, 0.9)); if (k.length > 60) addLine(I.sma(closes, 50), alpha(c.c2, 0.9)); if (k.length > 210) addLine(I.sma(closes, 200), alpha(c.c3, 0.9)); }
    if (ind.bb && k.length > 25) { const b = I.bollinger(closes); addLine(b.up, alpha(c.acc, 0.55), 1, 2); addLine(b.lo, alpha(c.acc, 0.55), 1, 2); }
    if (ind.vol && k.some((x) => x.volume)) { const v = this.chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }); this.chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } }); v.setData(k.map((x, i) => ({ time: x.time, value: x.volume || 0, color: alpha(i && x.close < k[i - 1].close ? c.down : c.up, 0.32) }))); this.extra.push(v); }
    for (const l of lines) this.series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    if (markers.length) this.series.setMarkers(markers.filter((m) => m.time >= k[0].time).sort((a, b) => a.time - b.time));
    this.chart.timeScale().fitContent();
  }
  push(price) { // actualización en directo del último punto
    if (!this.series || !this.k?.length) return; const last = this.k[this.k.length - 1];
    if (this.type === 'candle') { last.close = price; last.high = Math.max(last.high, price); last.low = Math.min(last.low, price); this.series.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: price }); }
    else { last.close = price; this.series.update({ time: last.time, value: price }); }
  }
  onHover(cb) { this.chart.subscribeCrosshairMove((p) => { if (!p.time || !p.seriesData) return cb(null); const d = p.seriesData.get(this.series); cb(d ? { time: p.time, value: d.value ?? d.close } : null); }); }
  syncTo(other) { const a = this.chart.timeScale(), b = other.chart.timeScale(); a.subscribeVisibleLogicalRangeChange((r) => r && b.setVisibleLogicalRange(r)); }
  destroy() { try { this.chart.remove(); } catch {} }
}
import * as I from './indicators.js';
export class OscChart { // RSI o MACD bajo la gráfica principal
  constructor(el, kind, k) {
    const c = COL(); this.chart = base(el, 92, { timeScale: { visible: false }, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } } });
    k = tz(k); const closes = k.map((x) => x.close);
    if (kind === 'rsi') {
      const s = this.chart.addLineSeries({ color: c.acc, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true }); const r = I.rsi(closes);
      s.setData(k.map((x, i) => (r[i] == null ? { time: x.time } : { time: x.time, value: r[i] })));
      s.createPriceLine({ price: 70, color: alpha(c.down, 0.6), lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); s.createPriceLine({ price: 30, color: alpha(c.up, 0.6), lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    } else {
      const m = I.macd(closes); const h = this.chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      h.setData(k.map((x, i) => (m.hist[i] == null ? { time: x.time } : { time: x.time, value: m.hist[i], color: alpha(m.hist[i] >= 0 ? c.up : c.down, 0.55) })));
      const a = this.chart.addLineSeries({ color: c.acc, lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false }); a.setData(k.map((x, i) => (m.macd[i] == null ? { time: x.time } : { time: x.time, value: m.macd[i] })));
      const b = this.chart.addLineSeries({ color: c.warn, lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false }); b.setData(k.map((x, i) => (m.signal[i] == null ? { time: x.time } : { time: x.time, value: m.signal[i] })));
    }
    this.chart.timeScale().fitContent();
  }
  destroy() { try { this.chart.remove(); } catch {} }
}
export class CompareChart {
  constructor(el, series) {
    this.chart = base(el, 280, { rightPriceScale: { borderVisible: false, mode: 0 } });
    const cols = [COL().acc, COL().warn, COL().up, COL().c2];
    series.forEach((sr, i) => { const s = this.chart.addLineSeries({ color: cols[i % 4], lineWidth: 2, priceLineVisible: false, title: sr.label }); const k = tz(sr.k); const b = k[0].close; s.setData(k.map((x) => ({ time: x.time, value: (x.close / b - 1) * 100 }))); });
    this.chart.applyOptions({ localization: { priceFormatter: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' %' } });
    this.chart.timeScale().fitContent();
  }
  destroy() { try { this.chart.remove(); } catch {} }
}

/* ---- mini-gráfica en canvas ---- */
export function spark(cv, vals, { color, fill = true, base: b } = {}) {
  if (!cv || !vals?.length) return;
  const dpr = Math.min(devicePixelRatio || 1, 3); const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
  cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
  const v = vals.filter((n) => n != null && isFinite(n)); if (v.length < 2) return;
  const min = Math.min(...v, b ?? Infinity), max = Math.max(...v, b ?? -Infinity), r = max - min || 1;
  const c = COL(); const col = color || (v[v.length - 1] >= (b ?? v[0]) ? c.up : c.down);
  const P = (i) => [(i / (v.length - 1)) * (w - 2) + 1, h - 2 - ((v[i] - min) / r) * (h - 4)];
  if (b != null) { const yb = h - 2 - ((b - min) / r) * (h - 4); x.strokeStyle = alpha(c.tx3, 0.5); x.setLineDash([2, 3]); x.lineWidth = 1; x.beginPath(); x.moveTo(0, yb); x.lineTo(w, yb); x.stroke(); x.setLineDash([]); }
  x.beginPath(); v.forEach((_, i) => { const [px, py] = P(i); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
  if (fill) { x.lineTo(w - 1, h); x.lineTo(1, h); x.closePath(); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, alpha(col, 0.22)); g.addColorStop(1, alpha(col, 0)); x.fillStyle = g; x.fill(); }
}

/* ---- donut SVG ---- */
export function donut(parts, size = 168, thick = 18) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1; const r = (size - thick) / 2, C = 2 * Math.PI * r; let off = 0;
  const segs = parts.map((p) => { const len = (p.v / tot) * C; const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.c}" stroke-width="${thick}" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${p.l}</title></circle>`; off += len; return s; }).join('');
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--bg3)" stroke-width="${thick}"/>${segs}</svg>`;
}

/* ---- medidor semicircular (miedo/codicia, puntuación) ---- */
export function gauge(v, { size = 220, labels } = {}) {
  const cx = size / 2, cy = size / 2 + 8, r = size / 2 - 16; const ang = (t) => Math.PI * (1 - t);
  const pt = (t, rr = r) => [cx + Math.cos(ang(t)) * rr, cy - Math.sin(ang(t)) * rr];
  const stops = ['--down', '--down2', '--warn', '--up2', '--up'];
  let arcs = ''; for (let i = 0; i < 5; i++) { const a = pt(i / 5 + 0.006), b = pt((i + 1) / 5 - 0.006); arcs += `<path d="M${a[0]},${a[1]} A${r},${r} 0 0 1 ${b[0]},${b[1]}" stroke="var(${stops[i]})" stroke-width="10" fill="none" stroke-linecap="round" opacity="${Math.abs(i - Math.min(4, Math.floor(v / 20))) === 0 ? 1 : 0.28}"/>`; }
  const t = Math.max(0, Math.min(1, v / 100)); const [nx, ny] = pt(t, r - 20);
  return `<svg class="gauge" viewBox="0 0 ${size} ${size / 2 + 22}" width="100%">${arcs}<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--tx)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--tx)"/></svg>`;
}

/* ---- mapa de calor (treemap “squarified”) ---- */
export function treemap(items, W, H) {
  items = items.filter((i) => i.w > 0).sort((a, b) => b.w - a.w); const tot = items.reduce((a, i) => a + i.w, 0); const scale = (W * H) / tot;
  const nodes = items.map((i) => ({ ...i, a: i.w * scale })); const out = [];
  let x = 0, y = 0, w = W, h = H, row = [];
  const worst = (r, side) => { const s = r.reduce((a, n) => a + n.a, 0); const mx = Math.max(...r.map((n) => n.a)), mn = Math.min(...r.map((n) => n.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  const layout = (r) => { const s = r.reduce((a, n) => a + n.a, 0); if (w >= h) { const cw = s / h; let yy = y; for (const n of r) { const ch = n.a / cw; out.push({ ...n, x, y: yy, w: cw, h: ch }); yy += ch; } x += cw; w -= cw; } else { const rh = s / w; let xx = x; for (const n of r) { const cw = n.a / rh; out.push({ ...n, x: xx, y, w: cw, h: rh }); xx += cw; } y += rh; h -= rh; } };
  for (const n of nodes) { const side = Math.min(w, h); if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n); else { layout(row); row = [n]; } }
  if (row.length) layout(row);
  return out;
}
export function heatColor(p) { // p en %: verde/rojo apagados, más intensos cuanto mayor el movimiento
  const c = COL(); const t = Math.min(1, Math.abs(p ?? 0) / 3);
  if (p == null) return 'var(--bg3)';
  const mix = (a, b, k) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  return mix(css('--bg3'), p >= 0 ? c.up : c.down, 0.18 + t * 0.62);
}
