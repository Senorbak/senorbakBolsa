// Textos en español y euskera
import { ES } from './lang-es.js';
import { EU } from './lang-eu.js';
let L = 'es';
export const setLang = (l) => { L = l === 'eu' ? 'eu' : 'es'; };
export const lang = () => L;
export function t(k, ...a) {
  let s = (L === 'eu' ? EU[k] : undefined) ?? ES[k] ?? k;
  if (typeof s === 'function') return s(...a);
  return a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i] ?? '') : s;
}
