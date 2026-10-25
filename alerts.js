// Alertas y avisos al móvil (ntfy): reglas automáticas de tu cartera + alertas de precio personalizadas
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { I, $, $$, avatar, esc, sheet, toast, nameOf } from './ui.js';
import { searchBox } from './search.js';

export function alertSheet(edit, preset) {
  const a = edit || { s: preset?.s || '', n: preset?.n || '', kind: 'below', value: '' };
  sheet(`<h2>${edit ? t('editAlert') : t('newAlert')}</h2>
    <div class="field"><label>${t('whatAsset')}</label><div id="pk"></div></div>
    <div class="field"><label>${t('when')}</label><select class="inp" id="ak">${['below', 'above', 'dayDown', 'dayUp'].map((k) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${t('ak_' + k)}</option>`).join('')}</select></div>
    <div class="field"><label id="vl">${t('value')}</label><input class="inp" id="av" inputmode="decimal" value="${a.value ?? ''}"><span class="hint" id="hint"></span></div>
    <div class="actions">${edit ? `<button class="btn" id="del">${I.trash}${t('delete')}</button>` : ''}<button class="btn pri" id="ok">${t('save')}</button></div>`, (pn, close) => {
    let sym = a.s, name = a.n;
    const hint = () => { const k = $('#ak', pn).value; const q = D.lastQuote(sym); $('#vl', pn).textContent = k.startsWith('day') ? t('percent') : t('price') + (q?.cur ? ` (${q.cur})` : ''); $('#hint', pn).textContent = q ? t('nowIs', F.price(q.price, q.cur), F.pct(q.pct)) : ''; };
    searchBox($('#pk', pn), { value: sym ? `${name || nameOf(sym)} (${sym})` : '', onPick: async (x) => { sym = x.s; name = x.n; await D.getQuotes([sym]).catch(() => {}); hint(); } });
    if (sym) D.getQuotes([sym]).then(hint).catch(() => {}); $('#ak', pn).onchange = hint; hint();
    $('#ok', pn).onclick = () => { const val = parseFloat(String($('#av', pn).value).replace(',', '.')); if (!sym || !isFinite(val)) return toast(t('fillAll')); const kind = $('#ak', pn).value;
      store.set((st) => ({ alerts: edit ? st.alerts.map((x) => (x.id === edit.id ? { ...x, s: sym, n: name || nameOf(sym), kind, value: Math.abs(val), on: true } : x)) : [...st.alerts, { id: store.uid(), s: sym, n: name || nameOf(sym), kind, value: kind.startsWith('day') ? Math.abs(val) : val, on: true, created: Date.now() }] }));
      close(); toast(t('alertSaved'), 2400, '🔔'); if (location.hash === '#/alertas') window.app.rerender(); };
    if (edit) $('#del', pn).onclick = () => { store.set((st) => ({ alerts: st.alerts.filter((x) => x.id !== edit.id) })); close(); window.app.rerender(); };
  });
}
export async function render(v, _, { app }) {
  app.setTitle(t('alerts'), { back: true });
  const s = store.s; const pr = s.prefs; const hasServer = !!(s.worker && s.token);
  const tog = (k, title, sub) => `<label class="tog"><div class="t"><b>${title}</b><span>${sub}</span></div><span class="sw"><input type="checkbox" data-p="${k}" ${pr[k] ? 'checked' : ''}><i></i></span></label>`;
  const numf = (k, title, sub) => `<div class="tog"><div class="t"><b>${title}</b><span>${sub}</span></div><div style="display:flex;align-items:center;gap:6px"><input class="inp" style="width:74px;height:40px;text-align:right" inputmode="decimal" data-n="${k}" value="${String(pr[k]).replace('.', ',')}"><span class="dim">%</span></div></div>`;
  v.innerHTML = `
    <div class="card" style="margin-top:10px">${hasServer
      ? `<div style="display:flex;gap:12px;align-items:center"><div class="av" style="background:var(--up);color:#062016">${I.check}</div><div style="flex:1"><b>${t('pushOn')}</b><div class="small dim">${t('pushOnD')}</div></div></div>
         <div class="actions"><a class="btn pri" href="ntfy://ntfy.sh/${esc(s.topic)}">${t('subscribeNtfy')}</a><button class="btn" id="test">${t('sendTest')}</button></div>
         <p class="note">${t('ntfyHelp', `<b>${esc(s.topic)}</b>`)} <a href="https://ntfy.sh/${esc(s.topic)}" target="_blank" rel="noopener">${t('openWeb')}</a></p>`
      : `<b>${t('pushOff')}</b><p class="small muted">${t('pushOffD')}</p><a class="btn pri wide" href="#/ajustes">${t('connectServer')}</a>`}</div>
    <div class="sec"><h2>${t('autoRules')}</h2></div>
    <div class="card" style="padding-top:4px;padding-bottom:4px">
      ${numf('dropDay', t('r_dropDay'), t('r_dropDayD'))}${numf('riseDay', t('r_riseDay'), t('r_riseDayD'))}
      ${numf('dropFromBuy', t('r_dropBuy'), t('r_dropBuyD'))}${numf('riseFromBuy', t('r_riseBuy'), t('r_riseBuyD'))}
      ${numf('btcMove', t('r_btc'), t('r_btcD'))}
      ${tog('forecast', t('r_fc'), t('r_fcD'))}${tog('news', t('r_news'), t('r_newsD'))}
      ${tog('sumOpen', t('r_sumOpen'), t('r_sumOpenD'))}${tog('sumClose', t('r_sumClose'), t('r_sumCloseD'))}
      ${tog('quiet', t('r_quiet'), t('r_quietD'))}
    </div>
    <p class="note">${t('stopNote')}</p>
    <div class="sec"><h2>${t('myAlerts')}</h2><button class="more" id="new">${t('add')}</button></div>
    <div class="list" id="al">${s.alerts.length ? s.alerts.map((a) => { const q = D.lastQuote(a.s); return `<button class="row" data-id="${a.id}" style="grid-template-columns:40px 1fr auto;width:100%;text-align:left;${a.on ? '' : 'opacity:.55'}">${avatar(a.s)}<div class="nm"><b>${esc(a.n || a.s)}</b><span>${t('ak_' + a.kind)} ${a.kind.startsWith('day') ? F.pct(a.value, 1, false) : F.price(a.value, q?.cur)}</span></div><span class="tag ${a.on ? 'buy' : 'n'}">${a.on ? t('active') : t('fired')}</span></button>`; }).join('') : `<p class="muted small">${t('noAlerts')}</p>`}</div>`;
  $$('[data-p]', v).forEach((el) => (el.onchange = () => store.set((x) => ({ prefs: { ...x.prefs, [el.dataset.p]: el.checked } }))));
  $$('[data-n]', v).forEach((el) => (el.onchange = () => { const n = parseFloat(el.value.replace(',', '.')); if (isFinite(n) && n > 0) store.set((x) => ({ prefs: { ...x.prefs, [el.dataset.n]: n } })); }));
  $('#new', v).onclick = () => alertSheet();
  $('#al', v).onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) alertSheet(store.s.alerts.find((x) => x.id === b.dataset.id)); };
  const tb = $('#test', v); if (tb) tb.onclick = async () => { D.syncServer(); await new Promise((r) => setTimeout(r, 1500)); try { const r = await D.testNotify(); toast(r.ok ? t('testSent') : t('testFail'), 3500); } catch { toast(t('testFail'), 3500); } };
}
