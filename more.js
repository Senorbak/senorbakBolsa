// Más: el resto de herramientas
import { t } from './i18n.js';
import { I, $, avatar, demoBanner } from './ui.js';
import * as D from './data.js';
import * as F from './fmt.js';
export async function render(v) {
  const T = (h, ic, k, d, cls = '') => `<a class="tilebig ${cls}" href="${h}">${ic}<div class="grow"><b>${t(k)}</b><br><span>${t(d)}</span></div></a>`;
  v.innerHTML = `${demoBanner(D.refreshStatus())}<a class="tilebig feat" href="#/bitcoin" style="margin-top:12px">${avatar('BTC-EUR')}<div class="grow"><b>Bitcoin</b><br><span>${t('btcD')}</span></div><div style="text-align:right"><b id="bp" class="xs">—</b><div class="small" id="bc"></div></div></a>
    <div class="grid2" style="margin-top:10px">
      ${T('#/alertas', I.bell, 'alerts', 'alertsD')}${T('#/calendario', I.cal, 'calendar', 'calendarD')}
      ${T('#/simulador', I.flask, 'simulator', 'simD')}${T('#/marcador', I.trophy, 'scoreboard', 'scoreD')}
      ${T('#/filtros', I.filter, 'screener', 'screenerD')}${T('#/comparar', I.compare, 'compare', 'compareD')}
      ${T('#/mapa', I.heat, 'heatmap', 'heatD')}${T('#/renta', I.receipt, 'taxes', 'taxesD')}
      ${T('#/brokers', I.bank, 'brokers', 'brokersD', 'feat')}
      ${T('#/ajustes', I.gear, 'settings', 'settingsD', 'feat')}
    </div>`;
  const [q] = await D.getQuotes(['BTC-EUR']).catch(() => []);
  const paint = (x) => { if (!x || !$('#bp', v)) return; $('#bp', v).textContent = F.price(x.price, 'EUR', 0); $('#bc', v).innerHTML = `<span class="${F.cls(x.pct)}">${F.pct(x.pct)}</span>`; };
  paint(q); return D.watch(['BTC-EUR'], paint);
}
