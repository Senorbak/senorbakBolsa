// Mercados: pulso del día, índices, bitcoin, tu lista, mapa de calor, miedo/codicia
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, row, bump, avatar, demoBanner, esc, nameOf } from './ui.js';
import { spark, treemap, heatColor, gauge } from './charts.js';
import { UNIVERSE, BY, exchangeOf, isOpen } from './universe.js';
import { portfolioNow } from './portfolio.js';

const IDX = ['^IBEX', '^GSPC', '^IXIC', '^STOXX50E', '^GDAXI', '^DJI', '^FTSE', '^N225', '^HSI'];
const CMD = ['GC=F', 'BZ=F', 'EURUSD=X', '^TNX'];
export async function render(v) {
  const s = store.s; const st = D.refreshStatus();
  const heatTab = s.heatTab || 'es';
  v.innerHTML = `
    ${demoBanner(st)}
    ${!st.demo && !s.token && D.refreshStatus().worker ? `<div class="card" id="setup" style="margin-top:8px;display:flex;gap:12px;align-items:center"><div style="flex:1"><b>${t('setupT')}</b><div class="small muted">${t('setupD')}</div></div><button class="btn pri sm" id="setupBtn">${t('connect')}</button></div>` : ''}
    <section class="hero" id="hero"></section>
    <div class="mkt" id="mkt"></div>
    <div class="sec"><h2>${t('indices')}</h2></div>
    <div class="tiles" id="tiles">${IDX.map((x) => `<a class="tile" href="#/a/${encodeURIComponent(x)}" data-s="${x}"><span class="n">${esc(BY.get(x).n)}</span><span class="v" data-p>—</span><span class="c" data-c></span><canvas data-sp="${x}"></canvas></a>`).join('')}</div>
    <a class="card" id="btc" href="#/bitcoin" style="display:block;margin-top:14px"></a>
    <div class="sec"><h2>${t('myList')}</h2><a class="more" href="#/buscar">${t('add')}</a></div>
    <div class="list" id="watch">${s.watch.filter((x) => x !== 'BTC-EUR').map((x) => row(x, D.lastQuote(x))).join('')}</div>
    <div class="sec"><h2>${t('heatmap')}</h2><a class="more" href="#/mapa">${t('fullscreen')}</a></div>
    <div class="seg" id="htabs">${[['es', 'Madrid'], ['us', 'EE. UU.'], ['eu', 'Europa']].map(([k, l]) => `<button data-k="${k}" class="${k === heatTab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="heat" id="heat"></div>
    <div class="split" style="margin-top:14px"><div><div class="sec" style="margin-top:6px"><h2>${t('gainers')}</h2></div><div class="list" id="gain"></div></div><div><div class="sec" style="margin-top:6px"><h2>${t('losers')}</h2></div><div class="list" id="lose"></div></div></div>
    <div class="sec"><h2>${t('fearGreed')}</h2></div>
    <div class="card" id="fg"><div class="skel" style="height:120px"></div></div>
    <div class="sec"><h2>${t('cmdFx')}</h2></div>
    <div class="list" id="cmd">${CMD.map((x) => row(x, D.lastQuote(x))).join('')}</div>
    <p class="note">${t('sourcesNote')}</p>`;

  const stopFns = [];
  const sb = $('#setupBtn', v); if (sb) sb.onclick = async () => { try { const info = await D.serverInfo(); if (info.claimed) { location.hash = '#/ajustes'; return; } await D.claim(D.refreshStatus() && (store.s.worker || window.SB_CONFIG.worker)); location.hash = '#/alertas'; } catch { location.hash = '#/ajustes'; } };
  // Estado de los mercados
  const mk = () => { $('#mkt', v).innerHTML = [['MC', 'Madrid'], ['US', 'Nueva York'], ['T', 'Tokio']].map(([k, n]) => `<span><i class="live ${isOpen(k) ? '' : 'off'}"></i>${n} ${isOpen(k) ? t('open') : t('closed')}</span>`).join('') + `<span><i class="live"></i>Bitcoin 24/7</span>`; };
  mk(); const mkT = setInterval(mk, 60000); stopFns.push(() => clearInterval(mkT));

  // Héroe: tu cartera si tienes inversiones; si no, el IBEX 35
  const hero = async () => {
    const h = $('#hero', v); if (!h) return;
    if (s.positions.length) {
      const pf = await portfolioNow();
      h.innerHTML = `<div class="lab">${I.wallet.replace('<svg', '<svg width="16" height="16"')}${t('yourPortfolio')}</div><div class="big">${F.num(pf.value, 2)}<span class="cur">€</span></div><div class="chg"><span class="p ${F.cls(pf.dayPct)}">${F.pct(pf.dayPct)}</span><span class="${F.cls(pf.day)}">${F.signed(pf.day, 'EUR')} ${t('today')}</span><span class="dim">·</span><span class="${F.cls(pf.pnl)}">${F.signed(pf.pnl, 'EUR')} ${t('total')}</span></div>`;
    } else {
      const q = D.lastQuote('^IBEX');
      h.innerHTML = `<div class="lab">IBEX 35 · ${isOpen('MC') ? t('live') : t('lastClose')}</div><div class="big">${q ? F.num(q.price, 1) : '—'}</div><div class="chg">${q ? `<span class="p ${F.cls(q.pct)}">${F.pct(q.pct)}</span><span class="${F.cls(q.chg)}">${F.signed(q.chg, null, 1)} ${t('points')}</span>` : ''}<a href="#/cartera" class="small">${t('addFirst')}</a></div>`;
    }
  };

  // Cotizaciones
  const heatSyms = (k) => UNIVERSE.filter((u) => u.g === k && u.t === 'stock').map((u) => u.s);
  const all = [...IDX, ...s.watch, ...CMD, 'BTC-EUR', ...s.positions.map((p) => p.s), ...heatSyms(heatTab)];
  const paint = (q, old) => {
    $$(`[data-s="${CSS.escape(q.s)}"]`, v).forEach((el) => { if (el.classList.contains('tile')) { el.querySelector('[data-p]').textContent = F.num(q.price, q.price > 1000 ? 0 : 2); const c = el.querySelector('[data-c]'); c.textContent = F.pct(q.pct); c.className = 'c ' + F.cls(q.pct); } else bump(el, q, old); });
    if (q.s === 'BTC-EUR') btc(q);
    if (q.s === '^IBEX' && !s.positions.length) hero();
  };
  const btc = (q) => { const el = $('#btc', v); if (!el || !q) return; el.innerHTML = `<div style="display:flex;align-items:center;gap:12px">${avatar('BTC-EUR')}<div style="flex:1"><b style="font-stretch:112%">Bitcoin</b><div class="small dim">${t('btcLive')}</div></div><div style="text-align:right"><b class="xs" style="font-size:18px" data-bp>${F.price(q.price, 'EUR', 0)}</b><div class="small ${F.cls(q.pct)}">${F.pct(q.pct)} 24 h</div></div></div><canvas data-sp="BTC-EUR" style="width:100%;height:46px;margin-top:10px"></canvas>`; if (btcSpark) spark($('canvas', el), btcSpark.c, { base: btcSpark.prev }); };
  let btcSpark = null;
  const qs = await D.getQuotes(all).catch(() => []);
  qs.forEach((q) => paint(q)); hero();
  stopFns.push(D.watch([...IDX, ...s.watch, ...CMD, 'BTC-EUR'], (q) => paint(q, null)));
  const unq = D.onQuote((q, old) => { if (q.s !== 'BTC-EUR' && !IDX.includes(q.s)) return; if (old && old.price !== q.price) $$(`[data-s="${CSS.escape(q.s)}"] [data-p]`, v).forEach((el) => { el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth; el.classList.add(q.price > old.price ? 'tick-up' : 'tick-down'); }); });
  stopFns.push(unq);

  // Mini-gráficas
  D.sparks([...IDX, ...s.watch, ...CMD, 'BTC-EUR']).then((sp) => {
    for (const [sym, d] of Object.entries(sp)) $$(`canvas[data-sp="${CSS.escape(sym)}"]`, v).forEach((cv) => spark(cv, d.c, { base: d.prev }));
    btcSpark = sp['BTC-EUR']; btc(D.lastQuote('BTC-EUR'));
  }).catch(() => {});

  // Mapa de calor + más suben / bajan
  const heat = async (k) => {
    const list = heatSyms(k); const box = $('#heat', v); if (!box) return;
    const q = await D.getQuotes(list).catch(() => []); const m = new Map(q.map((x) => [x.s, x]));
    const W = box.clientWidth, H = box.clientHeight;
    const items = list.map((sy) => { const qq = m.get(sy); const u = BY.get(sy); return { s: sy, label: sy.split('.')[0].replace('-', '.'), w: qq?.mcap ? qq.mcap / 1e9 : u.c || 1, p: qq?.pct }; });
    const cells = treemap(items, W, H);
    box.innerHTML = cells.map((c) => `<a class="cell ${c.w * c.h > 9000 ? 'big' : c.w * c.h < 1500 ? 'tiny' : ''}" href="#/a/${encodeURIComponent(c.s)}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${heatColor(c.p)}"><b>${esc(c.label)}</b><span>${c.p == null ? '' : F.pct(c.p, 1)}</span></a>`).join('');
    const sorted = q.filter((x) => x.pct != null).sort((a, b) => b.pct - a.pct);
    const mini = (x) => `<a class="row" href="#/a/${encodeURIComponent(x.s)}" style="grid-template-columns:1fr auto;min-height:48px;padding:8px 0"><div class="nm"><b>${esc(nameOf(x.s, x))}</b><span>${F.price(x.price, x.cur)}</span></div><div class="pr" style="min-width:0"><span class="${F.cls(x.pct)}">${F.pct(x.pct)}</span></div></a>`;
    $('#gain', v).innerHTML = sorted.slice(0, 5).map(mini).join('') || `<p class="dim small">—</p>`;
    $('#lose', v).innerHTML = sorted.slice(-5).reverse().map(mini).join('') || `<p class="dim small">—</p>`;
  };
  heat(heatTab);
  $('#htabs', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#htabs button', v).forEach((x) => x.classList.toggle('on', x === b)); store.set({ heatTab: b.dataset.k }); heat(b.dataset.k); };

  // Miedo y codicia
  D.fearGreed().then((fg) => {
    const el = $('#fg', v); if (!el) return;
    if (!fg) { el.innerHTML = `<p class="muted small" style="margin:0">${st.demo ? t('fgDemo') : t('fgNone')}</p>`; return; }
    const lab = fg.value < 25 ? 'fg0' : fg.value < 45 ? 'fg1' : fg.value <= 55 ? 'fg2' : fg.value <= 75 ? 'fg3' : 'fg4';
    el.innerHTML = `<div class="fg"><div>${gauge(fg.value, { size: 150 })}</div><div><div class="v">${fg.value}</div><b class="${fg.value < 45 ? 'down' : fg.value > 55 ? 'up' : ''}">${t(lab)}</b><p class="note" style="margin-top:6px">${t('fgHow')}</p></div></div>
      <div class="stats" style="margin-top:8px">${Object.entries(fg.parts).map(([k, val]) => `<div><span>${t('fg_' + k)}</span><b>${val}</b></div>`).join('')}</div>`;
  });
  const qT = setInterval(() => { if (document.visibilityState === 'visible') D.getQuotes(all).then((x) => x.forEach((q) => paint(q))); }, 30000);
  stopFns.push(() => clearInterval(qT));
  return () => stopFns.forEach((f) => f());
}
