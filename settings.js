// Ajustes: idioma, servidor, claves de datos y copia de seguridad
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t, setLang } from './i18n.js';
import { setLocale } from './fmt.js';
import { I, $, $$, esc, toast, ask } from './ui.js';

export async function render(v, _, { app }) {
  app.setTitle(t('settings'), { back: true });
  const s = store.s; const keyF = (k, label, url) => `<div class="field"><label>${label} <a class="small" href="${url}" target="_blank" rel="noopener" style="float:right">${t('getKey')}</a></label><div style="display:flex;gap:8px"><input class="inp" type="password" data-k="${k}" value="${esc(s.keys[k] || '')}" autocomplete="off" spellcheck="false" placeholder="${t('pasteKey')}"><button class="btn sm" data-show="${k}" style="height:48px">${t('show')}</button></div></div>`;
  v.innerHTML = `
    <div class="sec" style="margin-top:12px"><h2>${t('language')}</h2></div>
    <div class="seg" id="lg"><button data-l="es" class="${s.lang === 'es' ? 'on' : ''}">Español</button><button data-l="eu" class="${s.lang === 'eu' ? 'on' : ''}">Euskara</button></div>
    <div class="sec"><h2>${t('server')}</h2><span id="sst" class="small"></span></div>
    <div class="card"><div class="field" style="margin-top:0"><label>${t('serverUrl')}</label><input class="inp" id="wu" value="${esc(s.worker || window.SB_CONFIG?.worker || '')}" placeholder="https://….workers.dev" inputmode="url" autocomplete="off"></div>
      <div class="actions" style="margin-top:4px"><button class="btn pri" id="claim">${s.token ? t('reconnect') : t('connect')}</button>${s.token ? `<button class="btn" id="pcode">${t('linkDevice')}</button>` : ''}</div>
      <div id="codebox" class="hidden field"><label>${t('pairCode')}</label><input class="inp" id="pc" inputmode="numeric" maxlength="6" placeholder="123456"><span class="hint">${t('pairCodeD')}</span></div>
      <p class="note">${t('serverNote')}</p></div>
    <div class="sec"><h2>${t('dataKeys')}</h2></div>
    <div class="card"><p class="small muted" style="margin:0">${t('keysD')}</p>
      ${keyF('finnhub', 'Finnhub', 'https://finnhub.io/dashboard')}${keyF('twelve', 'Twelve Data', 'https://twelvedata.com/account/api-keys')}
      <div class="actions"><button class="btn pri" id="savek">${t('saveKeys')}</button><button class="btn" id="testk">${t('testKeys')}</button></div><div id="kres" class="small" style="margin-top:10px"></div></div>
    <div class="sec"><h2>${t('aiSettings')}</h2></div>
    <div class="card"><p class="small muted" style="margin:0">${t('aiKeysD')}</p>
      <div class="field"><label>${t('aiEngine')}</label><select class="inp" id="aieng">${[['auto', t('aiAuto')], ['groq', 'Groq (gratis)'], ['cloudflare', 'Cloudflare Workers AI (gratis)'], ['claude', 'Claude (de pago)']].map(([k, l]) => `<option value="${k}" ${s.ai.engine === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${keyF('groq', 'Groq', 'https://console.groq.com/keys')}${keyF('anthropic', 'Claude (Anthropic)', 'https://console.anthropic.com/settings/keys')}
      <div class="field"><label>${t('claudeModel')}</label><select class="inp" id="aimodel"><option value="claude-sonnet-5-5" ${s.ai.claudeModel === 'claude-sonnet-5-5' ? 'selected' : ''}>Claude Sonnet 5.5 (${t('better')})</option><option value="claude-haiku-5-5" ${s.ai.claudeModel === 'claude-haiku-5-5' ? 'selected' : ''}>Claude Haiku 5.5 (${t('cheaper')})</option></select></div>
      <div class="actions"><button class="btn pri" id="saveai">${t('saveKeys')}</button><button class="btn" id="testai">${t('testAI')}</button></div><div id="aires" class="small" style="margin-top:10px"></div></div>
    <div class="sec"><h2>${t('sources')}</h2></div>
    <div class="card small" id="src"></div>
    <div class="sec"><h2>${t('backup')}</h2></div>
    <div class="actions" style="margin-top:0"><button class="btn" id="exp">${t('export')}</button><label class="btn" style="cursor:pointer">${t('import')}<input type="file" id="imp" accept="application/json" hidden></label></div>
    <button class="btn wide" id="reset" style="margin-top:10px;color:var(--down)">${t('resetAll')}</button>
    <div class="sec"><h2>${t('about')}</h2></div>
    <p class="small muted">${t('aboutD')}</p><p class="note">${t('disclaimer')}</p><p class="note">Gráficas: TradingView Lightweight Charts™ (Apache 2.0) · senorbakBolsa 1.0</p>`;
  $('#lg', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; store.set({ lang: b.dataset.l }); setLang(b.dataset.l); setLocale(b.dataset.l); document.documentElement.lang = b.dataset.l; app.rerender(); };
  const sst = async () => { const el = $('#sst', v); if (!el) return; if (!store.s.worker) { el.innerHTML = `<span class="dim">${t('notSet')}</span>`; return; } try { const r = await D.serverInfo(); el.innerHTML = `<span class="${store.s.token ? 'up' : 'dim'}">● ${store.s.token ? t('connected') : t('reachable')} · v${esc(r.version || '?')}</span>`; } catch { el.innerHTML = `<span class="down">● ${t('unreachable')}</span>`; } };
  sst();
  $('#claim', v).onclick = async () => {
    const url = $('#wu', v).value.trim(); if (!/^https:\/\//.test(url)) return toast(t('badUrl'));
    try { const info = await D.serverInfo(url); if (info.app !== 'senorbakBolsa') throw new Error('old'); const code = $('#pc', v).value.trim();
      if (info.claimed && !code) { $('#codebox', v).classList.remove('hidden'); toast(t('needCode'), 5000); return; }
      await D.claim(url, code); toast(t('connectedOk'), 3000, '✓'); app.rerender();
    } catch (e) { toast(String(e.message).includes('403') ? t('badCode') : String(e.message) === 'old' ? t('oldServer') : t('unreachable'), 4000); }
  };
  const pcb = $('#pcode', v); if (pcb) pcb.onclick = async () => { try { const r = await D.pairCode(); ask(t('pairCode'), t('pairShow', `<b style="font-size:28px;letter-spacing:.1em">${r.code}</b>`), t('ok')); } catch { toast(t('unreachable')); } };
  $$('[data-show]', v).forEach((b) => (b.onclick = () => { const i = $(`[data-k="${b.dataset.show}"]`, v); i.type = i.type === 'password' ? 'text' : 'password'; }));
  $('#savek', v).onclick = () => { const keys = { ...store.s.keys }; $$('[data-k]', v).forEach((i) => (keys[i.dataset.k] = i.value.trim())); store.set({ keys }); D.refreshStatus(); toast(t('saved'), 2000, '✓'); paintSrc(); };
  $('#saveai', v).onclick = () => { const keys = { ...store.s.keys }; $$('[data-k="groq"],[data-k="anthropic"]', v).forEach((i) => (keys[i.dataset.k] = i.value.trim())); store.set({ keys, ai: { engine: $('#aieng', v).value, claudeModel: $('#aimodel', v).value } }); toast(t('saved'), 2000, '✓'); };
  $('#testai', v).onclick = async () => { $('#saveai', v).click(); const el = $('#aires', v); el.textContent = t('testing'); try { const { ask, engine, ENGINE_NAME } = await import('./ai.js'); if (!engine()) throw new Error(t('aiOff')); const r = await ask([], t('aiTestQ')); el.innerHTML = `<b class="up">${t('works')}</b> · ${esc(ENGINE_NAME[r.engine])}<br><span class="dim">${esc(r.text.slice(0, 160))}</span>`; } catch (e) { el.innerHTML = `<b class="down">${esc(e.message)}</b>`; } };
  $('#testk', v).onclick = async () => { $('#savek', v).click(); $('#kres', v).textContent = t('testing'); const r = await D.testKeys(); $('#kres', v).innerHTML = Object.entries(r).map(([k, x]) => `<div>${k === 'server' ? t('server') : k === 'twelve' ? 'Twelve Data' : 'Finnhub'}: <b class="${x === 'ok' ? 'up' : x === 'none' ? 'dim' : 'down'}">${x === 'ok' ? t('works') : x === 'none' ? t('notSet') : esc(x)}</b></div>`).join(''); };
  const paintSrc = () => { const st = D.refreshStatus(); $('#src', v).innerHTML = [[t('src_server'), st.worker && store.s.token], ['Finnhub', st.fh], ['Twelve Data', st.td], ['Binance (Bitcoin)', true], [t('src_ecb'), true]].map(([n, ok]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${n}</span><b class="${ok ? 'up' : 'dim'}">${ok ? t('on') : t('off')}</b></div>`).join('') + (st.errors.length ? `<details style="margin-top:8px"><summary class="dim">${t('lastErrors')}</summary>${st.errors.slice(0, 8).map((e) => `<div class="dim tiny">${F.time(e.t)} · ${esc(e.where)}: ${esc(e.msg)}</div>`).join('')}</details>` : '') + (st.demo ? `<p class="note">${t('demoActive')}</p>` : ''); };
  paintSrc();
  $('#exp', v).onclick = () => { const s2 = store.s; const blob = new Blob([JSON.stringify({ app: 'senorbakBolsa', v: 1, positions: s2.positions, lots: s2.lots, sales: s2.sales, alerts: s2.alerts, watch: s2.watch, prefs: s2.prefs, sim: s2.sim, signalLog: s2.signalLog }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'senorbakBolsa-' + F.iso(Date.now()) + '.json'; a.click(); };
  $('#imp', v).onchange = async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (j.app !== 'senorbakBolsa') throw 0; store.set({ positions: j.positions || [], lots: j.lots || [], sales: j.sales || [], alerts: j.alerts || [], watch: j.watch || store.s.watch, prefs: { ...store.s.prefs, ...(j.prefs || {}) }, sim: j.sim || store.s.sim, signalLog: j.signalLog || [] }); toast(t('imported'), 2500, '✓'); } catch { toast(t('badFile')); } };
  $('#reset', v).onclick = async () => { if (await ask(t('resetQ'), t('resetD'), t('resetAll'), true)) { localStorage.clear(); location.reload(); } };
}
