// Asistente IA: habla con un modelo de lenguaje que usa los datos de la app como herramientas
import { store } from './store.js';
import * as D from './data.js';
import { info, isBTC, isUS, UNIVERSE, BY, isOpen } from './universe.js';
import { analyze, adviceFor } from './signals.js';
import { volatility } from './indicators.js';
import { lang } from './i18n.js';

/* ------------------------------ motores ------------------------------ */
export function engine() {
  const s = store.s; const pref = s.ai?.engine || 'auto';
  const has = { claude: !!s.keys.anthropic, groq: !!s.keys.groq, cloudflare: !!(s.worker && s.token) };
  if (pref !== 'auto' && has[pref]) return pref;
  return has.claude ? 'claude' : has.groq ? 'groq' : has.cloudflare ? 'cloudflare' : null;
}
export const ENGINE_NAME = { claude: 'Claude', groq: 'Groq · GPT-OSS 120B', cloudflare: 'Cloudflare Workers AI' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(url, headers, body, ms = 60000) {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: c.signal }); const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { error: { message: txt.slice(0, 200) } }; } if (!r.ok) { const e = new Error(j.error?.message || j.error || 'HTTP ' + r.status); e.status = r.status; e.retry = +(r.headers.get('retry-after') || 0); throw e; } return j; }
  finally { clearTimeout(tm); }
}
// Formato interno: mensajes estilo OpenAI. Devuelve { content, calls: [{id, name, args}] }
async function callModel(eng, messages, tools) {
  if (eng === 'groq') {
    const models = ['openai/gpt-oss-120b', 'meta-llama/llama-4-scout-17b-16e-instruct']; let waits = 0;
    for (let i = 0; i < models.length; i++) {
      try {
        const body = { model: models[i], messages, temperature: 0.35, max_completion_tokens: 2200 };
        if (tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
        if (models[i].includes('gpt-oss')) body.reasoning_effort = 'low';
        return fromOpenAI(await post('https://api.groq.com/openai/v1/chat/completions', { Authorization: 'Bearer ' + store.s.keys.groq }, body));
      } catch (e) {
        if (e.status === 429 && e.retry && e.retry <= 8 && waits < 2) { waits++; await sleep(e.retry * 1000 + 300); i--; continue; } // espera corta y reintenta
        if ((e.status === 429 || e.status === 413 || e.status >= 500) && i < models.length - 1) continue; // prueba el otro modelo
        throw e;
      }
    }
  }
  if (eng === 'cloudflare') {
    const W = (store.s.worker || '').replace(/\/$/, '');
    const j = await post(W + '/ai', { Authorization: 'Bearer ' + store.s.token }, { model: '@cf/openai/gpt-oss-120b', messages, tools: tools.length ? tools : undefined, max_tokens: 2200 }, 90000);
    return fromOpenAI(j);
  }
  if (eng === 'claude') {
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const msgs = []; for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'user') msgs.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') { const c = []; if (m.content) c.push({ type: 'text', text: m.content }); for (const t of m.tool_calls || []) c.push({ type: 'tool_use', id: t.id, name: t.function.name, input: JSON.parse(t.function.arguments || '{}') }); msgs.push({ role: 'assistant', content: c }); }
      else if (m.role === 'tool') { const last = msgs[msgs.length - 1]; const block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }; if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') last.content.push(block); else msgs.push({ role: 'user', content: [block] }); }
    }
    const model = store.s.ai?.claudeModel || 'claude-sonnet-5-5';
    const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': store.s.keys.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, { model, max_tokens: 2500, system: sys, messages: msgs, ...(tools.length ? { tools: tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) } : {}) }, 90000);
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const calls = (j.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: c.input || {} }));
    return { content: text, calls };
  }
  throw new Error('noengine');
}
function fromOpenAI(j) {
  const m = j.choices?.[0]?.message || {};
  const calls = (m.tool_calls || []).map((c, i) => { let args = {}; try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments || {}; } catch {} return { id: c.id || 'call' + i + Date.now(), name: c.function.name, args }; });
  return { content: m.content || '', calls };
}

