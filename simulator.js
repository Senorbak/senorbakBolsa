// Simulador: invierte dinero ficticio con precios reales y comprueba si las recomendaciones funcionan
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, sheet, toast, ask, nameOf, sigTag } from './ui.js';
import { searchBox } from './search.js';
import { analyzeMany } from './senales.js';
import { UNIVERSE } from './universe.js';

export async function render(v, _, { app, query }) {
  app.setTitle(t('simulator'), { back: true });
  const sim = () => store.s.sim; if (!sim().created) store.set((s) => ({ sim: { ...s.sim, created: Date.now() } }));
  v.innerHTML = `<section class="hero" id="hero"></section><p class="muted small" style="margin:0">${t('simIntro')}</p>
    <div class="actions"><button class="btn up" id="buy">${I.buy}${t('buy')}</button><button class="btn" id="auto">${I.signal}${t('simAuto')}</button></div>
    <div class="sec"><h2>${t('positions')}</h2></div><div class="list" id="sp"></div>
    <div class="sec"><h2>${t('robotT')}</h2></div><div class="card" id="robot"><p class="small muted" style="margin:0">${t('robotD')}</p><button class="btn wide" id="rb" style="margin-top:12px">${t('robotRun')}</button><div id="rbres"></div></div>
    <div class="sec"><h2>${t('history')}</h2></div><div id="hist"></div>
    <button class="btn wide" id="rst" style="margin-top:16px">${t('simReset')}</button>`;
  const paint = async () => {
    const s = sim(); await D.getQuotes(s.pos.map((p) => p.s)).catch(() => {});
    let val = 0; const rows = s.pos.map((p) => { const q = D.lastQuote(p.s); const pr = q?.price ?? p.price; const vv = D.toEUR(pr * p.qty, p.cur); val += vv; return { p, q, pr, vv, pnl: vv - p.costEUR }; });
    const total = s.cash + val; const ret = (total / s.start - 1) * 100;
    $('#hero', v).innerHTML = `<div class="lab">${t('simValue')} · ${t('since')} ${F.date(s.created || Date.now(), { day: 'numeric', month: 'short', year: 'numeric' })}</div><div class="big">${F.num(total, 2)}<span class="cur">€</span></div><div class="chg"><span class="p ${F.cls(ret)}">${F.pct(ret)}</span><span class="muted">${t('cash')}: ${F.eur(s.cash)}</span></div>`;
    $('#sp', v).innerHTML = rows.length ? rows.map((r) => `<div class="row" style="grid-template-columns:40px 1fr auto auto">${avatar(r.p.s)}<a class="nm" href="#/a/${encodeURIComponent(r.p.s)}" style="color:inherit"><b>${esc(r.p.n)}</b><span>${F.num(r.p.qty, 4)} × ${F.price(r.pr, r.p.cur)}</span></a><div class="pr"><b>${F.eur(r.vv)}</b><span class="${F.cls(r.pnl)}">${F.signed(r.pnl, 'EUR', 0)}</span></div><button class="chip" data-sell="${r.p.id}">${t('sell')}</button></div>`).join('') : `<p class="muted small">${t('simEmpty')}</p>`;
    $('#hist', v).innerHTML = s.hist.length ? `<table class="table"><tr><th>${t('date')}</th><th>${t('op')}</th><th class="r">${t('amount')}</th></tr>${s.hist.slice().reverse().slice(0, 40).map((h) => `<tr><td>${F.date(h.t)}</td><td><b class="${h.side === 'buy' ? 'up' : 'down'}">${h.side === 'buy' ? t('buy') : t('sell')}</b> ${esc(h.n)}${h.auto ? ' <span class="tag n">auto</span>' : ''}</td><td class="r">${F.eur(h.eur)}${h.pnl != null ? `<br><span class="${F.cls(h.pnl)} small">${F.signed(h.pnl, 'EUR', 0)}</span>` : ''}</td></tr>`).join('')}</table>` : `<p class="muted small">—</p>`;
  };
  const trade = (side, p, qty, price, cur, name, auto) => store.set((st) => {
    const s = structuredClone(st.sim); const eur = D.toEUR(price * qty, cur);
    if (side === 'buy') { if (eur > s.cash + 0.01) { toast(t('noCash')); return {}; } s.cash -= eur; const ex = s.pos.find((x) => x.s === p); if (ex) { ex.costEUR += eur; ex.price = (ex.price * ex.qty + price * qty) / (ex.qty + qty); ex.qty += qty; } else s.pos.push({ id: store.uid(), s: p, n: name, cur, qty, price, costEUR: eur, date: Date.now() }); s.hist.push({ t: Date.now(), side, s: p, n: name, qty, price, eur, auto }); }
    else { const ex = s.pos.find((x) => x.s === p); if (!ex) return {}; const q2 = Math.min(qty, ex.qty); const cost = ex.costEUR * (q2 / ex.qty); const got = D.toEUR(price * q2, cur); s.cash += got; ex.costEUR -= cost; ex.qty -= q2; if (ex.qty < 1e-9) s.pos = s.pos.filter((x) => x !== ex); s.hist.push({ t: Date.now(), side, s: p, n: name, qty: q2, price, eur: got, pnl: got - cost, auto }); }
    return { sim: s };
  });
  const buySheet = (preset) => sheet(`<h2>${t('simBuy')}</h2><div class="field"><label>${t('whatAsset')}</label><div id="pk"></div></div><div class="field"><label>${t('amountEur')}</label><input class="inp" id="am" inputmode="decimal" placeholder="1000"><span class="hint">${t('cash')}: ${F.eur(sim().cash)}</span></div><p class="note" id="pq"></p><button class="btn up wide" id="ok" style="margin-top:8px">${t('buy')}</button>`, (pn, close) => {
    let sym = preset, name = preset ? nameOf(preset) : '';
    const info = async () => { if (!sym) return; const [q] = await D.getQuotes([sym]).catch(() => []); $('#pq', pn).textContent = q ? t('nowIs', F.price(q.price, q.cur), F.pct(q.pct)) : ''; };
    searchBox($('#pk', pn), { value: sym ? `${name} (${sym})` : '', onPick: (x) => { sym = x.s; name = x.n; info(); } }); info();
    $('#ok', pn).onclick = async () => { const am = parseFloat($('#am', pn).value.replace(',', '.')); if (!sym || !(am > 0)) return toast(t('fillAll')); const [q] = await D.getQuotes([sym]).catch(() => []); if (!q?.price) return toast(t('noPrice')); const qty = am / D.toEUR(q.price, q.cur); trade('buy', sym, qty, q.price, q.cur, name || nameOf(sym, q)); close(); paint(); };
  });
  $('#buy', v).onclick = () => buySheet(query.get('s'));
  if (query.get('s')) buySheet(query.get('s'));
  $('#sp', v).onclick = async (e) => { const b = e.target.closest('[data-sell]'); if (!b) return; const p = sim().pos.find((x) => x.id === b.dataset.sell); const [q] = await D.getQuotes([p.s]).catch(() => []); if (!q?.price) return toast(t('noPrice')); if (await ask(t('sell') + ' ' + p.n, t('simSellQ', F.price(q.price, q.cur)), t('sell'))) { trade('sell', p.s, p.qty, q.price, q.cur, p.n); paint(); } };
  $('#rst', v).onclick = async () => { if (await ask(t('simReset'), t('simResetD'), t('simReset'), true)) { store.set({ sim: { cash: 10000, start: 10000, created: Date.now(), pos: [], hist: [] } }); paint(); } };
  // Seguir las señales automáticamente (una vez al día, con las del momento)
  $('#auto', v).onclick = async () => {
    if (!(await ask(t('simAuto'), t('simAutoD'), t('apply')))) return;
    toast(t('analyzingShort'), 2500);
    const list = [...new Set([...store.s.watch, ...UNIVERSE.filter((u) => u.g === 'es').map((u) => u.s).slice(0, 20)])];
    const r = await analyzeMany(list); let n = 0;
    for (const p of sim().pos) { const x = r[p.s]; if (x && x.s.label.includes('sell')) { const [q] = await D.getQuotes([p.s]).catch(() => []); if (q?.price) { trade('sell', p.s, p.qty, q.price, q.cur, p.n, true); n++; } } }
    const buys = Object.entries(r).filter(([, x]) => x?.s.label === 'sbuy' || (x?.s.label === 'buy' && x.l.score > 0)).sort((a, b) => b[1].s.score - a[1].s.score).slice(0, 4);
    for (const [sym] of buys) { if (sim().pos.some((x) => x.s === sym)) continue; const amt = Math.min(sim().cash * 0.2, sim().start * 0.1); if (amt < 50) break; const [q] = await D.getQuotes([sym]).catch(() => []); if (!q?.price) continue; trade('buy', sym, amt / D.toEUR(q.price, q.cur), q.price, q.cur, nameOf(sym, q), true); n++; }
    toast(t('simAutoDone', n), 3000); paint();
  };
  // Robot: qué habría pasado siguiendo las señales los últimos 2 años
  $('#rb', v).onclick = async () => {
    $('#rbres', v).innerHTML = `<p class="small dim">${t('analyzingShort')}</p>`;
    const list = [...new Set([...store.s.watch.filter((x) => !x.startsWith('^')), ...UNIVERSE.filter((u) => u.g === 'es').map((u) => u.s).slice(0, 15)])].slice(0, 24);
    const { analyze } = await import('./signals.js'); const rows = [];
    for (const sym of list) { try { const k = await D.candles(sym, 'B'); const r = analyze(k, {}); if (r) rows.push([sym, r.strategy]); } catch {} }
    if (!rows.length) { $('#rbres', v).innerHTML = `<p class="small dim">${t('noData')}</p>`; return; }
    const avg = (f) => rows.reduce((a, [, x]) => a + f(x), 0) / rows.length; const wins = rows.reduce((a, [, x]) => a + x.wins, 0), trades = rows.reduce((a, [, x]) => a + x.trades, 0);
    const beat = rows.filter(([, x]) => x.ret > x.hold).length;
    $('#rbres', v).innerHTML = `<div class="kpis" style="margin-top:12px"><div class="kpi"><span>${t('robotRet')}</span><b class="${F.cls(avg((x) => x.ret))}">${F.pct(avg((x) => x.ret) * 100, 1)}</b></div><div class="kpi"><span>${t('holdRet')}</span><b class="${F.cls(avg((x) => x.hold))}">${F.pct(avg((x) => x.hold) * 100, 1)}</b></div><div class="kpi"><span>${t('hitRate')}</span><b>${trades ? F.pct((wins / trades) * 100, 0, false) : '—'}</b></div></div><p class="small muted">${t('robotSum', beat, rows.length, trades)}</p>
      <table class="table" style="margin-top:6px"><tr><th>${t('asset')}</th><th class="r">${t('robot')}</th><th class="r">${t('hold')}</th></tr>${rows.sort((a, b) => b[1].ret - a[1].ret).map(([s2, x]) => `<tr><td>${esc(nameOf(s2))}</td><td class="r ${F.cls(x.ret)}">${F.pct(x.ret * 100, 1)}</td><td class="r ${F.cls(x.hold)}">${F.pct(x.hold * 100, 1)}</td></tr>`).join('')}</table><p class="note">${t('robotNote')}</p>`;
  };
  paint();
  return D.watch(sim().pos.map((p) => p.s), () => {});
}
