// Tono de un titular financiero (-1 negativo … +1 positivo) con un diccionario propio en español e inglés.
const POS = {
  es: 'sube suben subida subidas dispara disparan dispar récord record máximos máximo gana ganan ganancia ganancias beneficio beneficios supera superan mejora mejoran mejor repunta repuntan rebota rebote recupera recuperan recuperación crece crecen crecimiento impulsa impulso alza alzas avanza avanzan optimismo fuerte sólido sólidos dividendo eleva elevan aumenta aumentan aprueba acuerdo compra adquiere favorable positivo positiva histórico expansión contrato adjudica revaloriza revalorización brilla escala lidera rally firme',
  en: 'surge surges soar soars soared jump jumps jumped rally rallies record high highs gain gains beat beats beating tops upgrade upgraded upgrades rise rises rising rose climb climbs boost boosts strong growth grows profit profits rebound rebounds recovers recovery outperform bullish optimism approval approved wins win deal raises raised buyback dividend expands expansion breakthrough upbeat accelerate',
};
const NEG = {
  es: 'cae caen caída caídas desploma desploman desplome hunde hunden hundimiento pierde pierden pérdida pérdidas recorta recorte recortes baja bajan bajada mínimos mínimo crisis quiebra concurso despidos despide multa sanción investigación demanda advierte alerta peor empeora decepciona decepción retrocede retroceden retroceso incertidumbre miedo pánico recesión inflación aranceles guerra rebaja rebajan deuda impago fraude dimite dimisión huelga retrasa retraso cancela suspende débil desaceleración tensión amenaza vende venta castiga castigo',
  en: 'fall falls fell drop drops dropped plunge plunges plunged slump slumps tumble tumbles sink sinks crash crashes loss losses miss misses missed cut cuts downgrade downgraded downgrades weak weaker warning warns lawsuit probe investigation fine fined recession inflation tariff tariffs war bankruptcy layoffs layoff fraud resign resigns delay delays cancel recall bearish fear fears selloff sell-off slowdown concern concerns risk risks threat decline declines declined lower slides slid',
};
const NEGATORS = /\b(no|sin|not|without|never|nunca|evita|avoids)\b/i;
const mk = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new Set(v.split(/\s+/))]));
const P = mk(POS), N = mk(NEG);
const STRONG = /\b(desploma|hunde|quiebra|plunge|crash|bankruptcy|fraud|fraude|récord|record|dispara|soar|surge)\w*/i;
export function sentiment(text, lang) {
  if (!text) return 0;
  const words = text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  let s = 0, hits = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; let v = 0;
    for (const l of lang ? [lang, lang === 'es' ? 'en' : 'es'] : ['es', 'en']) { if (P[l]?.has(w)) { v = 1; break; } if (N[l]?.has(w)) { v = -1; break; } }
    if (!v) continue;
    const prev = words.slice(Math.max(0, i - 3), i).join(' ');
    if (NEGATORS.test(prev)) v = -v * 0.6;
    const w8 = i < 8 ? 1.4 : 1; // el principio del titular pesa más
    s += v * w8; hits++;
  }
  if (!hits) return 0;
  let r = s / (hits + 1.5);
  if (STRONG.test(text)) r *= 1.4;
  return Math.max(-1, Math.min(1, r));
}