/* ------------------------------ herramientas ------------------------------ */
const S = (props, req = []) => ({ type: 'object', properties: props, required: req });
const sym = { type: 'string', description: 'Símbolo de Yahoo Finanzas, p. ej. ITX.MC, SAN.MC, AAPL, ^IBEX, BTC-EUR, GC=F, EURUSD=X' };
export function toolDefs() {
  const T = [
    ['get_quote', 'Precio actual y datos del día de uno o varios valores.', S({ symbols: { type: 'array', items: { type: 'string' }, description: 'Hasta 12 símbolos' } }, ['symbols'])],
    ['search_symbol', 'Busca el símbolo de una empresa, índice, ETF, materia prima o divisa por su nombre.', S({ query: { type: 'string' } }, ['query'])],
    ['get_history', 'Evolución histórica de un valor: rentabilidad, máximos, mínimos, volatilidad, peor caída y puntos de la serie.', S({ symbol: sym, range: { type: 'string', enum: ['1W', '1M', '3M', '1Y', '5Y'] } }, ['symbol', 'range'])],
    ['analyze', 'Recomendación técnica de la app a corto y largo plazo con sus motivos, la fiabilidad histórica de señales parecidas, niveles (soporte, resistencia, stop sugerido) y una prueba de seguir las señales 2 años.', S({ symbol: sym }, ['symbol'])],
    ['get_fundamentals', 'Datos de la empresa: PER, BPA, dividendo, capitalización, márgenes, crecimiento, opinión de analistas y precio objetivo, próximos resultados, sector y descripción.', S({ symbol: sym }, ['symbol'])],
    ['get_news', 'Noticias recientes (con su tono positivo o negativo). Sin símbolo devuelve las del mercado en general.', S({ symbol: sym, limit: { type: 'integer' } })],
    ['get_portfolio', 'La cartera del usuario: posiciones, valor en euros, ganancias o pérdidas, reparto, stops y el consejo de la app para cada una. También el simulador.', S({})],
    ['get_market_overview', 'Resumen del mercado: índices principales, bitcoin, índice de miedo y codicia, y los valores que más suben y bajan hoy.', S({})],
    ['get_calendar', 'Próximos eventos: resultados de empresas, dividendos y reuniones del BCE y la Fed.', S({})],
    ['simulate_investment', '¿Cuánto valdría hoy una inversión hecha en una fecha pasada?', S({ symbol: sym, amount_eur: { type: 'number' }, date: { type: 'string', description: 'AAAA-MM-DD' } }, ['symbol', 'amount_eur', 'date'])],
    ['show_chart', 'Muestra una gráfica al usuario dentro de la respuesta. Úsala para explicar visualmente. Tipos: price (precio de un valor, con indicadores opcionales), compare (varios valores en % desde el inicio), allocation (reparto de la cartera), bars (barras con datos que tú das).', S({ kind: { type: 'string', enum: ['price', 'compare', 'allocation', 'bars'] }, symbols: { type: 'array', items: { type: 'string' } }, range: { type: 'string', enum: ['1D', '1W', '1M', '3M', '1Y', '5Y'] }, indicators: { type: 'array', items: { type: 'string', enum: ['sma', 'bb', 'rsi', 'macd', 'volume', 'levels'] } }, title: { type: 'string' }, bars: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } } } }, unit: { type: 'string' } }, ['kind', 'title'])],
  ];
  if (store.s.keys.groq) T.push(['web_search', 'Busca en internet información reciente que no tenga la app (contexto de una noticia, opiniones, datos macro). Devuelve un resumen con enlaces.', S({ query: { type: 'string' } }, ['query'])]);
  return T.map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }));
}
const r2 = (x, d = 2) => (x == null || !isFinite(x) ? null : +x.toFixed(d));
const nm = (s, q) => (BY.get(s)?.n || q?.name || s);
function srcOf(s) { return isBTC(s) ? 'Binance' : D.refreshStatus().worker ? 'Yahoo Finanzas (vía tu servidor)' : isUS(s) ? 'Finnhub' : 'datos de la app'; }

