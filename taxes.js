// Plusvalías para la declaración de la Renta (método FIFO, como exige Hacienda)
import { store } from './store.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, esc, toast, ask } from './ui.js';

// Escalas de la base del ahorro (2026). Común: Ley 7/2024. Foral (Bizkaia, Gipuzkoa, Álava): NF 2/2025, 1/2025 y 3/2025.
const SCALES = {
  comun: [[6000, 19], [50000, 21], [200000, 23], [300000, 27], [Infinity, 30]],
  foral: [[7500, 19], [15000, 20], [30000, 22], [50000, 24], [90000, 25.5], [120000, 26], [240000, 26.5], [300000, 27], [Infinity, 28]],
};
function tax(base, sc) { let left = Math.max(0, base), prev = 0, out = 0; for (const [lim, r] of SCALES[sc]) { const part = Math.min(left, lim - prev); if (part <= 0) break; out += (part * r) / 100; left -= part; prev = lim; } return out; }
export async function render(v, _, { app }) {
  app.setTitle(t('taxes'), { back: true });
  const sales = store.s.sales; const years = [...new Set(sales.map((x) => new Date(x.date).getFullYear()))].sort((a, b) => b - a);
  let y = years[0] || new Date().getFullYear(); let sc = localStorage.getItem('sbTaxScale') || 'foral';
  v.innerHTML = `<p class="muted small" style="margin-top:12px">${t('taxIntro')}</p>
    <div class="seg" id="sc"><button data-k="foral" class="${sc === 'foral' ? 'on' : ''}">${t('foral')}</button><button data-k="comun" class="${sc === 'comun' ? 'on' : ''}">${t('comun')}</button></div>
    <div class="chips" id="yr" style="margin-top:10px">${(years.length ? years : [y]).map((x) => `<button class="chip ${x === y ? 'on' : ''}" data-y="${x}">${x}</button>`).join('')}</div>
    <div id="out"></div>`;
  const paint = () => {
    const ys = sales.filter((x) => new Date(x.date).getFullYear() === y);
    const gains = ys.filter((x) => x.gain > 0).reduce((a, x) => a + x.gain, 0), losses = ys.filter((x) => x.gain < 0).reduce((a, x) => a + x.gain, 0); const net = gains + losses;
    // Regla de los dos meses: pérdidas con recompra del mismo valor ±2 meses
    const wash = ys.filter((x) => x.gain < 0 && store.s.lots.concat(store.s.positions.map((p) => ({ s: p.s, date: p.date }))).some((l) => l.s === x.s && Math.abs(l.date - x.date) < 61 * 864e5 && l.date > x.date - 61 * 864e5));
    $('#out', v).innerHTML = ys.length ? `<div class="kpis" style="margin-top:12px"><div class="kpi"><span>${t('gainsT')}</span><b class="up">${F.eur(gains, 0)}</b></div><div class="kpi"><span>${t('lossesT')}</span><b class="down">${F.eur(losses, 0)}</b></div><div class="kpi"><span>${t('netT')}</span><b class="${F.cls(net)}">${F.eur(net, 0)}</b></div></div>
      <div class="card" style="margin-top:10px"><div style="display:flex;justify-content:space-between"><span class="muted">${t('taxEst')}</span><b>${F.eur(tax(net, sc))}</b></div><p class="note">${t('taxEstNote')}</p></div>
      ${wash.length ? `<div class="adv l2" style="margin-top:10px"><div>${t('washWarn', wash.map((x) => esc(x.n || x.s)).join(', '))}</div></div>` : ''}
      <div class="sec"><h2>${t('salesY', y)}</h2></div>
      <table class="table"><tr><th>${t('asset')}</th><th class="r">${t('transmission')}</th><th class="r">${t('acquisition')}</th><th class="r">${t('result')}</th></tr>
      ${ys.map((x) => `<tr><td><b>${esc(x.n || x.s)}</b><br><span class="dim small">${F.date(x.date, { day: 'numeric', month: 'short' })} · ${F.num(x.qty, 4)} ${t('shares')}</span></td><td class="r">${F.eur(x.qty * x.price * (x.fx || 1) - (x.fee || 0))}</td><td class="r">${F.eur(x.cost)}</td><td class="r ${F.cls(x.gain)}"><b>${F.signed(x.gain, 'EUR')}</b></td></tr>`).join('')}</table>
      <button class="btn wide" id="csv" style="margin-top:14px">${t('exportCsv')}</button>`
      : `<div class="empty"><b>${t('noSales')}</b><p class="small">${t('noSalesD')}</p><a class="btn" href="#/cartera">${t('goPortfolio')}</a></div>`;
    const c = $('#csv', v); if (c) c.onclick = () => { const rows = [['fecha', 'valor', 'cantidad', 'precio_venta', 'importe_transmision_eur', 'valor_adquisicion_eur', 'ganancia_perdida_eur'], ...ys.map((x) => [F.iso(x.date), x.s, x.qty, x.price, (x.qty * x.price * (x.fx || 1) - (x.fee || 0)).toFixed(2), x.cost.toFixed(2), x.gain.toFixed(2)])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv' })); a.download = `plusvalias-${y}.csv`; a.click(); };
  };
  paint();
  $('#sc', v).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sc = b.dataset.k; try { localStorage.setItem('sbTaxScale', sc); } catch {} $$('#sc button', v).forEach((x) => x.classList.toggle('on', x === b)); paint(); };
  $('#yr', v).onclick = (e) => { const b = e.target.closest('[data-y]'); if (!b) return; y = +b.dataset.y; $$('#yr .chip', v).forEach((x) => x.classList.toggle('on', x === b)); paint(); };
}
