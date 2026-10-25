// Calendario: resultados de empresas, dividendos y reuniones del BCE y la Fed (con aviso la víspera)
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, avatar, esc, nameOf } from './ui.js';
import { isUS, isBTC } from './universe.js';

// Fuentes: calendario oficial de la Reserva Federal y del BCE (fecha de la decisión)
const CB = [
  ['2026-10-29', 'ecb'], ['2026-12-17', 'ecb'], ['2027-02-04', 'ecb'], ['2027-03-18', 'ecb'], ['2027-04-29', 'ecb'], ['2027-06-10', 'ecb'], ['2027-07-22', 'ecb'], ['2027-09-09', 'ecb'], ['2027-10-28', 'ecb'], ['2027-12-16', 'ecb'],
  ['2026-10-28', 'fed'], ['2026-12-09', 'fed'], ['2027-01-27', 'fed'], ['2027-03-17', 'fed'], ['2027-04-28', 'fed'], ['2027-06-09', 'fed'], ['2027-07-28', 'fed'], ['2027-09-15', 'fed'], ['2027-10-27', 'fed'], ['2027-12-08', 'fed'],
];
export async function collect() {
  const today = F.iso(Date.now()); const lim = F.iso(Date.now() + 60 * 864e5); const s = store.s; const ev = [];
  for (const [d, k] of CB) if (d >= today && d <= lim) ev.push({ id: k + d, d, k, title: t(k === 'ecb' ? 'ecbMeet' : 'fedMeet'), msg: t(k === 'ecb' ? 'ecbMsg' : 'fedMsg') });
  const mine = new Set(s.positions.map((p) => p.s));
  for (const e of await D.earnings()) ev.push({ id: 'er' + e.s + e.d, d: e.d, k: 'earn', s: e.s, title: t('earningsOf', nameOf(e.s)), msg: [e.hour === 'bmo' ? t('bmo') : e.hour === 'amc' ? t('amc') : '', e.eps != null ? t('epsEst', F.num(e.eps, 2)) : ''].filter(Boolean).join(' · '), mine: mine.has(e.s) });
  const others = [...new Set([...s.positions.map((p) => p.s), ...s.watch])].filter((x) => !isUS(x) && !isBTC(x) && !x.startsWith('^')).slice(0, 12);
  await Promise.all(others.map(async (sym) => { try { const f = await D.fundamentals(sym); if (f.nextEarnings) { const d = F.iso(f.nextEarnings); if (d >= today && d <= lim) ev.push({ id: 'er' + sym + d, d, k: 'earn', s: sym, title: t('earningsOf', nameOf(sym)), msg: '', mine: mine.has(sym) }); } if (f.exDiv) { const d = F.iso(f.exDiv); if (d >= today && d <= lim) ev.push({ id: 'dv' + sym + d, d, k: 'div', s: sym, title: t('exDivOf', nameOf(sym)), msg: f.dy ? t('divYieldIs', F.pct(f.dy, 2, false)) : '', mine: mine.has(sym) }); } } catch {} }));
  return ev.sort((a, b) => a.d.localeCompare(b.d));
}
export async function refreshEvents() {
  const ev = await collect(); const keep = ev.filter((e) => e.k === 'ecb' || e.k === 'fed' || e.mine);
  store.set({ events: keep.map(({ id, d, title, msg, s }) => ({ id, d, title, msg, s })), evDay: new Date().toISOString().slice(0, 10) }); return ev;
}
export async function render(v, _, { app }) {
  app.setTitle(t('calendar'), { back: true });
  let f = 'all';
  v.innerHTML = `<p class="muted small" style="margin-top:12px">${t('calD')}</p>
    <div class="chips" id="cf">${[['all', t('all')], ['mine', t('myAssets')], ['earn', t('earnings')], ['cb', t('centralBanks')], ['div', t('dividends')]].map(([k, l]) => `<button class="chip ${k === f ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="cl">${'<div class="skel" style="height:64px;margin:10px 0"></div>'.repeat(4)}</div><p class="note">${t('calNote')}</p>`;
  const ev = await refreshEvents();
  const paint = () => {
    const sel = ev.filter((e) => f === 'all' ? e.k !== 'earn' || e.mine || store.s.watch.includes(e.s) || ev.filter((x) => x.k === 'earn').length < 40 : f === 'mine' ? e.mine || store.s.watch.includes(e.s) : f === 'cb' ? e.k === 'ecb' || e.k === 'fed' : e.k === f);
    $('#cl', v).innerHTML = sel.length ? sel.map((e) => { const dt = new Date(e.d + 'T12:00:00'); return `<a class="cal" ${e.s ? `href="#/a/${encodeURIComponent(e.s)}"` : ''} style="color:inherit"><div class="d"><b>${dt.getDate()}</b><span>${F.date(dt, { month: 'short' })}</span></div><div style="display:flex;gap:10px;align-items:center">${e.s ? avatar(e.s) : `<div class="av idx">${e.k === 'ecb' ? 'BCE' : 'FED'}</div>`}<div class="nm" style="min-width:0"><b style="display:block">${esc(e.title)}${e.mine ? ` <span class="tag buy">${t('youHave')}</span>` : ''}</b><span class="small dim">${F.date(dt, { weekday: 'long' })}${e.msg ? ' · ' + esc(e.msg) : ''}</span></div></div></a>`; }).join('') : `<div class="empty"><b>${t('noEvents')}</b></div>`;
  };
  paint();
  $('#cf', v).onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; f = b.dataset.f; $$('#cf .chip', v).forEach((x) => x.classList.toggle('on', x === b)); paint(); };
}
