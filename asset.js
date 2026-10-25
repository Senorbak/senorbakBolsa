// Ficha de un valor (también la de Bitcoin): precio en directo, gráfica, recomendación con su fiabilidad, datos y noticias
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, toast, nameOf, subOf, sigTag, demoBanner } from './ui.js';
import { PriceChart, OscChart } from './charts.js';
import { info, isBTC, isUS, exchangeOf, isOpen } from './universe.js';
import { analyze, adviceFor } from './signals.js';
import { addSheet } from './portfolio.js';
import { alertSheet } from './alerts.js';
import { newsItem } from './news.js';
import { cacheAnalysis } from './senales.js';

const RANGES = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX'];
export function reasonText(k, raw, v) {
  const P = (x) => F.pct(x * 100, 1);
  switch (k) {
    case 'rsi': return raw < 30 ? t('f_rsiLow', F.num(raw, 0)) : raw > 70 ? t('f_rsiHigh', F.num(raw, 0)) : t('f_rsiMid', F.num(raw, 0));
    case 'macd': return v > 0 ? t('f_macdUp') : t('f_macdDown');
    case 'bb': return raw < 0.05 ? t('f_bbLow') : raw > 0.95 ? t('f_bbHigh') : t('f_bbMid', F.num(raw * 100, 0));
    case 'trend20': return raw > 0 ? t('f_t20Up', P(raw)) : t('f_t20Down', P(raw));
    case 'mom5': return t('f_mom5', P(raw));
    case 'vol': return t('f_vol', F.num(raw, 1));
    case 'news': return raw > 0 ? t('f_newsPos') : t('f_newsNeg');
    case 'ma200': return raw > 0 ? t('f_ma200Up', P(raw)) : t('f_ma200Down', P(raw));
    case 'ma50': return raw > 0 ? t('f_ma50Up', P(raw)) : t('f_ma50Down', P(raw));
    case 'cross': return raw > 0 ? t('f_crossGold') : t('f_crossDeath');
    case 'slope200': return raw > 0 ? t('f_slopeUp') : t('f_slopeDown');
    case 'mom12': return t('f_mom12', P(raw));
    case 'mom6': return t('f_mom6', P(raw));
    case 'dd': return t('f_dd', P(raw));
    case 'hot': return t('f_hot');
    case 'analyst': return t('f_analyst', F.num(raw * 100, 0));
    case 'value': return t('f_pe', F.num(raw, 1));
  }
  return k;
}
export function sigBox(r, h) {
  if (!r) return '';
  const lo = Math.min(0, r.score), hi = Math.max(0, r.score); const col = r.score >= 15 ? 'var(--up)' : r.score <= -15 ? 'var(--down)' : 'var(--warn)';
  const prob = r.prob != null ? t('probTxt', `<b>${F.pct(r.prob * 100, 0, false)}</b>`, h === 's' ? t('in2w') : t('in6m'), r.n, `<b class="${F.cls(r.avg)}">${F.pct(r.avg * 100, 1)}</b>`) : t('probNA');
  return `<div class="sigbox"><div class="h">${h === 's' ? t('shortTerm') : t('longTerm')}</div><div class="l lab-${r.label}">${t('lab_' + r.label)}</div><div class="bar"><i style="left:${50 + lo / 2}%;right:${50 - hi / 2}%;background:${col}"></i><i style="left:50%;width:1px;background:var(--tx3)"></i></div><div class="pb">${prob}${r.base != null ? `<br><span class="dim">${t('baseTxt', F.pct(r.base * 100, 0, false))}</span>` : ''}</div></div>`;
}
let chart = null, osc = [];
export async function render(v, sym, { app }) {
  const s = store.s; const st = D.refreshStatus(); const inf = info(sym); const btc = isBTC(sym);
  app.setTitle(btc ? 'Bitcoin' : sym.replace('^', ''), { back: true });
  const fav = () => store.s.watch.includes(sym);
  const ex = exchangeOf(sym);
  v.innerHTML = `${demoBanner(st)}
    <div class="ahead">${avatar(sym)}<div class="t" style="flex:1;min-width:0"><b id="nm">${esc(nameOf(sym, D.lastQuote(sym)))}</b><span>${esc(subOf(sym))}</span></div><button class="ib" id="fav" aria-label="${t('favorite')}">${fav() ? I.starF : I.star}</button></div>
    <section class="hero" style="padding-top:8px"><div class="big" id="px">—</div><div class="chg" id="chg"></div><div class="delay" id="dl" style="margin-top:6px"></div></section>
    ${btc ? `<div class="seg" id="btccur" style="margin:4px 0 0;max-width:200px"><button class="${sym === 'BTC-EUR' ? 'on' : ''}" data-s="BTC-EUR">EUR</button><button class="${sym === 'BTC-USD' ? 'on' : ''}" data-s="BTC-USD">USD</button></div>` : ''}
    <div class="chartbox" id="cb"><div class="hov" id="hov"></div></div>
    <div id="oscs"></div>
    <div class="seg ranges" id="rg">${RANGES.map((r) => `<button data-r="${r}" class="${r === (s.range || '1M') ? 'on' : ''}">${t('r_' + r)}</button>`).join('')}</div>
    <div class="tools" id="tools">
      <button class="chip ${s.chartType === 'candle' ? 'on' : ''}" data-t="candle">${t('candles')}</button>
      <button class="chip ${s.ind.sma ? 'on' : ''}" data-i="sma">${t('mas')}</button><button class="chip ${s.ind.bb ? 'on' : ''}" data-i="bb">Bollinger</button>
      <button class="chip ${s.ind.vol ? 'on' : ''}" data-i="vol">${t('volume')}</button><button class="chip ${s.ind.rsi ? 'on' : ''}" data-i="rsi">RSI</button><button class="chip ${s.ind.macd ? 'on' : ''}" data-i="macd">MACD</button>
    </div>
    <div class="actions"><button class="btn pri" id="inv">${I.plus}${t('iInvested')}</button><button class="btn" id="alr">${I.bell}${t('alert')}</button></div>
    <a class="askai" href="#/ia?s=${encodeURIComponent(sym)}&q=${encodeURIComponent(t('sg_worth', nameOf(sym, D.lastQuote(sym))))}"><div class="orb"></div><div style="flex:1"><b>${t('askAI')}</b><span>${t('askAID')}</span></div>${I.back.replace('<svg', '<svg style="transform:rotate(180deg);width:18px;height:18px"')}</a>
    <div id="mypos"></div>
    <div class="sec"><h2>${t('recommendation')}</h2><a class="more" href="#/marcador">${t('scoreboard')}</a></div>
    <div id="sig">${'<div class="skel" style="height:150px"></div>'}</div>
    <div class="sec"><h2>${t('analysts')}</h2></div><div id="an"><div class="skel" style="height:70px"></div></div>
    <div class="sec"><h2>${t('keyData')}</h2></div><div class="stats" id="kd"></div>
    <div id="about"></div>
    <div class="sec"><h2>${t('news')}</h2><a class="more" href="#/noticias">${t('seeAll')}</a></div><div id="nw"><div class="skel" style="height:80px"></div></div>
    <div class="actions" style="margin-top:18px"><a class="btn" href="#/comparar/${encodeURIComponent(sym)}">${I.compare}${t('compare')}</a><a class="btn" href="#/simulador?s=${encodeURIComponent(sym)}">${I.flask}${t('simulate')}</a></div>
    <p class="note">${t('assetNote')}</p>`;
  const stop = [];
  if (btc) $('#btccur', v).onclick = (e) => { const b = e.target.closest('button'); if (b && b.dataset.s !== sym) location.replace('#/a/' + b.dataset.s); };
  $('#fav', v).onclick = () => { store.set((x) => ({ watch: fav() ? x.watch.filter((w) => w !== sym) : [...x.watch, sym] })); $('#fav', v).innerHTML = fav() ? I.starF : I.star; toast(fav() ? t('addedFav') : t('removedFav'), 1800); };
  $('#inv', v).onclick = () => addSheet(null, () => (location.hash = '#/cartera'), { s: sym, n: nameOf(sym, D.lastQuote(sym)) });
  $('#alr', v).onclick = () => alertSheet(null, { s: sym, n: nameOf(sym, D.lastQuote(sym)) });

  // Precio
  const paintQ = (q, old) => {
    if (!q || !$('#px', v)) return; const d = q.price >= 1000 ? 2 : F.dec(q.price);
    const px = $('#px', v); px.innerHTML = `${F.num(q.price, d)}<span class="cur">${q.cur === 'USD' ? '$' : q.cur === 'EUR' ? '€' : q.cur === 'GBp' ? 'p' : esc(q.cur || '')}</span>`;
    $('#chg', v).innerHTML = `<span class="p ${F.cls(q.pct)}">${F.pct(q.pct)}</span><span class="${F.cls(q.chg)}">${F.signed(q.chg, q.cur)}</span><span class="dim">${btc ? '24 h' : t('today')}</span>`;
    if (q.name && $('#nm', v).textContent === sym) $('#nm', v).textContent = q.name;
    const live = btc || (isUS(sym) && st.fh && isOpen('US'));
    $('#dl', v).innerHTML = `<i class="live ${live || (ex && isOpen(ex)) ? '' : 'off'}"></i>${btc ? t('live247') : ex && !isOpen(ex) ? t('marketClosed') + ' · ' + t('lastPrice') : live ? t('liveNow') : t('delayed')}${q.t ? ' · ' + F.time(q.t) : ''}${q.src ? ' · ' + q.src : ''}`;
    if (old && old.price !== q.price) { px.classList.remove('tick-up', 'tick-down'); void px.offsetWidth; }
    chart?.push(q.price);
  };
  const [q0] = await D.getQuotes([sym]).catch(() => []); paintQ(q0 || D.lastQuote(sym));
  stop.push(D.watch([sym], (q) => paintQ(q)));

  // Gráfica
  let range = s.range || '1M';
  const drawChart = async () => {
    const el = $('#cb', v); if (!el) return;
    await waitLC();
    try {
      const k = await D.candles(sym, range);
      chart?.destroy(); osc.forEach((o) => o.destroy()); osc = [];
      chart = new PriceChart(el, { height: 300, intraday: ['1D', '1W', '1M'].includes(range) });
      const p = store.s.positions.find((x) => x.s === sym); const lines = [];
      if (p) { lines.push({ price: p.price, color: '#8fb9e6', title: t('yourPrice') }); if (p.stop) lines.push({ price: p.stop, color: '#ef716d', title: 'Stop' }); if (p.target) lines.push({ price: p.target, color: '#3fca9b', title: t('target') }); }
      chart.set(k, { type: store.s.chartType, ind: store.s.ind, intraday: ['1D', '1W', '1M'].includes(range), lines });
      chart.chart.subscribeClick((pt) => { if (!pt.time) return; const d = pt.seriesData.get(chart.series); const price = d ? d.value ?? d.close : null; const date = new Date((pt.time + new Date().getTimezoneOffset() * 60) * 1000); let chip = $('#ptask', v); if (!chip) { chip = document.createElement('a'); chip.id = 'ptask'; chip.className = 'chip on ptask'; $('#cb', v).appendChild(chip); } const q = t('askPointQ', nameOf(sym, D.lastQuote(sym)), F.date(date, { day: 'numeric', month: 'long', year: 'numeric' }), price != null ? F.price(price, D.lastQuote(sym)?.cur) : ''); chip.href = '#/ia?s=' + encodeURIComponent(sym) + '&q=' + encodeURIComponent(q); chip.innerHTML = I.spark.replace('<svg', '<svg width="14" height="14"') + ' ' + t('askPoint', F.date(date, { day: 'numeric', month: 'short' })); });
      const hov = $('#hov', v); chart.onHover((d) => { hov.textContent = d ? `${F.price(d.value, D.lastQuote(sym)?.cur)} · ${new Date(d.time * 1000 + new Date().getTimezoneOffset() * 60000).toLocaleString(store.s.lang === 'eu' ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'short', year: range === '5Y' || range === 'MAX' ? 'numeric' : undefined, hour: ['1D', '1W'].includes(range) ? '2-digit' : undefined, minute: ['1D', '1W'].includes(range) ? '2-digit' : undefined })}` : ''; });
      const ob = $('#oscs', v); ob.innerHTML = '';
      for (const kind of ['rsi', 'macd']) if (store.s.ind[kind]) { const d = document.createElement('div'); d.className = 'osc'; d.innerHTML = `<span class="lbl">${kind.toUpperCase()}</span>`; ob.appendChild(d); const o = new OscChart(d, kind, k); osc.push(o); chart.syncTo(o); }
      // si el rango es de un día, el cambio del héroe se refiere al día
    } catch (e) { el.innerHTML = `<div class="empty" style="padding:60px 16px"><p class="muted small">${st.demo ? '' : t('noChart')}</p></div>`; }
  };
  drawChart();
  $('#rg', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; store.set({ range }); $$('#rg button', v).forEach((x) => x.classList.toggle('on', x === b)); drawChart(); };
  $('#tools', v).onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; if (b.dataset.t) store.set({ chartType: store.s.chartType === 'candle' ? 'area' : 'candle' }); else store.set((x) => ({ ind: { ...x.ind, [b.dataset.i]: !x.ind[b.dataset.i] } })); b.classList.toggle('on'); drawChart(); };

  // Fundamentales, analistas, noticias y señal (en paralelo)
  const [fd, an0, tone] = await Promise.all([D.fundamentals(sym).catch(() => ({})), D.analysts(sym), D.newsTone(sym)]);
  const anl = an0 || fd.analyst || null;
  const q = D.lastQuote(sym) || {};
  const stats = [
    [t('open'), F.price(q.open, q.cur)], [t('prevClose'), F.price(q.prev, q.cur)], [t('dayHigh'), F.price(q.high, q.cur)], [t('dayLow'), F.price(q.low, q.cur)],
    [t('w52h'), F.price(fd.w52h ?? q.w52h, q.cur)], [t('w52l'), F.price(fd.w52l ?? q.w52l, q.cur)], [t('volume'), F.vol(q.volume)], [t('mcap'), fd.mcap || q.mcap ? F.big(fd.mcap ?? q.mcap, q.cur) : '—'],
    [t('pe'), fd.pe ? F.num(fd.pe, 1) : '—'], [t('eps'), fd.eps != null ? F.price(fd.eps, q.cur) : '—'], [t('divYield'), fd.dy != null ? F.pct(fd.dy, 2, false) : '—'], ['Beta', fd.beta != null ? F.num(fd.beta, 2) : '—'],
  ];
  if (fd.roe != null) stats.push(['ROE', F.pct(fd.roe, 1, false)]); if (fd.margin != null) stats.push([t('margin'), F.pct(fd.margin, 1, false)]);
  if (fd.nextEarnings) stats.push([t('nextEarnings'), F.date(fd.nextEarnings, { day: 'numeric', month: 'short', year: 'numeric' })]); if (fd.exDiv) stats.push([t('exDiv'), F.date(fd.exDiv, { day: 'numeric', month: 'short', year: 'numeric' })]);
  if (inf.t === 'index' || inf.t === 'fx' || inf.t === 'cmd' || btc) stats.splice(7);
  $('#kd', v).innerHTML = stats.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  if (fd.about) $('#about', v).innerHTML = `<details style="margin-top:14px"><summary class="small" style="color:var(--acc);cursor:pointer">${t('aboutCo')}${fd.industry ? ' · ' + esc(fd.industry) : ''}</summary><p class="muted small">${esc(fd.about)}</p>${fd.web ? `<a class="small" href="${esc(fd.web)}" target="_blank" rel="noopener">${esc(fd.web.replace(/^https?:\/\//, ''))}</a>` : ''}</details>`;
  // Analistas
  const anEl = $('#an', v);
  if (anl) {
    const tot = anl.strongBuy + anl.buy + anl.hold + anl.sell + anl.strongSell; const segs = [['strongBuy', 'var(--up)'], ['buy', 'var(--up2)'], ['hold', 'var(--warn)'], ['sell', 'var(--down2)'], ['strongSell', 'var(--down)']];
    anEl.innerHTML = `<div class="card"><div class="scorebar">${segs.map(([k, c]) => (anl[k] ? `<i style="flex:${anl[k]};background:${c}"></i>` : '')).join('')}</div><div class="chips" style="gap:12px;font-size:12.5px">${segs.map(([k, c]) => `<span><i class="sent" style="background:${c}"></i> ${t('an_' + k)} <b>${anl[k]}</b></span>`).join('')}</div>${fd.target ? `<p class="small" style="margin:12px 0 0">${t('targetPrice')}: <b>${F.price(fd.target, q.cur)}</b> <span class="${F.cls(fd.target - q.price)}">(${F.pct((fd.target / q.price - 1) * 100, 1)})</span> · ${t('range')} ${F.price(fd.targetLo, q.cur)} – ${F.price(fd.targetHi, q.cur)}${fd.nAnalysts ? ` · ${fd.nAnalysts} ${t('analystsN')}` : ''}</p>` : ''}<p class="note">${t('anNote', tot)}</p></div>`;
  } else anEl.innerHTML = `<p class="muted small">${inf.t === 'stock' ? t('anNone') : t('anNA')}</p>`;
  // Señal
  try {
    const k = await D.candles(sym, 'B');
    const r = analyze(k, { analyst: anl, news: tone.tone, newsN: tone.n, pe: fd.pe });
    const sigEl = $('#sig', v); if (!sigEl) return;
    if (!r) { sigEl.innerHTML = `<p class="muted small">${t('sigNA')}</p>`; }
    else {
      logSignal(sym, r); cacheAnalysis(sym, r);
      const why = (fs) => fs.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5).map(([kk, val, raw]) => `<li class="${val > 0.12 ? 'p' : val < -0.12 ? 'n' : ''}">${reasonText(kk, raw, val)}</li>`).join('');
      const stg = r.strategy;
      sigEl.innerHTML = `<div class="sig">${sigBox(r.s, 's')}${sigBox(r.l, 'l')}</div>
        <div class="card" style="margin-top:10px"><b class="small">${t('whyShort')}</b><ul class="why">${why(r.s.factors)}</ul><b class="small" style="display:block;margin-top:12px">${t('whyLong')}</b><ul class="why">${why(r.l.factors)}</ul></div>
        <div class="card" style="margin-top:10px"><b class="small">${t('levels')}</b><div class="stats" style="margin-top:4px"><div><span>${t('support')}</span><b>${F.price(r.levels.support, q.cur)}</b></div><div><span>${t('resistance')}</span><b>${F.price(r.levels.resistance, q.cur)}</b></div><div><span>${t('stopSug')}</span><b class="down">${F.price(r.levels.stop, q.cur)}</b></div><div><span>${t('targetSug')}</span><b class="up">${F.price(r.levels.target, q.cur)}</b></div></div><p class="note">${t('levelsNote')}</p></div>
        <div class="card" style="margin-top:10px"><b class="small">${t('backtestT')}</b><p class="small muted" style="margin:6px 0 0">${t('backtestD', `<b class="${F.cls(stg.ret)}">${F.pct(stg.ret * 100, 1)}</b>`, `<b class="${F.cls(stg.hold)}">${F.pct(stg.hold * 100, 1)}</b>`, stg.trades, stg.wins)}</p></div>`;
    }
    // Tu posición
    const p = store.s.positions.find((x) => x.s === sym);
    if (p && r) {
      const qq = D.lastQuote(sym) || {}; const val = D.toEUR((qq.price ?? p.price) * p.qty, qq.cur || p.cur); const cost = p.costEUR ?? D.toEUR(p.price * p.qty, p.cur);
      const since = k.filter((x) => x.time * 1000 >= (p.date || 0)); const peak = since.length ? Math.max(...since.map((x) => x.high ?? x.close)) : null;
      const adv = adviceFor(p, qq.price ?? p.price, r, peak);
      $('#mypos', v).innerHTML = `<div class="card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>${t('yourPosition')}</b><a class="small" href="#/cartera">${t('seePortfolio')}</a></div><div class="kpis" style="margin-top:10px"><div class="kpi"><span>${t('value')}</span><b>${F.eur(val, 0)}</b></div><div class="kpi"><span>${t('result')}</span><b class="${F.cls(val - cost)}">${F.signed(val - cost, 'EUR', 0)}</b></div><div class="kpi"><span>%</span><b class="${F.cls(val - cost)}">${F.pct((val / cost - 1) * 100, 1)}</b></div></div>${adv.map((a) => `<div class="adv l${a.lvl}"><div><b>${t('act_' + a.act)}</b> — ${t('adv_' + a.k)}</div></div>`).join('')}</div>`;
    }
  } catch (e) { const el = $('#sig', v); if (el) el.innerHTML = `<p class="muted small">${t('sigNA')}</p>`; }
  // Noticias del valor
  D.news().then((n) => { const el = $('#nw', v); if (!el) return; const rel = n.filter((x) => x.syms?.includes(sym)).slice(0, 6); el.innerHTML = rel.length ? rel.map(newsItem).join('') : `<p class="muted small">${t('noNewsFor')}</p>`; });
  return () => { stop.forEach((f) => f()); chart?.destroy(); chart = null; osc.forEach((o) => o.destroy()); osc = []; };
}
function waitLC() { return new Promise((res) => { if (window.LightweightCharts) return res(); const i = setInterval(() => { if (window.LightweightCharts) { clearInterval(i); res(); } }, 50); }); }
export function logSignal(sym, r) {
  const day = new Date().toISOString().slice(0, 10);
  store.set((s) => {
    const log = s.signalLog.filter((e) => !(e.s === sym && e.day === day));
    for (const h of ['s', 'l']) log.push({ s: sym, day, d: Date.now(), p: r.price, h, lab: r[h].label, sc: r[h].score, prob: r[h].prob });
    return { signalLog: log.slice(-1500) };
  });
}