export async function runTool(name, a, ctx) {
  const ref = (label) => ctx.addSource(label);
  switch (name) {
    case 'get_quote': {
      const list = (a.symbols || []).slice(0, 12); const qs = await D.getQuotes(list);
      return qs.map((q) => ({ symbol: q.s, name: nm(q.s, q), price: r2(q.price, 4), currency: q.cur, change_today_pct: r2(q.pct), prev_close: r2(q.prev, 4), day_high: r2(q.high, 4), day_low: r2(q.low, 4), w52_high: r2(q.w52h, 4), w52_low: r2(q.w52l, 4), pe: r2(q.pe, 1), dividend_yield_pct: r2(q.dy), market_cap: q.mcap || null, price_in_eur: r2(D.toEUR(q.price, q.cur)), time: q.t ? new Date(q.t).toISOString() : null, ref: ref(`Precio de ${nm(q.s, q)}: ${srcOf(q.s)}${q.t ? ', ' + new Date(q.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`) }));
    }
    case 'search_symbol': return (await D.search(a.query || '')).slice(0, 8).map((x) => ({ symbol: x.s, name: x.n, type: x.t, exchange: x.ex }));
    case 'get_history': {
      const k = await D.candles(a.symbol, a.range || '1Y'); if (!k?.length) return { error: 'sin datos' };
      const c = k.map((x) => x.close); let pk = c[0], dd = 0; for (const p of c) { pk = Math.max(pk, p); dd = Math.min(dd, p / pk - 1); }
      const step = Math.max(1, Math.ceil(k.length / 30)); const pts = k.filter((_, i) => i % step === 0 || i === k.length - 1).map((x) => [new Date(x.time * 1000).toISOString().slice(0, 10), r2(x.close, 4)]);
      return { symbol: a.symbol, name: nm(a.symbol), range: a.range, start: pts[0], end: pts[pts.length - 1], return_pct: r2((c[c.length - 1] / c[0] - 1) * 100), max: r2(Math.max(...c), 4), min: r2(Math.min(...c), 4), volatility_annual_pct: r2((volatility(c, Math.min(c.length - 1, 250)) || 0) * 100), max_drawdown_pct: r2(dd * 100), points: pts, ref: ref(`Histórico de ${nm(a.symbol)} (${a.range}): ${srcOf(a.symbol)}`) };
    }
    case 'analyze': {
      const k = await D.candles(a.symbol, 'B'); const [an, f, tone] = await Promise.all([D.analysts(a.symbol), D.fundamentals(a.symbol).catch(() => ({})), D.newsTone(a.symbol).catch(() => ({}))]);
      const r = analyze(k, { analyst: an || f.analyst, news: tone.tone, newsN: tone.n, pe: f.pe }); if (!r) return { error: 'historial insuficiente' };
      const { reasonText } = await import('./asset.js');
      const why = (fs) => fs.slice().sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6).map(([kk, v, raw]) => ({ reason: reasonText(kk, raw, v), effect: v > 0.12 ? 'a favor' : v < -0.12 ? 'en contra' : 'neutral' }));
      const h = (x, hz) => ({ label: { sbuy: 'compra fuerte', buy: 'compra', hold: 'mantener', sell: 'venta', ssell: 'venta fuerte' }[x.label], score: x.score, horizon: hz, historical_up_probability_pct: x.prob != null ? r2(x.prob * 100, 0) : null, historical_avg_return_pct: x.avg != null ? r2(x.avg * 100, 1) : null, similar_cases: x.n, base_up_probability_pct: x.base != null ? r2(x.base * 100, 0) : null, reasons: why(x.factors) });
      return { symbol: a.symbol, name: nm(a.symbol), price: r2(r.price, 4), short_term: h(r.s, '2 semanas'), long_term: h(r.l, '6 meses'), levels: { support: r2(r.levels.support, 4), resistance: r2(r.levels.resistance, 4), suggested_stop: r2(r.levels.stop, 4), suggested_target: r2(r.levels.target, 4) }, backtest_2y: { following_signals_pct: r2(r.strategy.ret * 100, 1), buy_and_hold_pct: r2(r.strategy.hold * 100, 1), trades: r.strategy.trades, winning_trades: r.strategy.wins }, ref: ref(`Análisis técnico de senorbakBolsa para ${nm(a.symbol)} (2 años de datos diarios)`) };
    }
    case 'get_fundamentals': {
      const [f, an] = await Promise.all([D.fundamentals(a.symbol).catch(() => ({})), D.analysts(a.symbol)]); const A = an || f.analyst;
      return { symbol: a.symbol, name: f.name || nm(a.symbol), sector: f.industry || BY.get(a.symbol)?.sec || null, pe: r2(f.pe, 1), forward_pe: r2(f.fpe, 1), eps: r2(f.eps), dividend_yield_pct: r2(f.dy), beta: r2(f.beta), market_cap: f.mcap || null, profit_margin_pct: r2(f.margin, 1), roe_pct: r2(f.roe, 1), revenue_growth_pct: r2(f.rev, 1), debt_to_equity: r2(f.debtEq, 1), analysts: A ? { strong_buy: A.strongBuy, buy: A.buy, hold: A.hold, sell: A.sell, strong_sell: A.strongSell } : null, target_price: r2(f.target, 2), target_low: r2(f.targetLo, 2), target_high: r2(f.targetHi, 2), n_analysts: f.nAnalysts || null, next_earnings: f.nextEarnings ? new Date(f.nextEarnings).toISOString().slice(0, 10) : null, ex_dividend: f.exDiv ? new Date(f.exDiv).toISOString().slice(0, 10) : null, about: f.about ? f.about.slice(0, 400) : null, ref: ref(`Datos fundamentales de ${f.name || nm(a.symbol)}: ${D.refreshStatus().worker ? 'Yahoo Finanzas' : ''}${isUS(a.symbol) && store.s.keys.finnhub ? ' y Finnhub' : ''}`) };
    }
    case 'get_news': {
      let n = await D.news(); const lim = Math.min(a.limit || 8, 12);
      if (a.symbol) { const name = nm(a.symbol).split(/[ (,]/)[0].toLowerCase(); n = n.filter((x) => x.syms?.includes(a.symbol) || (name.length > 3 && x.title.toLowerCase().includes(name))); }
      return n.slice(0, lim).map((x) => ({ ref: ctx.addNews(x), title: x.title, source: x.src, date: new Date(x.t).toISOString().slice(0, 16).replace('T', ' '), tone: x.sent > 0.2 ? 'positiva' : x.sent < -0.2 ? 'negativa' : 'neutra', summary: (x.sum || '').slice(0, 220) }));
    }
    case 'get_portfolio': {
      const { portfolioNow } = await import('./portfolio.js'); const pf = await portfolioNow();
      const rows = await Promise.all(pf.rows.map(async (r) => { let an = null; try { an = analyze(await D.candles(r.p.s, 'B'), {}); } catch {} const adv = adviceFor(r.p, r.price, an, null)[0]; return { symbol: r.p.s, name: r.p.n, qty: r2(r.p.qty, 6), avg_buy_price: r2(r.p.price, 4), currency: r.cur, price_now: r2(r.price, 4), value_eur: r2(r.v), pnl_eur: r2(r.pnl), pnl_pct: r2(r.pnlPct), today_eur: r2(r.d), weight_pct: r2((r.v / pf.value) * 100, 1), stop_loss: r.p.stop || null, target: r.p.target || null, buy_date: r.p.date ? new Date(r.p.date).toISOString().slice(0, 10) : null, app_advice: adv.act, short_signal: an?.s.label, long_signal: an?.l.label }; }));
      const sim = store.s.sim;
      return { total_value_eur: r2(pf.value), invested_eur: r2(pf.cost), pnl_eur: r2(pf.pnl), pnl_pct: r2(pf.pnlPct), today_eur: r2(pf.day), today_pct: r2(pf.dayPct), positions: rows, simulator: { cash_eur: r2(sim.cash), positions: sim.pos.length }, ref: ref('Tu cartera en senorbakBolsa (precios en directo, cambio a euros del BCE)') };
    }
    case 'get_market_overview': {
      const idx = ['^IBEX', '^GSPC', '^IXIC', '^STOXX50E', '^GDAXI', '^N225', 'BTC-EUR', 'GC=F', 'BZ=F', 'EURUSD=X'];
      const es = UNIVERSE.filter((u) => u.g === 'es').map((u) => u.s), us = UNIVERSE.filter((u) => u.g === 'us').slice(0, 30).map((u) => u.s);
      const [qs, fg] = await Promise.all([D.getQuotes([...idx, ...es, ...us]), D.fearGreed().catch(() => null)]);
      const m = new Map(qs.map((q) => [q.s, q])); const mv = (l) => l.map((s) => m.get(s)).filter((q) => q?.pct != null).sort((x, y) => y.pct - x.pct);
      const e = mv(es), u = mv(us); const sh = (q) => ({ symbol: q.s, name: nm(q.s, q), change_pct: r2(q.pct) });
      return { indices: idx.map((s) => m.get(s)).filter(Boolean).map((q) => ({ ...sh(q), price: r2(q.price, 2) })), madrid_top: e.slice(0, 3).map(sh), madrid_bottom: e.slice(-3).map(sh), us_top: u.slice(0, 3).map(sh), us_bottom: u.slice(-3).map(sh), fear_greed: fg ? { value: fg.value, parts: fg.parts } : null, markets_open: { madrid: isOpen('MC'), new_york: isOpen('US') }, ref: ref('Resumen de mercado de senorbakBolsa (Yahoo Finanzas, Binance)') };
    }
    case 'get_calendar': { const { collect } = await import('./calendar.js'); const ev = await collect(); ref('Calendario: Reserva Federal, BCE, Finnhub y Yahoo Finanzas'); return ev.slice(0, 25).map((x) => ({ date: x.d, event: x.title, detail: x.msg || null, symbol: x.s || null, in_portfolio: !!x.mine })); }
    case 'simulate_investment': {
      const t0 = Date.parse(a.date); if (!t0) return { error: 'fecha no válida' };
      const k = await D.candles(a.symbol, Date.now() - t0 > 5 * 365 * 864e5 ? 'MAX' : 'A'); const first = k.find((x) => x.time * 1000 >= t0); if (!first) return { error: 'sin datos para esa fecha' };
      const last = k[k.length - 1]; const cur = D.lastQuote(a.symbol)?.cur || info(a.symbol).cur || 'EUR';
      const units = a.amount_eur / D.toEUR(first.close, cur); const now = D.toEUR(last.close, cur) * units;
      return { symbol: a.symbol, name: nm(a.symbol), buy_date: new Date(first.time * 1000).toISOString().slice(0, 10), buy_price: r2(first.close, 4), price_now: r2(last.close, 4), amount_eur: a.amount_eur, value_now_eur: r2(now), return_pct: r2((now / a.amount_eur - 1) * 100), note: 'Cambio de divisa al tipo actual; sin comisiones ni dividendos.', ref: ref(`Simulación con precios históricos de ${nm(a.symbol)}`) };
    }
    case 'show_chart': { const id = ctx.addChart(a); return { ok: true, chart_number: id, tip: `Para colocarla en el texto escribe [[grafica:${id}]]` }; }
    case 'web_search': {
      const j = await post('https://api.groq.com/openai/v1/chat/completions', { Authorization: 'Bearer ' + store.s.keys.groq }, { model: 'groq/compound', messages: [{ role: 'user', content: `Busca en internet y resume en español, con datos concretos y fechas: ${a.query}. Incluye las URLs de las fuentes.` }] }, 60000);
      const m = j.choices?.[0]?.message || {}; const urls = new Map();
      for (const t of m.executed_tools || []) for (const r of t.search_results?.results || []) if (r.url) urls.set(r.url, r.title || r.url);
      for (const u of (m.content || '').match(/https?:\/\/[^\s)\]]+/g) || []) if (!urls.has(u)) urls.set(u, u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]);
      const refs = [...urls.entries()].slice(0, 6).map(([url, title]) => ({ ref: ctx.addNews({ title, url, src: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }), title, url }));
      return { summary: (m.content || '').slice(0, 2500), sources: refs };
    }
  }
  return { error: 'herramienta desconocida' };
}

