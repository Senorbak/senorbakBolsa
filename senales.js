// Señales: qué comprar y qué vender ahora, a corto y a largo plazo, con su fiabilidad histórica
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, nameOf, sigTag, demoBanner } from './ui.js';
import { UNIVERSE, isUS } from './universe.js';
import { analyze, adviceFor } from './signals.js';
import { reasonText, logSignal } from './asset.js';

const CK = 'sban';
const day = () => new Date().toISOString().slice(0, 10);
function getCache() { try { const o = JSON.parse(localStorage.getItem(CK) || '{}'); return o.day === day() ? o : { day: day(), r: {} }; } catch { return { day: day(), r: {} }; } }
function setCache(c) { try { localStorage.setItem(CK, JSON.stringify(c)); } catch {} }
export function cacheAnalysis(s, r) { const c = getCache(); c.r[s] = slim(r); setCache(c); }
const slim = (r) => ({ price: r.price, s: { score: r.s.score, label: r.s.label, prob: r.s.prob, avg: r.s.avg, n: r.s.n, top: r.s.factors.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] }, l: { score: r.l.score, label: r.l.label, prob: r.l.prob, avg: r.l.avg, n: r.l.n, top: r.l.factors.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] } });
export async function analyzeMany(list, onEach) {
  const c = getCache(); const out = {}; let i = 0;
  const queue = list.slice(); const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const s = queue.shift();
      if (c.r[s]) { out[s] = c.r[s]; onEach?.(s, out[s], ++i); continue; }
      try { const k = await D.candles(s, 'B'); const an = isUS(s) ? await D.analysts(s) : null; const tone = await D.newsTone(s).catch(() => ({})); const r = analyze(k, { analyst: an, news: tone.tone, newsN: tone.n, pe: D.lastQuote(s)?.pe }); if (r) { logSignal(s, r); out[s] = c.r[s] = slim(r); setCache(c); } } catch {}
      onEach?.(s, out[s], ++i); await new Promise((r) => setTimeout(r, 0));
    }
  });
  await Promise.all(workers); return out;
}
export async function render(v) {
  const s = store.s; const st = D.refreshStatus(); let h = s.horizon || 's';
  const sets = { mine: () => [...new Set([...s.positions.map((p) => p.s), ...s.watch])], es: () => UNIVERSE.filter((u) => u.g === 'es').map((u) => u.s), us: () => UNIVERSE.filter((u) => u.g === 'us').map((u) => u.s), eu: () => UNIVERSE.filter((u) => u.g === 'eu' || u.g === 'eu2').map((u) => u.s), other: () => UNIVERSE.filter((u) => ['idx', 'cmd', 'etf', 'crypto'].includes(u.g) && u.s !== '^VIX').map((u) => u.s) };
  let set = 'mine';
  v.innerHTML = `${demoBanner(st)}
    <div class="sec" style="margin-top:12px"><h2>${t('signalsT')}</h2><a class="more" href="#/marcador">${t('scoreboard')}</a></div>
    <p class="muted small" style="margin:0 0 12px">${t('signalsD')}</p>
    <div class="seg" id="hz"><button data-h="s" class="${h === 's' ? 'on' : ''}">${t('shortTerm')}</button><button data-h="l" class="${h === 'l' ? 'on' : ''}">${t('longTerm')}</button></div>
    <div class="chips" id="sets" style="margin-top:10px">${[['mine', t('mine')], ['es', 'Madrid'], ['us', 'EE. UU.'], ['eu', 'Europa'], ['other', t('otherAssets')]].map(([k, l]) => `<button class="chip ${k === set ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div id="pfadv"></div>
    <div id="prog" class="small dim" style="margin-top:12px"></div>
    <div class="sec"><h2 class="up">${t('toBuy')}</h2></div><div class="list" id="buy"></div>
    <div class="sec"><h2 class="down">${t('toSell')}</h2></div><div class="list" id="sell"></div>
    <div class="sec"><h2>${t('neutral')}</h2></div><div class="list" id="hold"></div>
    <p class="note">${t('signalsNote')}</p>`;
  let res = {}; let alive = true;
  const item = (sym, r) => { const x = r[h]; const top = x.top ? reasonText(x.top[0], x.top[2], x.top[1]) : ''; return `<a class="row sigrow" href="#/a/${encodeURIComponent(sym)}" style="grid-template-columns:40px 1fr auto">${avatar(sym)}<div class="nm"><b>${esc(nameOf(sym, D.lastQuote(sym)))}</b><span>${esc(top)}</span></div><div class="pr">${sigTag(x.label)}<small>${x.prob != null ? t('upProb', F.pct(x.prob * 100, 0, false)) : t('score') + ' ' + x.score}</small></div></a>`; };
  const paint = () => {
    const rows = Object.entries(res).filter(([, r]) => r);
    const by = (f) => rows.filter(([, r]) => f(r[h].label));
    const sort = (a, dir) => a.sort((x, y) => dir * (y[1][h].score - x[1][h].score));
    $('#buy', v).innerHTML = sort(by((l) => l.includes('buy')), 1).map(([k, r]) => item(k, r)).join('') || `<p class="dim small">${t('noneNow')}</p>`;
    $('#sell', v).innerHTML = sort(by((l) => l.includes('sell')), -1).map(([k, r]) => item(k, r)).join('') || `<p class="dim small">${t('noneNow')}</p>`;
    $('#hold', v).innerHTML = sort(by((l) => l === 'hold'), 1).map(([k, r]) => item(k, r)).join('') || `<p class="dim small">—</p>`;
  };
  const run = async () => {
    res = {}; paint(); const list = sets[set]();
    if (!list.length) { $('#prog', v).textContent = t('emptySet'); return; }
    await analyzeMany(list, (sym, r, i) => { if (!alive) return; if (r) res[sym] = r; $('#prog', v).textContent = i < list.length ? t('analyzing', i, list.length) : t('analyzedN', list.length, F.time(Date.now())); paint(); });
  };
  // Consejos de venta sobre tu cartera
  const pfAdv = async () => {
    const ps = store.s.positions; if (!ps.length) return; await D.getQuotes(ps.map((p) => p.s)).catch(() => {});
    const out = [];
    for (const p of ps) { const r = getCache().r[p.s]; const q = D.lastQuote(p.s); const adv = adviceFor(p, q?.price ?? p.price, r ? { s: r.s, l: r.l } : null, null)[0]; if (adv.act !== 'hold') out.push([p, adv]); }
    $('#pfadv', v).innerHTML = out.length ? `<div class="sec"><h2>${t('pfActions')}</h2></div>${out.map(([p, a]) => `<a class="adv l${a.lvl}" href="#/a/${encodeURIComponent(p.s)}" style="margin-top:8px;color:inherit">${avatar(p.s).replace('class="av', 'style="width:32px;height:32px;font-size:10px" class="av')}<div><b>${esc(p.n || p.s)}: ${t('act_' + a.act)}</b><br><span class="muted">${t('adv_' + a.k)}</span></div></a>`).join('')}` : '';
  };
  $('#hz', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; h = b.dataset.h; store.set({ horizon: h }); $$('#hz button', v).forEach((x) => x.classList.toggle('on', x === b)); paint(); };
  $('#sets', v).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; set = b.dataset.k; $$('#sets .chip', v).forEach((x) => x.classList.toggle('on', x === b)); run(); };
  run().then(pfAdv);
  return () => { alive = false; };
}
