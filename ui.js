// Piezas de interfaz comunes: iconos, filas, hoja inferior, avisos emergentes
import { info, isBTC } from './universe.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
const sv = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const I = {
  markets: sv('<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>'),
  wallet: sv('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/><path d="M6 6l9-3 2 3"/>'),
  signal: sv('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  news: sv('<path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z"/><path d="M18 8h2v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4"/>'),
  more: sv('<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  bell: sv('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  back: sv('<path d="M15 5l-7 7 7 7"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  trash: sv('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  star: sv('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>'),
  starF: sv('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z" fill="currentColor"/>'),
  btc: sv('<circle cx="12" cy="12" r="9"/><path d="M9.5 7.5h4a2 2 0 0 1 0 4h-4zM9.5 11.5h4.5a2 2 0 0 1 0 4H9.5zM9.5 7.5v8M11 6v1.5M11 15.5V17M13 6v1.5M13 15.5V17"/>'),
  cal: sv('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  alarm: sv('<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4L2.5 6.5M19 4l2.5 2.5"/>'),
  flask: sv('<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
  filter: sv('<path d="M4 5h16l-6 8v5l-4 2v-7z"/>'),
  compare: sv('<path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4"/>'),
  bank: sv('<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  receipt: sv('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  ext: sv('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  target: sv('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
  shield: sv('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
  trophy: sv('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>'),
  heat: sv('<rect x="3" y="4" width="10" height="9" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="11" width="6" height="9" rx="1.5"/><rect x="3" y="15" width="10" height="5" rx="1.5"/>'),
  sell: sv('<path d="M12 4v13M6 11l6 6 6-6M5 20h14"/>'),
  buy: sv('<path d="M12 20V7M6 13l6-6 6 6M5 4h14"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  close: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  spark: sv('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
};
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = F.esc;

export function avatar(s, logo) {
  const i = info(s); const cls = isBTC(s) ? 'btc' : i.t === 'index' || i.t === 'bond' ? 'idx' : i.t === 'cmd' ? 'cmd' : i.t === 'fx' ? 'fx' : '';
  if (logo) return `<div class="av"><img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()"></div>`;
  const txt = isBTC(s) ? '₿' : i.t === 'fx' ? s.slice(0, 3) : i.t === 'index' ? (i.n.match(/[A-Z0-9]/g) || ['I']).slice(0, 3).join('').slice(0, 3) : s.replace(/^\^/, '').split(/[.\-=]/)[0].slice(0, 4);
  return `<div class="av ${cls}">${esc(txt)}</div>`;
}
export function nameOf(s, q) { const i = info(s); return i.n !== s ? i.n : q?.name || s; }
export function subOf(s) { const i = info(s); const map = { es: 'Madrid', us: 'EE. UU.', eu: 'Europa', eu2: 'Europa', asia: 'Asia', etf: 'ETF', cmd: t('commodity'), fx: t('currency'), idx: t('index'), bond: t('bond'), crypto: 'Cripto' }; return [s.replace('^', ''), map[i.g] || i.sec].filter(Boolean).join(' · '); }
export function row(s, q, { sub, right, spark = true, cls = '' } = {}) {
  const pct = q?.pct; return `<a class="row ${cls}" href="#/a/${encodeURIComponent(s)}" data-s="${esc(s)}">${avatar(s, q?.logo)}<div class="nm"><b>${esc(nameOf(s, q))}</b><span>${esc(sub ?? subOf(s))}</span></div>${spark ? `<canvas class="sp" data-sp="${esc(s)}"></canvas>` : '<span></span>'}<div class="pr">${right ?? `<b data-p>${q ? F.price(q.price, q.cur) : '<span class="skel" style="display:inline-block;width:60px;height:14px"></span>'}</b><span data-c class="${F.cls(pct)}">${q ? F.pct(pct) : ''}</span>`}</div></a>`;
}
// Actualiza una fila con un precio nuevo (con destello verde/rojo)
export function bump(el, q, old) {
  if (!el || !q) return; const p = el.querySelector('[data-p]'), c = el.querySelector('[data-c]');
  if (p) { p.textContent = F.price(q.price, q.cur); if (old?.price != null && q.price !== old.price) { p.classList.remove('tick-up', 'tick-down'); void p.offsetWidth; p.classList.add(q.price > old.price ? 'tick-up' : 'tick-down'); } }
  if (c) { c.textContent = F.pct(q.pct); c.className = F.cls(q.pct); }
}

/* --- avisos emergentes --- */
export function toast(msg, ms = 3200, icon = '') {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = (icon ? `<span>${icon}</span>` : '') + `<div>${msg}</div>`;
  $('#toasts').appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}
/* --- hoja inferior --- */
let sheetClose = null;
export function sheet(html, onMount) {
  const sh = $('#sheet'); $('.pn', sh).innerHTML = '<div class="grab"></div>' + html; sh.classList.add('open'); requestAnimationFrame(() => sh.classList.add('show'));
  const close = () => { sh.classList.remove('show'); setTimeout(() => sh.classList.remove('open'), 300); if (history.state?.sheet) history.back(); sheetClose = null; };
  sheetClose = close; history.pushState({ sheet: 1 }, '');
  $('.bk', sh).onclick = close; onMount?.($('.pn', sh), close); return close;
}
window.addEventListener('popstate', () => { if (sheetClose) { const sh = $('#sheet'); sh.classList.remove('show'); setTimeout(() => sh.classList.remove('open'), 300); sheetClose = null; } });
export function ask(title, text, okLabel, danger) {
  return new Promise((res) => sheet(`<h2>${esc(title)}</h2><p class="muted">${text}</p><div class="actions"><button class="btn" data-no>${t('cancel')}</button><button class="btn ${danger ? 'down' : 'pri'}" data-ok>${esc(okLabel)}</button></div>`, (pn, close) => { $('[data-no]', pn).onclick = () => { close(); res(false); }; $('[data-ok]', pn).onclick = () => { close(); res(true); }; }));
}
export function sigTag(lab, short) { return `<span class="tag ${lab}">${t('lab_' + lab)}${short ? '' : ''}</span>`; }
export function demoBanner(st) { return st.demo ? `<div class="demo">${I.info}<div><b>${t('demoT')}</b> ${t('demoD')} <a href="#/ajustes">${t('demoGo')}</a></div></div>` : ''; }
export function skel(h = 60, n = 3) { return Array.from({ length: n }, () => `<div class="skel" style="height:${h}px;margin:10px 0"></div>`).join(''); }
