// Cartera: lo que has invertido, cuánto ganas o pierdes y qué hacer con cada valor
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, sheet, toast, ask, nameOf, demoBanner, sigTag } from './ui.js';
import { donut, PriceChart } from './charts.js';
import { info, isBTC } from './universe.js';
import { analyze, adviceFor } from './signals.js';
import { searchBox } from './search.js';

export async function portfolioNow() {
  const ps = store.s.positions; if (!ps.length) return { value: 0, cost: 0, pnl: 0, pnlPct: 0, day: 0, dayPct: 0, rows: [] };
  const need = ps.filter((p) => !D.lastQuote(p.s)).map((p) => p.s); if (need.length) await D.getQuotes(need).catch(() => {});
  let value = 0, cost = 0, day = 0; const rows = [];
  for (const p of ps) {
    const q = D.lastQuote(p.s); const cur = q?.cur || p.cur || 'EUR'; const price = q?.price ?? p.price;
    const v = D.toEUR(price * p.qty, cur), c = p.costEUR ?? D.toEUR(p.price * p.qty, p.cur || cur) + (p.fee || 0);
    const d = q?.prev ? D.toEUR((price - q.prev) * p.qty, cur) : 0;
    value += v; cost += c; day += d; rows.push({ p, q, cur, price, v, c, pnl: v - c, pnlPct: (v / c - 1) * 100, d });
  }
  return { value, cost, pnl: value - cost, pnlPct: (value / cost - 1) * 100, day, dayPct: value - day ? (day / (value - day)) * 100 : 0, rows };
}
const COLORS = ['#8fb9e6', '#3fca9b', '#e2b55e', '#b49cf0', '#ef716d', '#7fc8d8', '#f0a07a', '#86d8a8', '#c7dcf2', '#9fb0bf'];
let chart = null;
export async function render(v) {
  const s = store.s; const st = D.refreshStatus();
  if (!s.positions.length) {
    v.innerHTML = `${demoBanner(st)}<div class="empty"><div class="ill">${I.wallet}</div><b>${t('pfEmptyT')}</b><p>${t('pfEmptyD')}</p><button class="btn pri" id="add">${I.plus}${t('iInvested')}</button><p class="note">${t('pfEmptyNote')}</p></div>
      <div class="grid2" style="margin-top:10px"><a class="tilebig" href="#/simulador">${I.flask}<b>${t('simulator')}</b><span>${t('simD')}</span></a><a class="tilebig" href="#/brokers">${I.bank}<b>${t('brokers')}</b><span>${t('brokersD')}</span></a></div>`;
    $('#add', v).onclick = () => addSheet();
    return;
  }
  v.innerHTML = `${demoBanner(st)}
    <section class="hero" id="hero"></section>
    <div class="chartbox" style="height:200px" id="pc"></div>
    <div class="seg" id="prange" style="margin-top:8px">${['1M', '3M', '1Y', 'MAX'].map((r) => `<button data-r="${r}" class="${r === '3M' ? 'on' : ''}">${t('r_' + r)}</button>`).join('')}</div>
    <div class="actions"><button class="btn pri" id="add">${I.plus}${t('iInvested')}</button><a class="btn" href="#/alertas">${I.bell}${t('alerts')}</a></div>
    <div class="sec"><h2>${t('positions')}</h2><span class="dim small" id="npos"></span></div>
    <div class="list" id="pos"></div>
    <div class="sec"><h2>${t('allocation')}</h2></div>
    <div class="seg" id="atabs"><button data-k="asset" class="on">${t('byAsset')}</button><button data-k="type">${t('byType')}</button><button data-k="cur">${t('byCurrency')}</button></div>
    <div class="card" style="margin-top:10px"><div class="alloc" id="alloc"></div></div>
    <div class="grid2" style="margin-top:14px"><a class="tilebig" href="#/renta">${I.receipt}<b>${t('taxes')}</b><span>${t('taxesD')}</span></a><a class="tilebig" href="#/simulador">${I.flask}<b>${t('simulator')}</b><span>${t('simD')}</span></a></div>
    <p class="note">${t('pfNote')}</p>`;
  $('#add', v).onclick = () => addSheet();
  const stop = [];
  const paint = async () => {
    const pf = await portfolioNow(); if (!$('#hero', v)) return;
    $('#hero', v).innerHTML = `<div class="lab">${t('yourPortfolio')} · ${t('inEuros')}</div><div class="big">${F.num(pf.value, 2)}<span class="cur">€</span></div><div class="chg"><span class="p ${F.cls(pf.pnl)}">${F.pct(pf.pnlPct)}</span><span class="${F.cls(pf.pnl)}">${F.signed(pf.pnl, 'EUR')} ${t('total')}</span><span class="dim">·</span><span class="${F.cls(pf.day)}">${F.signed(pf.day, 'EUR')} ${t('today')}</span></div><div class="small dim" style="margin-top:6px">${t('invested')}: ${F.eur(pf.cost)}</div>`;
    $('#npos', v).textContent = pf.rows.length;
    const box = $('#pos', v);
    pf.rows.sort((a, b) => b.v - a.v);
    box.innerHTML = pf.rows.map((r) => `<div class="pos" data-id="${r.p.id}"><a class="row" href="#/a/${encodeURIComponent(r.p.s)}" style="border-bottom:0">${avatar(r.p.s)}<div class="nm"><b>${esc(r.p.n || nameOf(r.p.s))}</b><span>${F.num(r.p.qty, r.p.qty % 1 ? 4 : 0)} × ${F.price(r.price, r.cur)} · ${t('avg')} ${F.price(r.p.price, r.p.cur)}</span></div><span></span><div class="pr"><b>${F.eur(r.v)}</b><span class="${F.cls(r.pnl)}">${F.signed(r.pnl, 'EUR', 0)} · ${F.pct(r.pnlPct, 1)}</span></div></a><div class="adv hidden" data-adv></div><div class="chips" style="margin:8px 0 12px;justify-content:flex-end"><button class="chip" data-act="sell">${t('sell')}</button><button class="chip" data-act="edit">${t('edit')}</button></div><div style="border-bottom:1px solid var(--line)"></div></div>`).join('');
    // reparto
    allocPaint(pf);
    return pf;
  };
  let allocMode = 'asset';
  const allocPaint = (pf) => {
    const g = new Map(); for (const r of pf.rows) { const k = allocMode === 'asset' ? (r.p.n || nameOf(r.p.s)) : allocMode === 'type' ? t('type_' + (isBTC(r.p.s) ? 'crypto' : info(r.p.s).t)) : r.cur === 'GBp' ? 'GBP' : r.cur; g.set(k, (g.get(k) || 0) + r.v); }
    const parts = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([l, val], i) => ({ l, v: val, c: COLORS[i % COLORS.length] }));
    $('#alloc', v).innerHTML = donut(parts, 150, 16) + `<div class="legend">${parts.slice(0, 8).map((p) => `<div><i style="background:${p.c}"></i><span>${esc(p.l)}</span><b>${F.pct((p.v / pf.value) * 100, 1, false)}</b></div>`).join('')}</div>`;
  };
  let pf = await paint();
  $('#atabs', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; allocMode = b.dataset.k; $$('#atabs button', v).forEach((x) => x.classList.toggle('on', x === b)); allocPaint(pf); };
  $('#pos', v).onclick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; e.preventDefault(); const id = b.closest('[data-id]').dataset.id; const p = store.s.positions.find((x) => x.id === id); if (b.dataset.act === 'sell') sellSheet(p, () => render(v)); else addSheet(p, () => render(v)); };
  stop.push(D.watch(s.positions.map((p) => p.s), async () => { pf = await paint(); adviceAll(); }));
  // Consejos por posición (análisis técnico + reglas de stop/objetivo)
  const adviceAll = async () => {
    for (const p of store.s.positions) {
      const el = $(`[data-id="${p.id}"] [data-adv]`, v); if (!el) continue;
      try {
        const k = await D.candles(p.s, 'B'); const an = analyze(k, {}); const q = D.lastQuote(p.s);
        const since = k.filter((x) => x.time * 1000 >= (p.date || 0)); const peak = since.length ? Math.max(...since.map((x) => x.high ?? x.close), q?.price ?? 0) : null;
        const adv = adviceFor(p, q?.price ?? p.price, an, peak)[0];
        el.className = 'adv l' + adv.lvl; el.innerHTML = `${adv.lvl >= 2 ? I.info.replace('<svg', '<svg width="18" height="18"') : ''}<div><b>${t('act_' + adv.act)}</b> — ${t('adv_' + adv.k)}${an ? ` <span class="dim">· ${t('short')} ${sigTag(an.s.label)} ${t('long')} ${sigTag(an.l.label)}</span>` : ''}</div>`;
      } catch { el.className = 'adv hidden'; }
    }
  };
  adviceAll();
  // Gráfica del valor de la cartera
  const histPaint = async (range) => {
    const el = $('#pc', v); if (!el || !window.LightweightCharts) return;
    try {
      const ps = store.s.positions; const series = await Promise.all(ps.map((p) => D.candles(p.s, range === 'MAX' ? 'A' : range === '1M' ? '3M' : range).catch(() => [])));
      const start = range === '1M' ? Date.now() / 1000 - 31 * 86400 : 0;
      // Une los días de todos los valores y arrastra el último precio conocido (bitcoin cotiza en fin de semana y las bolsas no)
      const maps = series.map((k) => { const m = new Map(); for (const c of k) m.set(Math.floor(c.time / 86400) * 86400, c.close); return m; });
      const allDays = [...new Set(maps.flatMap((m) => [...m.keys()]))].filter((d) => d >= start).sort((a, b) => a - b);
      const last = ps.map(() => null); const pts = [];
      for (const d of allDays) {
        let tot = 0, any = false;
        ps.forEach((p, i) => { const c = maps[i].get(d); if (c != null) last[i] = c; if (d * 1000 >= (p.date || 0) - 864e5 && last[i] != null) { tot += last[i] * p.qty * D.rate(p.cur || D.lastQuote(p.s)?.cur || 'EUR'); any = true; } });
        if (any) pts.push({ time: d, close: tot });
      }
      if (pts.length < 2) { el.innerHTML = `<p class="note" style="padding:0 16px">${t('pfChartWait')}</p>`; return; }
      chart?.destroy(); chart = new PriceChart(el, { height: 200 }); chart.set(pts, { type: 'area' });
    } catch {}
  };
  histPaint('3M');
  $('#prange', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#prange button', v).forEach((x) => x.classList.toggle('on', x === b)); histPaint(b.dataset.r); };
  return () => { stop.forEach((f) => f()); chart?.destroy(); chart = null; };
}

