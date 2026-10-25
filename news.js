// Noticias en tiempo real que pueden mover la bolsa, con su tono y los valores afectados
import { store } from './store.js';
import * as D from './data.js';
import * as F from './fmt.js';
import { t } from './i18n.js';
import { $, $$, esc, demoBanner, nameOf } from './ui.js';
import { isUS } from './universe.js';

export function newsItem(n) {
  const sc = n.sent ?? 0; const cl = sc > 0.2 ? 'p' : sc < -0.2 ? 'n' : 'z';
  const syms = (n.syms || []).slice(0, 3).map((s) => { const q = D.lastQuote(s); return `<a class="tag n" href="#/a/${encodeURIComponent(s)}">${esc(nameOf(s, q).split(' ')[0])}${q?.pct != null ? ` <span class="${F.cls(q.pct)}">${F.pct(q.pct, 1)}</span>` : ''}</a>`; }).join('');
  const href = n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : '';
  return `<article class="news"><div><div class="meta"><i class="sent ${cl}" title="${t('tone')}"></i><span>${esc(n.src || '')}</span><span>·</span><span>${F.ago(n.t, t)}</span>${cl !== 'z' ? `<span class="${cl === 'p' ? 'up' : 'down'}">${cl === 'p' ? t('positive') : t('negative')}</span>` : ''}</div><a ${href} style="color:inherit"><h3>${esc(n.title)}</h3></a>${n.sum ? `<p>${esc(n.sum)}</p>` : ''}${syms ? `<div class="syms">${syms}</div>` : ''}</div>${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy" onerror="this.remove()">` : '<span></span>'}</article>`;
}
export async function render(v) {
  const s = store.s; const st = D.refreshStatus(); let f = 'all';
  v.innerHTML = `${demoBanner(st)}<div class="sec" style="margin-top:12px"><h2>${t('newsT')}</h2><span class="small dim" id="upd"></span></div>
    <div class="chips" id="nf">${[['all', t('all')], ['mine', t('myAssets')], ['es', t('spain')], ['world', t('world')], ['pos', t('positive')], ['neg', t('negative')]].map(([k, l]) => `<button class="chip ${k === f ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="nl">${'<div class="skel" style="height:90px;margin:12px 0"></div>'.repeat(4)}</div><p class="note">${t('newsNote')}</p>`;
  let items = [];
  const mine = new Set([...s.positions.map((p) => p.s), ...s.watch]);
  const paint = () => {
    const sel = items.filter((n) => f === 'all' || (f === 'mine' && n.syms?.some((x) => mine.has(x))) || (f === 'es' && n.lang === 'es') || (f === 'world' && n.lang !== 'es') || (f === 'pos' && n.sent > 0.2) || (f === 'neg' && n.sent < -0.2));
    $('#nl', v).innerHTML = sel.length ? sel.slice(0, 80).map(newsItem).join('') : `<div class="empty"><b>${t('noNews')}</b><p class="small">${f === 'mine' ? t('noNewsMine') : ''}</p></div>`;
  };
  const load = async (force) => { items = await D.news(force); const syms = [...new Set(items.flatMap((n) => n.syms || []))]; if (syms.length) await D.getQuotes(syms.slice(0, 40)).catch(() => {}); if (!$('#nl', v)) return; $('#upd', v).textContent = t('updated', F.time(Date.now())); paint(); store.set((x) => ({ seen: { ...x.seen, news: Date.now() } })); };
  load();
  $('#nf', v).onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; f = b.dataset.f; $$('#nf .chip', v).forEach((x) => x.classList.toggle('on', x === b)); paint(); };
  const tm = setInterval(() => document.visibilityState === 'visible' && load(true), 90000);
  return () => clearInterval(tm);
}
