// Buscador: cualquier acción, índice, ETF, materia prima o divisa del mundo
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, toast, row } from './ui.js';
import { UNIVERSE } from './universe.js';

const TYPE = (x) => ({ stock: t('type_stock'), etf: 'ETF', index: t('index'), fx: t('currency'), cmd: t('commodity'), crypto: 'Cripto', fund: t('type_fund') }[x] || '');
export function searchBox(el, { value = '', onPick, autofocus } = {}) {
  el.innerHTML = `<div class="search">${I.search}<input type="search" placeholder="${t('searchPh')}" value="${esc(value)}" autocomplete="off" ${autofocus ? 'autofocus' : ''}></div><div class="list" data-res style="max-height:300px;overflow:auto"></div>`;
  const inp = $('input', el), res = $('[data-res]', el); let tm = 0, seq = 0;
  inp.oninput = () => { clearTimeout(tm); const q = inp.value; if (q.length < 1) { res.innerHTML = ''; return; } tm = setTimeout(async () => { const my = ++seq; res.innerHTML = '<div class="skel" style="height:48px;margin:8px 0"></div>'; const r = await D.search(q).catch(() => []); if (my !== seq) return; res.innerHTML = r.length ? r.slice(0, 20).map((x) => `<button class="row" style="grid-template-columns:40px 1fr auto;width:100%;text-align:left" data-s="${esc(x.s)}" data-n="${esc(x.n)}">${avatar(x.s)}<div class="nm"><b>${esc(x.n)}</b><span>${esc(x.s)} · ${esc(TYPE(x.t))} ${x.ex ? '· ' + esc(x.ex) : ''}</span></div><span class="dim">${I.plus.replace('<svg', '<svg width="18" height="18"')}</span></button>`).join('') : `<p class="dim small">${t('noResults')}</p>`; }, 260); };
  res.onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; e.preventDefault(); inp.value = `${b.dataset.n} (${b.dataset.s})`; res.innerHTML = ''; onPick?.({ s: b.dataset.s, n: b.dataset.n }); };
  return inp;
}
export async function render(v, _, { app }) {
  app.setTitle(t('search'), { back: true });
  const groups = [['idx', t('indices')], ['es', 'Madrid'], ['us', 'EE. UU.'], ['eu', 'Europa'], ['eu2', 'Europa (no euro)'], ['asia', 'Asia'], ['etf', 'ETF'], ['cmd', t('commodities')], ['fx', t('currencies')], ['bond', t('bonds')]];
  v.innerHTML = `<div id="sb" style="margin-top:6px"></div><p class="note">${t('searchNote')}</p>
    <div class="sec"><h2>${t('explore')}</h2></div><div class="chips" id="gch">${groups.map(([k, l], i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div>
    <div class="list" id="glist" style="margin-top:8px"></div>`;
  searchBox($('#sb', v), { autofocus: true, onPick: (x) => { location.hash = '#/a/' + encodeURIComponent(x.s); } });
  const show = async (g) => {
    const list = UNIVERSE.filter((u) => u.g === g).map((u) => u.s);
    $('#glist', v).innerHTML = list.map((s) => row(s, D.lastQuote(s), { spark: false })).join('');
    const qs = await D.getQuotes(list).catch(() => []); qs.forEach((q) => { const el = $(`[data-s="${CSS.escape(q.s)}"]`, v); if (el) { el.querySelector('[data-p]').textContent = F.price(q.price, q.cur); const c = el.querySelector('[data-c]'); c.textContent = F.pct(q.pct); c.className = F.cls(q.pct); } });
  };
  show('es');
  $('#gch', v).onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; $$('#gch .chip', v).forEach((x) => x.classList.toggle('on', x === b)); show(b.dataset.g); };
}