/* ------------------------------ conversación ------------------------------ */
export function systemPrompt(context) {
  const now = new Date(); const L = lang() === 'eu' ? 'euskera (batua)' : 'español de España';
  const pf = store.s.positions.map((p) => `${p.n || p.s} (${p.s})`).join(', ') || 'ninguna';
  return `Eres el asistente de inversión de senorbakBolsa, una app personal de bolsa y bitcoin. Responde siempre en ${L}, con tono cercano, claro y directo, pensado para leer en el móvil.
Fecha y hora: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Madrid). Bolsa de Madrid ${isOpen('MC') ? 'abierta' : 'cerrada'}; Nueva York ${isOpen('US') ? 'abierta' : 'cerrada'}.
Valores en la cartera del usuario: ${pf}.${context ? '\nContexto de pantalla: ' + context : ''}

Reglas:
- Usa SIEMPRE las herramientas para cualquier precio, dato, señal, noticia o dato de la cartera. Nunca inventes cifras. Si una herramienta falla o no hay datos, dilo.
- Si no sabes el símbolo exacto, usa search_symbol. Madrid usa el sufijo .MC (Inditex = ITX.MC).
- La app solo cubre bitcoin entre las criptomonedas; si preguntan por otras, dilo con amabilidad.
- Cuando la pregunta sea si algo merece la pena, comprar o vender: llama a analyze, get_fundamentals y get_news (y get_portfolio si puede afectar a su cartera). Responde con: **Resumen** (tu valoración en una frase: favorable, neutral o desfavorable, y para qué plazo), **A favor**, **En contra y riesgos**, **Qué vigilar** (niveles de precio, próximos resultados, eventos) y, si tiene sentido para su cartera, una idea práctica (por ejemplo, no concentrar demasiado o poner un stop-loss). Valora con argumentos y datos; no prometas rentabilidades.
- Explica con gráficas: usa show_chart (una o dos como mucho) y colócalas en el texto con [[grafica:N]]. Para conceptos como RSI o medias, muestra la gráfica de un valor real con ese indicador.
- Cita las fuentes con las referencias que devuelven las herramientas, entre corchetes: [D1], [N2]. No escribas tú la lista de fuentes: la app la añade sola.
- Para enlazar a la ficha de un valor dentro de la app usa [Nombre](#/a/SÍMBOLO).
- Usa números al estilo español (1.234,56 €; 3,2 %). Sé conciso: titulares en negrita y listas cortas.
- Al dar una opinión de compra o venta, termina con una sola línea breve: "No es asesoramiento financiero profesional."`;
}

