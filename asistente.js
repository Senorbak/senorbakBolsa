// Asistente IA: preguntas sobre bolsa y tu cartera, con gráficas y fuentes
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, esc, toast, nameOf } from './ui.js';
import { ask, engine, ENGINE_NAME } from './ai.js';
import { md } from './md.js';
import { PriceChart, OscChart, CompareChart, donut } from './charts.js';
import { analyze } from './signals.js';
import { portfolioNow } from './portfolio.js';

const KEY = 'sbai';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { turns: [], view: [] }; } catch { return { turns: [], view: [] }; } };
const save = (c) => { try { c.turns = c.turns.slice(-24); c.view = c.view.slice(-30); localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };
const live = [];
const waitLC = () => new Promise((r) => { if (window.LightweightCharts) return r(); const i = setInterval(() => { if (window.LightweightCharts) { clearInterval(i); r(); } }, 50); });

// Dibuja una gráfica pedida por la IA
export async function renderChart(el, spec) {
  await waitLC();
  const syms = (spec.symbols || []).slice(0, 4); const range = spec.range || '1Y';
  el.innerHTML = `<div class="aichart"><div class="ach"><b>${esc(spec.title || '')}</b>${syms.length === 1 ? `<a class="small" href="#/a/${encodeURIComponent(syms[0])}">${t('openAsset')}</a>` : ''}</div><div class="acb"></div><div class="aco"></div><div class="acq hidden"></div></div>`;
  const box = $('.acb', el), ob = $('.aco', el);
  try {
    if (spec.kind === 'compare' && syms.length) {
      box.style.height = '240px'; const series = [];
      for (const s of syms) { try { series.push({ s, label: nameOf(s).split(' ')[0], k: await D.candles(s, range) }); } catch {} }
      const c = new CompareChart(box, series); live.push(c);
    } else if (spec.kind === 'allocation') {
      const pf = await portfolioNow(); const cols = ['#8fb9e6', '#3fca9b', '#e2b55e', '#b49cf0', '#ef716d', '#7fc8d8', '#f0a07a'];
      const parts = pf.rows.sort((a, b) => b.v - a.v).map((r, i) => ({ l: r.p.n || r.p.s, v: r.v, c: cols[i % cols.length] }));
      box.innerHTML = parts.length ? `<div class="alloc" style="padding:8px 0">${donut(parts, 130, 14)}<div class="legend">${parts.map((p) => `<div><i style="background:${p.c}"></i><span>${esc(p.l)}</span><b>${F.pct((p.v / pf.value) * 100, 1, false)}</b></div>`).join('')}</div></div>` : `<p class="small dim">${t('pfEmptyT')}</p>`;
    } else if (spec.kind === 'bars' && spec.bars?.length) {
      const max = Math.max(...spec.bars.map((b) => Math.abs(b.value))) || 1;
      box.innerHTML = `<div class="bars">${spec.bars.slice(0, 12).map((b) => `<div class="bar"><span>${esc(b.label)}</span><div><i class="${b.value < 0 ? 'neg' : ''}" style="width:${(Math.abs(b.value) / max) * 100}%"></i></div><b class="${b.value < 0 ? 'down' : ''}">${F.num(b.value, Math.abs(b.value) < 10 ? 2 : 1)}${spec.unit ? ' ' + esc(spec.unit) : ''}</b></div>`).join('')}</div>`;
    } else if (syms.length) {
      const s = syms[0]; box.style.height = '230px'; const k = await D.candles(s, range); const ind = spec.indicators || [];
      const c = new PriceChart(box, { height: 230, intraday: ['1D', '1W', '1M'].includes(range) }); live.push(c);
      const lines = [];
      if (ind.includes('levels')) { try { const r = analyze(await D.candles(s, 'B'), {}); if (r) lines.push({ price: r.levels.support, color: '#3fca9b', title: t('support').split(' ')[0] }, { price: r.levels.resistance, color: '#ef716d', title: t('resistance').split(' ')[0] }, { price: r.levels.stop, color: '#e2b55e', title: 'Stop' }); } catch {} }
      c.set(k, { type: 'area', ind: { sma: ind.includes('sma'), bb: ind.includes('bb'), vol: ind.includes('volume') }, intraday: ['1D', '1W', '1M'].includes(range), lines });
      for (const kind of ['rsi', 'macd']) if (ind.includes(kind)) { const d = document.createElement('div'); d.className = 'osc'; d.style.margin = '0'; d.innerHTML = `<span class="lbl">${kind.toUpperCase()}</span>`; ob.appendChild(d); const o = new OscChart(d, kind, k); live.push(o); c.syncTo(o); }
      // tocar un punto → preguntar por él
      const q = $('.acq', el);
      c.chart.subscribeClick((p) => { if (!p.time) return; const d = c.series && p.seriesData.get(c.series); const price = d ? d.value ?? d.close : null; const date = new Date((p.time - (-new Date().getTimezoneOffset() * 60)) * 1000); q.classList.remove('hidden'); q.innerHTML = `<button class="chip on" data-ask>${I.signal.replace('<svg', '<svg width="14" height="14"')} ${t('askPoint', F.date(date, { day: 'numeric', month: 'short', year: 'numeric' }))}</button>`; q.querySelector('[data-ask]').onclick = () => window.dispatchEvent(new CustomEvent('ai-ask', { detail: t('askPointQ', nameOf(s), F.date(date, { day: 'numeric', month: 'long', year: 'numeric' }), price != null ? F.price(price, D.lastQuote(s)?.cur) : '') })); });
    }
  } catch { box.innerHTML = `<p class="small dim">${t('noChart')}</p>`; }
}
function bubble(m) {
  if (m.role === 'user') return `<div class="msg me"><div>${esc(m.text)}</div></div>`;
  const refs = (r) => { if (r[0] === 'N') { const n = m.news?.[+r.slice(1) - 1]; return n ? { url: n.url } : null; } return m.sources?.[+r.slice(1) - 1] ? {} : null; };
  const src = (m.sources?.length || m.news?.length) ? `<details class="srcs"><summary>${t('sourcesN', (m.sources?.length || 0) + (m.news?.length || 0))}</summary><ol>${(m.sources || []).map((s, i) => `<li><b>D${i + 1}</b> ${esc(s)}</li>`).join('')}${(m.news || []).map((n, i) => `<li><b>N${i + 1}</b> ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title)}${n.src ? ` <span class="dim">· ${esc(n.src)}</span>` : ''}</li>`).join('')}</ol></details>` : '';
  return `<div class="msg ai"><div class="md">${md(m.text, refs)}</div><div class="charts"></div>${src}<div class="meta">${esc(ENGINE_NAME[m.engine] || '')}${m.t ? ' · ' + F.time(m.t) : ''}</div></div>`;
}
async function placeCharts(el, m) {
  const slots = $$('[data-chart-slot]', el); const used = new Set();
  for (const sl of slots) { const n = +sl.dataset.chartSlot; const spec = m.charts?.[n - 1]; if (!spec) { sl.remove(); continue; } used.add(n); const d = document.createElement('div'); sl.replaceWith(d); renderChart(d, spec); }
  const box = $('.charts', el); (m.charts || []).forEach((spec, i) => { if (used.has(i + 1)) return; const d = document.createElement('div'); box.appendChild(d); renderChart(d, spec); });
}
const STATUS = { get_quote: 'st_quote', search_symbol: 'st_search', get_history: 'st_history', analyze: 'st_analyze', get_fundamentals: 'st_fund', get_news: 'st_news', get_portfolio: 'st_pf', get_market_overview: 'st_market', get_calendar: 'st_cal', simulate_investment: 'st_sim', show_chart: 'st_chart', web_search: 'st_web' };

