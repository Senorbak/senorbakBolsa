// Comparador: hasta tres valores en la misma gráfica (en %)
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, esc, nameOf, toast } from './ui.js';
import { CompareChart } from './charts.js';
import { searchBox } from './search.js';
import { volatility } from './indicators.js';
let ch = null;
export async function render(v, first, { app }) {
  app.setTitle(t('compare'), { back: true });
  let syms = [first || '^IBEX', first ? '^IBEX' : '^GSPC'].filter((x, i, a) => a.indexOf(x) === i); let range = '1Y';
  v.innerHTML = `<div id="sel" class="chips" style="margin-top:12px"></div><div id="add" style="margin-top:10px"></div>
    <div class="chartbox" id="cc" style="height:280px"></div>
    <div class="seg ranges" id="rg">${['1M', '3M', '1Y', '5Y'].map((r) => `<button data-r="${r}" class="${r === range ? 'on' : ''}">${t('r_' + r)}</button>`).join('')}</div>
    <div class="sec"><h2>${t('summary')}</h2></div><div id="tb"></div>`;
  const cols = ['var(--acc)', 'var(--warn)', 'var(--up)'];
  const draw = async () => {
    $('#sel', v).innerHTML = syms.map((s, i) => `<span class="chip on" style="background:${cols[i]};color:#0f161d">${esc(nameOf(s))} <button data-rm="${esc(s)}" style="margin-left:4px">✕</button></span>`).join('');
    const series = []; for (const s of syms) { try { const k = await D.candles(s, range); series.push({ s, label: nameOf(s).split(' ')[0], k }); } catch {} }
    ch?.destroy(); ch = null; if (series.length && window.LightweightCharts) ch = new CompareChart($('#cc', v), series);
    $('#tb', v).innerHTML = `<table class="table"><tr><th>${t('asset')}</th><th class="r">${t('return')}</th><th class="r">${t('volatility')}</th><th class="r">${t('maxDD')}</th></tr>${series.map((x) => { const c = x.k.map((k) => k.close); let pk = c[0], dd = 0; for (const p of c) { pk = Math.max(pk, p); dd = Math.min(dd, p / pk - 1); } const r = c[c.length - 1] / c[0] - 1; const vol = volatility(c, Math.min(c.length - 1, 250)); return `<tr><td><b>${esc(nameOf(x.s))}</b></td><td class="r ${F.cls(r)}">${F.pct(r * 100, 1)}</td><td class="r">${vol != null ? F.pct(vol * 100, 0, false) : '—'}</td><td class="r down">${F.pct(dd * 100, 1)}</td></tr>`; }).join('')}</table><p class="note">${t('compareNote')}</p>`;
  };
  searchBox($('#add', v), { onPick: (x) => { if (syms.length >= 3) return toast(t('max3')); if (!syms.includes(x.s)) syms.push(x.s); $('#add input', v).value = ''; draw(); } });
  $('#sel', v).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; syms = syms.filter((x) => x !== b.dataset.rm); draw(); };
  $('#rg', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; $$('#rg button', v).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  const wait = () => new Promise((r) => { const i = setInterval(() => { if (window.LightweightCharts) { clearInterval(i); r(); } }, 50); });
  await wait(); draw();
  return () => { ch?.destroy(); ch = null; };
}