/* ---------- añadir o editar una inversión ---------- */
export function addSheet(edit, done, preset) {
  const p = edit || { s: preset?.s || '', n: preset?.n || '', qty: '', price: '', date: Date.now(), fee: 0, stop: '', target: '', trail: '' };
  sheet(`<h2>${edit ? t('editInv') : t('iInvested')}</h2><p class="muted small" style="margin-top:0">${t('addInvD')}</p>
    <div class="field"><label>${t('whatAsset')}</label><div id="pick"></div></div>
    <div class="inrow"><div class="field"><label>${t('date')}</label><input class="inp" type="date" id="fd" value="${F.iso(p.date || Date.now())}" max="${F.iso(Date.now())}"></div><div class="field"><label>${t('buyPrice')} <span id="fcur" class="dim"></span></label><input class="inp" inputmode="decimal" id="fp" value="${p.price ?? ''}" placeholder="0,00"></div></div>
    <div class="seg" id="mode"><button data-m="qty" class="on">${t('byQty')}</button><button data-m="eur">${t('byAmount')}</button></div>
    <div class="inrow"><div class="field"><label id="ql">${t('quantity')}</label><input class="inp" inputmode="decimal" id="fq" value="${p.qty || ''}" placeholder="0"></div><div class="field"><label>${t('fee')} (€)</label><input class="inp" inputmode="decimal" id="ff" value="${p.fee || ''}" placeholder="0"></div></div>
    <p class="note" id="sum"></p>
    <details style="margin-top:10px"><summary class="small" style="color:var(--acc);cursor:pointer">${t('protect')}</summary>
      <div class="inrow"><div class="field"><label>${t('stopLoss')}</label><input class="inp" inputmode="decimal" id="fs" value="${p.stop || ''}" placeholder="${t('price')}"><span class="hint">${t('stopHint')}</span></div><div class="field"><label>${t('target')}</label><input class="inp" inputmode="decimal" id="ft" value="${p.target || ''}" placeholder="${t('price')}"><span class="hint">${t('targetHint')}</span></div></div>
      <div class="field"><label>${t('trailing')} (%)</label><input class="inp" inputmode="decimal" id="ftr" value="${p.trail || ''}" placeholder="10"><span class="hint">${t('trailHint')}</span></div>
    </details>
    <div class="actions">${edit ? `<button class="btn" id="del">${I.trash}${t('delete')}</button>` : ''}<button class="btn pri" id="ok">${t('save')}</button></div>`, (pn, close) => {
    let sym = p.s, name = p.n, cur = p.cur || null, mode = 'qty';
    const num = (id) => { const x = parseFloat(String($(id, pn).value).replace(/\./g, (m, o, str) => (str.includes(',') ? '' : '.')).replace(',', '.')); return isFinite(x) ? x : null; };
    const upd = () => { const pr = num('#fp'), q = num('#fq'); $('#fcur', pn).textContent = cur ? `(${cur === 'GBp' ? 'peniques' : cur})` : ''; if (pr && q) { const qty = mode === 'qty' ? q : D.toEUR(1, cur) ? q / D.toEUR(pr, cur) : 0; $('#sum', pn).innerHTML = `${F.num(qty, qty % 1 ? 4 : 0)} × ${F.price(pr, cur)} = <b>${F.eur(D.toEUR(pr * qty, cur))}</b>`; } else $('#sum', pn).textContent = ''; };
    const fillPrice = async () => { if (!sym) return; const d = new Date($('#fd', pn).value).getTime(); const isToday = F.iso(d) === F.iso(Date.now()); let pr = null; if (isToday) { const [q] = await D.getQuotes([sym]).catch(() => []); pr = q?.price; cur = q?.cur || cur; } else pr = await D.closeOn(sym, d + 864e5 * 0.9).catch(() => null); if (!cur) cur = D.lastQuote(sym)?.cur || info(sym).cur || 'EUR'; if (pr && !edit) $('#fp', pn).value = String(+pr.toPrecision(6)).replace('.', ','); upd(); };
    searchBox($('#pick', pn), { value: sym ? `${name || nameOf(sym)} (${sym})` : '', onPick: (x) => { sym = x.s; name = x.n; cur = info(sym).cur; fillPrice(); } });
    $('#fd', pn).onchange = fillPrice; ['#fp', '#fq'].forEach((id) => ($(id, pn).oninput = upd));
    $('#mode', pn).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; $$('#mode button', pn).forEach((x) => x.classList.toggle('on', x === b)); $('#ql', pn).textContent = mode === 'qty' ? t('quantity') : t('amountEur'); upd(); };
    if (sym) { if (!cur) cur = info(sym).cur; upd(); if (!edit) fillPrice(); }
    $('#ok', pn).onclick = () => {
      const pr = num('#fp'), q = num('#fq'); if (!sym || !pr || !q) return toast(t('fillAll'));
      const qty = mode === 'qty' ? q : q / D.toEUR(pr, cur || 'EUR'); const date = new Date($('#fd', pn).value).getTime() || Date.now();
      const fee = num('#ff') || 0; let stop = num('#fs'), target = num('#ft'); const trail = num('#ftr');
      const fx = D.rate(cur || 'EUR'); const base = { stop: stop || null, target: target || null, trail: trail || null };
      store.set((st) => {
        const positions = st.positions.slice(); const lots = st.lots.slice();
        if (edit) { const i = positions.findIndex((x) => x.id === edit.id); positions[i] = { ...edit, s: sym, n: name || nameOf(sym), cur: cur || edit.cur, qty, price: pr, date, fee, costEUR: pr * qty * fx + fee, ...base }; const li = lots.filter((l) => l.pid === edit.id); if (li.length === 1) Object.assign(lots[lots.indexOf(li[0])], { s: sym, qty, price: pr, date, fee, fx }); }
        else {
          const ex = positions.find((x) => x.s === sym);
          if (ex) { const nq = ex.qty + qty; const cost = (ex.costEUR ?? ex.price * ex.qty * fx) + pr * qty * fx + fee; Object.assign(ex, { price: (ex.price * ex.qty + pr * qty) / nq, qty: nq, costEUR: cost, ...Object.fromEntries(Object.entries(base).filter(([, x]) => x)) }); lots.push({ id: store.uid(), pid: ex.id, s: sym, qty, price: pr, date, fee, fx }); }
          else { const id = store.uid(); positions.push({ id, s: sym, n: name || nameOf(sym), cur: cur || 'EUR', qty, price: pr, date, fee, costEUR: pr * qty * fx + fee, ...base }); lots.push({ id: store.uid(), pid: id, s: sym, qty, price: pr, date, fee, fx }); }
        }
        const watch = st.watch.includes(sym) ? st.watch : [...st.watch, sym];
        return { positions, lots, watch };
      });
      close(); toast(t('saved'), 2200, '✓'); done ? done() : (location.hash === '#/cartera' ? window.app.rerender() : (location.hash = '#/cartera'));
    };
    if (edit) $('#del', pn).onclick = async () => { close(); if (await ask(t('deleteQ'), t('deleteD'), t('delete'), true)) { store.set((st) => ({ positions: st.positions.filter((x) => x.id !== edit.id), lots: st.lots.filter((l) => l.pid !== edit.id) })); done?.(); } };
  });
}
/* ---------- vender (calcula la plusvalía con FIFO) ---------- */
export function sellSheet(p, done) {
  sheet(`<h2>${t('sell')} ${esc(p.n || p.s)}</h2><p class="muted small" style="margin-top:0">${t('sellD')}</p>
    <div class="inrow"><div class="field"><label>${t('quantity')}</label><input class="inp" id="sq" inputmode="decimal" value="${p.qty}"></div><div class="field"><label>${t('sellPrice')}</label><input class="inp" id="sp" inputmode="decimal" value="${String(+(D.lastQuote(p.s)?.price ?? p.price).toPrecision(6)).replace('.', ',')}"></div></div>
    <div class="inrow"><div class="field"><label>${t('date')}</label><input class="inp" type="date" id="sd" value="${F.iso(Date.now())}"></div><div class="field"><label>${t('fee')} (€)</label><input class="inp" id="sf" inputmode="decimal" placeholder="0"></div></div>
    <p class="note" id="res"></p><div class="actions"><button class="btn down" id="ok">${t('registerSale')}</button></div>`, (pn, close) => {
    const num = (id) => { const x = parseFloat(String($(id, pn).value).replace(',', '.')); return isFinite(x) ? x : null; };
    const calc = () => { const q = Math.min(num('#sq') || 0, p.qty), pr = num('#sp') || 0; const g = fifo(p, q, pr, num('#sf') || 0); $('#res', pn).innerHTML = q ? `${t('gainLoss')}: <b class="${F.cls(g.gain)}">${F.signed(g.gain, 'EUR')}</b>` : ''; return g; };
    ['#sq', '#sp', '#sf'].forEach((id) => ($(id, pn).oninput = calc)); calc();
    $('#ok', pn).onclick = () => {
      const q = Math.min(num('#sq') || 0, p.qty), pr = num('#sp'); if (!q || !pr) return toast(t('fillAll'));
      const g = fifo(p, q, pr, num('#sf') || 0); const date = new Date($('#sd', pn).value).getTime() || Date.now();
      store.set((st) => {
        const lots = st.lots.map((l) => ({ ...l })); for (const u of g.used) { const l = lots.find((x) => x.id === u.id); if (l) l.qty -= u.qty; }
        const positions = st.positions.map((x) => (x.id === p.id ? { ...x, qty: x.qty - q, costEUR: (x.costEUR ?? x.price * x.qty * D.rate(x.cur)) * ((x.qty - q) / x.qty) } : x)).filter((x) => x.qty > 1e-9);
        return { lots: lots.filter((l) => l.qty > 1e-9), positions, sales: [...st.sales, { id: store.uid(), s: p.s, n: p.n, cur: p.cur, qty: q, price: pr, date, fee: num('#sf') || 0, fx: D.rate(p.cur || 'EUR'), cost: g.cost, gain: g.gain, lots: g.used }] };
      });
      close(); toast(t('saleSaved'), 2600, '✓'); done?.();
    };
  });
}
function fifo(p, q, price, fee) {
  const lots = store.s.lots.filter((l) => l.pid === p.id).sort((a, b) => a.date - b.date); let left = q, cost = 0; const used = [];
  for (const l of lots) { if (left <= 0) break; const take = Math.min(left, l.qty); cost += take * l.price * (l.fx || 1) + (l.fee || 0) * (take / l.qty); used.push({ id: l.id, qty: take, price: l.price, date: l.date }); left -= take; }
  if (left > 0) cost += left * p.price * D.rate(p.cur || 'EUR');
  const proceeds = q * price * D.rate(p.cur || 'EUR') - fee; return { cost, gain: proceeds - cost, used };
}