export async function render(v, _, { app, query }) {
  const conv = load(); const eng = engine();
  const ctxSym = query.get('s'); const ctxText = ctxSym ? `el usuario viene de la ficha de ${nameOf(ctxSym)} (${ctxSym})` : '';
  const sugg = [
    store.s.positions.length ? t('sg_pf') : t('sg_start'), ctxSym ? t('sg_worth', nameOf(ctxSym)) : t('sg_worth', 'Inditex'), t('sg_compare'), t('sg_news'), t('sg_rsi'), t('sg_sim'), t('sg_market'), t('sg_btc'),
  ];
  v.innerHTML = `<div class="aihead"><div><b>${t('aiTitle')}</b><span class="small dim">${eng ? ENGINE_NAME[eng] : t('aiOff')}</span></div><button class="chip" id="new">${t('newChat')}</button></div>
    <div id="msgs" class="msgs"></div>
    <div id="empty" class="${conv.view.length ? 'hidden' : ''}"><div class="aihero"><div class="orb"></div><h2>${t('aiHello')}</h2><p class="muted small">${t('aiIntro')}</p></div><div class="sugg">${sugg.map((x) => `<button class="chip" data-s="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
    ${eng ? '' : `<div class="card" style="margin-top:12px"><b>${t('aiSetupT')}</b><p class="small muted">${t('aiSetupD')}</p><a class="btn pri wide" href="#/ajustes">${t('aiSetupBtn')}</a></div>`}
    <form id="bar" class="aibar"><textarea id="q" rows="1" placeholder="${t('aiPh')}" ${eng ? '' : 'disabled'}></textarea><button class="send" ${eng ? '' : 'disabled'} aria-label="${t('send')}">${I.buy}</button></form>`;
  const msgs = $('#msgs', v);
  const add = (m) => { const d = document.createElement('div'); d.innerHTML = bubble(m); const el = d.firstElementChild; msgs.appendChild(el); if (m.role === 'assistant') placeCharts(el, m); return el; };
  conv.view.forEach(add);
  const scroll = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  scroll();
  let busy = false;
  const send = async (text) => {
    text = (text || '').trim(); if (!text || busy || !eng) return; busy = true; $('#empty', v).classList.add('hidden');
    const um = { role: 'user', text, t: Date.now() }; conv.view.push(um); add(um);
    const st = document.createElement('div'); st.className = 'msg ai typing'; st.innerHTML = `<div class="dots"><i></i><i></i><i></i></div><span class="small dim" data-st>${t('st_think')}</span>`; msgs.appendChild(st); scroll();
    try {
      const r = await ask(conv.turns, text, { context: ctxText, onStatus: (x) => { const el = $('[data-st]', st); if (!el) return; el.textContent = x.k === 'tool' ? t(STATUS[x.name] || 'st_think', x.args?.symbol ? nameOf(x.args.symbol) : (x.args?.symbols || []).map((s) => nameOf(s).split(' ')[0]).join(', ')) : t('st_think'); } });
      st.remove(); const am = { role: 'assistant', text: r.text, sources: r.sources, news: r.news, charts: r.charts, engine: r.engine, t: Date.now() };
      conv.view.push(am); conv.turns.push(...r.turn); save(conv); add(am); scroll();
    } catch (e) { st.remove(); const msg = e.message === 'noengine' ? t('aiOff') : /401|invalid/i.test(e.message) ? t('aiBadKey') : /429|rate/i.test(e.message) ? t('aiBusy') : t('aiErr') + ' ' + e.message; const em = { role: 'assistant', text: '⚠️ ' + msg, t: Date.now() }; add(em); }
    busy = false;
  };
  const q = $('#q', v);
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(140, q.scrollHeight) + 'px'; };
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#bar', v).requestSubmit(); } };
  $('#bar', v).onsubmit = (e) => { e.preventDefault(); const x = q.value; q.value = ''; q.style.height = 'auto'; send(x); };
  $('.sugg', v)?.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) send(b.dataset.s); });
  $('#new', v).onclick = () => { localStorage.removeItem(KEY); app.rerender(); };
  const onAsk = (e) => send(e.detail); window.addEventListener('ai-ask', onAsk);
  if (query.get('q')) setTimeout(() => send(query.get('q')), 300);
  return () => { window.removeEventListener('ai-ask', onAsk); live.splice(0).forEach((c) => c.destroy?.()); };
}
