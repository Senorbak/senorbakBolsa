// Mapa de calor a pantalla completa
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, esc } from './ui.js';
import { treemap, heatColor } from './charts.js';
import { UNIVERSE, BY } from './universe.js';
export async function render(v, _, { app }) {
  app.setTitle(t('heatmap'), { back: true });
  let g = 'es', by = 'day';
  v.innerHTML = `<div class="seg" id="hg" style="margin-top:10px">${[['es', 'Madrid'], ['us', 'EE. UU.'], ['eu', 'Europa'], ['asia', 'Asia']].map(([k, l]) => `<button data-k="${k}" class="${k === g ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="chips" id="hb" style="margin-top:10px"><button class="chip on" data-b="day">${t('today')}</button><button class="chip" data-b="m1">${t('r_1M')}</button><button class="chip" data-b="y1">${t('r_1Y')}</button></div>
    <div class="heat" id="hm" style="height:calc(100vh - 260px);min-height:420px"></div><p class="note">${t('heatNote')}</p>`;
  const draw = async () => {
    const list = UNIVERSE.filter((u) => u.g === g && u.t === 'stock').map((u) => u.s); const box = $('#hm', v);
    const qs = await D.getQuotes(list).catch(() => []); const m = new Map(qs.map((q) => [q.s, q]));
    let perf = {}; if (by !== 'day') { const sp = await D.sparks(list, by === 'm1' ? '1mo' : '1y').catch(() => ({})); for (const [s, d] of Object.entries(sp)) if (d.c?.length > 2) perf[s] = (d.c[d.c.length - 1] / d.c[0] - 1) * 100; }
    const items = list.map((s) => ({ s, label: BY.get(s).n.replace(/^(Banco|Grupo) /, '').split(/[ (]/)[0].slice(0, 12), w: m.get(s)?.mcap ? m.get(s).mcap / 1e9 : BY.get(s).c || 1, p: by === 'day' ? m.get(s)?.pct : perf[s] }));
    const scale = by === 'y1' ? 10 : by === 'm1' ? 3 : 1;
    box.innerHTML = treemap(items, box.clientWidth, box.clientHeight).map((c) => `<a class="cell ${c.w * c.h > 12000 ? 'big' : c.w * c.h < 1800 ? 'tiny' : ''}" href="#/a/${encodeURIComponent(c.s)}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${heatColor(c.p == null ? null : c.p / scale)}"><b>${esc(c.label)}</b><span>${c.p == null ? '' : F.pct(c.p, 1)}</span></a>`).join('');
  };
  $('#hg', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; g = b.dataset.k; $$('#hg button', v).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  $('#hb', v).onclick = (e) => { const b = e.target.closest('[data-b]'); if (!b) return; by = b.dataset.b; $$('#hb .chip', v).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  draw(); const tm = setInterval(() => document.visibilityState === 'visible' && by === 'day' && draw(), 45000); return () => clearInterval(tm);
}
