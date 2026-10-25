// Marcador de aciertos: ¿han funcionado las recomendaciones?
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, esc, nameOf, sigTag } from './ui.js';
import { scoreLog } from './signals.js';
export async function render(v, _, { app }) {
  app.setTitle(t('scoreboard'), { back: true });
  v.innerHTML = `<p class="muted small" style="margin-top:12px">${t('scoreIntro')}</p><div id="sb">${'<div class="skel" style="height:80px;margin:10px 0"></div>'.repeat(2)}</div>`;
  const log = store.s.signalLog.filter((e) => e.lab !== 'hold');
  // Una entrada por valor, horizonte y semana para no contar varias veces la misma señal
  const seen = new Set(); const uniq = log.filter((e) => { const k = e.s + e.h + Math.floor(e.d / (7 * 864e5)); if (seen.has(k)) return false; seen.add(k); return true; });
  const due = uniq.filter((e) => Date.now() > e.d + (e.h === 's' ? 14 : 180) * 864e5);
  const prices = new Map(); await Promise.all([...new Set(due.map((e) => e.s))].map(async (s) => { try { prices.set(s, await D.candles(s, 'B')); } catch {} }));
  const closeOn = (s, ts) => { const k = prices.get(s); if (!k) return null; let b = null; for (const c of k) { if (c.time * 1000 <= ts) b = c.close; else break; } return b; };
  const r = scoreLog(uniq, closeOn);
  const byH = (h) => { const x = r.rows.filter((e) => e.h === h && e.st !== 'wait'); const ok = x.filter((e) => e.st === 'ok').length; return { n: x.length, ok, pct: x.length ? (ok / x.length) * 100 : null }; };
  const S = byH('s'), L = byH('l'); const waiting = r.rows.filter((e) => e.st === 'wait').length;
  $('#sb', v).innerHTML = `<div class="kpis"><div class="kpi"><span>${t('shortTerm')}</span><b>${S.pct != null ? F.pct(S.pct, 0, false) : '—'}</b><span>${t('hitsOf', S.ok, S.n)}</span></div><div class="kpi"><span>${t('longTerm')}</span><b>${L.pct != null ? F.pct(L.pct, 0, false) : '—'}</b><span>${t('hitsOf', L.ok, L.n)}</span></div><div class="kpi"><span>${t('pending')}</span><b>${waiting}</b><span>${t('stillOpen')}</span></div></div>
    <p class="note">${t('scoreNote')}</p>
    <div class="sec"><h2>${t('latestSignals')}</h2></div>
    <table class="table"><tr><th>${t('asset')}</th><th>${t('signal')}</th><th class="r">${t('result')}</th></tr>${r.rows.sort((a, b) => b.d - a.d).slice(0, 60).map((e) => `<tr><td><a href="#/a/${encodeURIComponent(e.s)}">${esc(nameOf(e.s))}</a><br><span class="dim small">${F.date(e.d)} · ${e.h === 's' ? t('short') : t('long')} · ${F.price(e.p)}</span></td><td>${sigTag(e.lab)}</td><td class="r">${e.st === 'wait' ? `<span class="dim small">${t('waiting')}</span>` : `<b class="${e.st === 'ok' ? 'up' : 'down'}">${e.st === 'ok' ? '✓' : '✗'}</b> <span class="small ${F.cls(e.r)}">${F.pct(e.r * 100, 1)}</span>`}</td></tr>`).join('') || `<tr><td colspan="3" class="dim small">${t('noSignalsYet')}</td></tr>`}</table>
    <div class="card" style="margin-top:14px"><b>${t('alsoBacktest')}</b><p class="small muted" style="margin:6px 0 10px">${t('alsoBacktestD')}</p><a class="btn" href="#/simulador">${t('simulator')}</a></div>`;
}