export async function ask(history, userText, { onStatus, onChart, context, signal } = {}) {
  const eng = engine(); if (!eng) throw new Error('noengine');
  const sources = [], news = [], charts = [];
  const ctx = {
    addSource: (label) => { let i = sources.indexOf(label); if (i < 0) { sources.push(label); i = sources.length - 1; } return 'D' + (i + 1); },
    addNews: (n) => { let i = news.findIndex((x) => x.url && x.url === n.url); if (i < 0) { news.push({ title: n.title, url: n.url, src: n.src, t: n.t }); i = news.length - 1; } return 'N' + (i + 1); },
    addChart: (spec) => { charts.push(spec); onChart?.(spec, charts.length); return charts.length; },
  };
  const tools = toolDefs();
  const msgs = [{ role: 'system', content: systemPrompt(context) }, ...history.slice(-12), { role: 'user', content: userText }];
  for (let step = 0; step < 7; step++) {
    if (signal?.aborted) throw new Error('abort');
    onStatus?.({ k: 'think' });
    const r = await callModel(eng, msgs, tools);
    if (!r.calls.length) return { text: r.content || '', sources, news, charts, engine: eng, turn: [{ role: 'user', content: userText }, { role: 'assistant', content: r.content || '' }] };
    msgs.push({ role: 'assistant', content: r.content || '', tool_calls: r.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) });
    const results = await Promise.all(r.calls.map(async (c) => {
      onStatus?.({ k: 'tool', name: c.name, args: c.args });
      let out; try { out = await runTool(c.name, c.args || {}, ctx); } catch (e) { out = { error: String(e.message || e) }; }
      let txt = JSON.stringify(out); if (txt.length > 9000) txt = txt.slice(0, 9000) + '…';
      return { role: 'tool', tool_call_id: c.id, content: txt };
    }));
    msgs.push(...results);
  }
  // Demasiados pasos: pide una respuesta final sin herramientas
  const r = await callModel(eng, [...msgs, { role: 'user', content: 'Con los datos que ya tienes, da ahora la respuesta final.' }], []);
  return { text: r.content || '', sources, news, charts, engine: eng, turn: [{ role: 'user', content: userText }, { role: 'assistant', content: r.content || '' }] };
}
