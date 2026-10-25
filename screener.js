// Buscador con filtros: encuentra valores por mercado, sector, PER, dividendo, rentabilidad y señal
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, avatar, esc, nameOf, sigTag } from './ui.js';
import { UNIVERSE, BY } from './universe.js';
import { analyzeMany } from './senales.js';
export async function render(v, _, { app }) {
  app.setTitle(t('screener'), { back: true });
  const groups = [['es', 'Madrid'], ['us', 'EE. UU.'], ['eu', 'Europa'], ['eu2', 'Europa (no euro)'], ['asia', 'Asia']];
  const sectors = [...new Set(UNIVERSE.filter((u) => u.t === 'stock').map((u) => u.sec))].sort();
  let f = { g: new Set(['es', 'us', 'eu']), sec: '', pe: '', dy: '', perf: '', sig: '', sort: 'perf' };
  v.innerHTML = `<p class="muted small" style="margin-top:12px">${t('screenerIntro')}</p>
    <div class="chips" id="gg">${groups.map(([k, l]) => `<button class="chip ${f.g.has(k) ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div>
    <div class="inrow"><div class="field"><label>${t('sector')}</label><select class="inp" id="sec"><option value="">${t('any')}</option>${sectors.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>${t('signal')}</label><select class="inp" id="sig"><option value="">${t('any')}</option><option value="buy">${t('toBuy')}</option><option value="sell">${t('toSell')}</option></select></div></div>
    <div class="inrow"><div class="field"><label>${t('peMax')}</label><input class="inp" id="pe" inputmode="decimal" placeholder="20"></div><div class="field"><label>${t('dyMin')}</label><input class="inp" id="dy" inputmode="decimal" placeholder="3"></div></div>
    <div class="inrow"><div class="field"><label>${t('perfMin')}</label><input class="inp" id="perf" inputmode="decimal" placeholder="0"></div><div class="field"><label>${t('sortBy')}</label><select class="inp" id="sort"><option value="perf">${t('perf1y')}</option><option value="dy">${t('divYield')}</option><option value="pe">${t('pe')}</option><option value="mcap">${t('mcap')}</option><option value="score">${t('signal')}</option><option value="day">${t('today')}</option></select></div></div>
    <div class="small dim" id="cnt"></div><div class="list" id="res"></div><p class="note">${t('screenerNote')}</p>`;
  const data = new Map(); let sig = {};
  const load = async () => {
    const list = UNIVERSE.filter((u) => f.g.has(u.g) && u.t === 'stock').map((u) => u.s).filter((s) => !data.has(s));
    if (list.length) { $('#cnt', v).textContent = t('loading'); const [qs, sp] = await Promise.all([D.getQuotes(list).catch(() => []), D.sparks(list, '1y').catch(() => ({}))]); for (const s of list) { const q = qs.find((x) => x.s === s) || D.lastQuote(s) || {}; const c = sp[s]?.c; data.set(s, { ...q, perf: c?.length > 20 ? (c[c.length - 1] / c[0] - 1) * 100 : null }); } }
    paint();
  };
  const paint = () => {
    const num = (x) => (x === '' ? null : parseFloat(String(x).replace(',', '.')));
    const pe = num(f.pe), dy = num(f.dy), perf = num(f.perf);
    let rows = [...data.entries()].filter(([s]) => f.g.has(BY.get(s)?.g)).map(([s, q]) => ({ s, q, sc: sig[s]?.s?.score ?? null, lab: sig[s]?.s?.label }));
    rows = rows.filter(({ s, q, lab }) => (!f.sec || BY.get(s).sec === f.sec) && (pe == null || (q.pe != null && q.pe > 0 && q.pe <= pe)) && (dy == null || (q.dy != null && q.dy >= dy)) && (perf == null || (q.perf != null && q.perf >= perf)) && (!f.sig || (lab && lab.includes(f.sig))));
    const key = { perf: (r) => r.q.perf ?? -1e9, dy: (r) => r.q.dy ?? -1e9, pe: (r) => -(r.q.pe ?? 1e9), mcap: (r) => r.q.mcap ?? BY.get(r.s).c * 1e9, score: (r) => r.sc ?? -1e9, day: (r) => r.q.pct ?? -1e9 }[f.sort];
    rows.sort((a, b) => key(b) - key(a));
    $('#cnt', v).textContent = t('nResults', rows.length);
    $('#res', v).innerHTML = rows.slice(0, 80).map(({ s, q, lab }) => `<a class="row" href="#/a/${encodeURIComponent(s)}" style="grid-template-columns:40px 1fr auto">${avatar(s)}<div class="nm"><b>${esc(nameOf(s, q))}</b><span>${[q.pe ? 'PER ' + F.num(q.pe, 1) : null, q.dy ? 'Div ' + F.pct(q.dy, 1, false) : null, q.perf != null ? '1A ' + F.pct(q.perf, 0) : null].filter(Boolean).join(' · ') || esc(BY.get(s).sec)}</span></div><div class="pr"><b>${F.price(q.price, q.cur)}</b>${lab ? sigTag(lab) : `<span class="${F.cls(q.pct)}">${F.pct(q.pct)}</span>`}</div></a>`).join('');
  };
  $('#gg', v).onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; f.g.has(b.dataset.g) ? f.g.delete(b.dataset.g) : f.g.add(b.dataset.g); b.classList.toggle('on'); load(); };
  for (const id of ['sec', 'pe', 'dy', 'perf', 'sort', 'sig']) $('#' + id, v).oninput = (e) => { f[id] = e.target.value; if ((id === 'sig' || id === 'sort') && (f.sig || f.sort === 'score') && !Object.keys(sig).length) runSig(); paint(); };
  const runSig = async () => { const list = [...data.keys()]; await analyzeMany(list, (s, r, i) => { if (r) sig[s] = r; if (i % 6 === 0 || i === list.length) { $('#cnt', v).textContent = t('analyzing', i, list.length); paint(); } }); };
  load();
}
