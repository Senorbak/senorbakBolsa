// Centro de avisos: lo último que te ha mandado el servidor
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, esc } from './ui.js';
export async function render(v, _, { app }) {
  app.setTitle(t('notifs'), { back: true });
  v.innerHTML = `<div id="nl">${'<div class="skel" style="height:60px;margin:10px 0"></div>'.repeat(3)}</div>`;
  const n = await D.serverNotifs();
  store.set((x) => ({ seen: { ...x.seen, notifs: Date.now() } }));
  $('#nl', v).innerHTML = Array.isArray(n) && n.length ? n.map((x) => `<a class="row" ${x.s ? `href="#/a/${encodeURIComponent(x.s)}"` : ''} style="grid-template-columns:1fr auto;color:inherit"><div class="nm"><b style="white-space:normal">${esc(x.title)}</b><span style="white-space:normal">${esc(x.msg || '')}</span></div><span class="small dim">${F.ago(x.t, t)}</span></a>`).join('')
    : `<div class="empty"><b>${t('noNotifs')}</b><p class="small">${store.s.token ? t('noNotifsD') : t('pushOffD')}</p><a class="btn" href="#/alertas">${t('alerts')}</a></div>`;
}
