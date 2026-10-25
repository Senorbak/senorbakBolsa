// Markdown mínimo y seguro para las respuestas de la IA
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inline(s, refs) {
  s = esc(s);
  s = s.replace(/\[\[grafica:(\d+)\]\]/gi, '<span data-chart-slot="$1"></span>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\((#\/[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_, t, u) => u.startsWith('#') ? `<a href="${u}">${t}</a>` : `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\[((?:[DN]\d+)(?:\s*,\s*[DN]\d+)*)\]/g, (_, list) => list.split(/\s*,\s*/).map((r) => { const x = refs?.(r); return x ? (x.url ? `<sup class="cite"><a href="${esc(x.url)}" target="_blank" rel="noopener">${r}</a></sup>` : `<sup class="cite">${r}</sup>`) : ''; }).join(''));
  return s;
}
export function md(text, refs) {
  const lines = String(text || '').replace(/\r/g, '').split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*\|/.test(l)) { const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; } const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); out.push(`<div class="mdt"><table class="table">${cells.map((r, k) => `<tr>${r.map((c) => (k === 0 ? `<th>${inline(c, refs)}</th>` : `<td>${inline(c, refs)}</td>`)).join('')}</tr>`).join('')}</table></div>`); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { out.push(`<h${Math.min(4, h[1].length + 2)}>${inline(h[2], refs)}</h${Math.min(4, h[1].length + 2)}>`); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) { const ord = /^\s*\d/.test(l); const items = []; while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++; } out.push(`<${ord ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x, refs)}</li>`).join('')}</${ord ? 'ol' : 'ul'}>`); continue; }
    if (/^\s*---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^\s*(\||#{1,4}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join('\n'), refs).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}
