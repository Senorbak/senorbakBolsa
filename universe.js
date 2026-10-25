// Catálogo base de inversiones. Cualquier otro valor del mundo se puede añadir con el buscador.
// t: index | stock | etf | cmd | fx | crypto | bond   g: grupo de mercado   c: capitalización aprox. (miles de millones, solo para el tamaño en el mapa de calor)
const L = (g, cur, t, rows) => rows.map(([s, n, sec, c]) => ({ s, n, sec, c, g, cur, t }));
export const UNIVERSE = [
  ...L('idx', null, 'index', [
    ['^IBEX', 'IBEX 35', 'España'], ['^GSPC', 'S&P 500', 'EE. UU.'], ['^IXIC', 'Nasdaq', 'EE. UU.'], ['^DJI', 'Dow Jones', 'EE. UU.'],
    ['^STOXX50E', 'Euro Stoxx 50', 'Eurozona'], ['^GDAXI', 'DAX', 'Alemania'], ['^FCHI', 'CAC 40', 'Francia'], ['^FTSE', 'FTSE 100', 'Reino Unido'],
    ['FTSEMIB.MI', 'FTSE MIB', 'Italia'], ['^N225', 'Nikkei 225', 'Japón'], ['^HSI', 'Hang Seng', 'Hong Kong'], ['000001.SS', 'Shanghai', 'China'], ['^VIX', 'VIX (miedo)', 'EE. UU.'],
  ]),
  ...L('es', 'EUR', 'stock', [
    ['ITX.MC', 'Inditex', 'Consumo', 160], ['SAN.MC', 'Banco Santander', 'Banca', 130], ['IBE.MC', 'Iberdrola', 'Energía', 110], ['BBVA.MC', 'BBVA', 'Banca', 90],
    ['CABK.MC', 'CaixaBank', 'Banca', 55], ['FER.MC', 'Ferrovial', 'Infraestructuras', 35], ['AENA.MC', 'Aena', 'Infraestructuras', 38], ['AMS.MC', 'Amadeus', 'Tecnología', 30],
    ['TEF.MC', 'Telefónica', 'Telecom', 25], ['REP.MC', 'Repsol', 'Energía', 18], ['CLNX.MC', 'Cellnex', 'Telecom', 25], ['IAG.MC', 'IAG', 'Transporte', 22],
    ['ELE.MC', 'Endesa', 'Energía', 28], ['NTGY.MC', 'Naturgy', 'Energía', 25], ['ACS.MC', 'ACS', 'Infraestructuras', 18], ['SAB.MC', 'Banco Sabadell', 'Banca', 15],
    ['BKT.MC', 'Bankinter', 'Banca', 11], ['MAP.MC', 'Mapfre', 'Seguros', 10], ['RED.MC', 'Redeia', 'Energía', 9], ['ENG.MC', 'Enagás', 'Energía', 4],
    ['GRF.MC', 'Grifols', 'Salud', 7], ['IDR.MC', 'Indra', 'Tecnología', 6], ['ANA.MC', 'Acciona', 'Infraestructuras', 8], ['ANE.MC', 'Acciona Energía', 'Energía', 6],
    ['MTS.MC', 'ArcelorMittal', 'Materiales', 24], ['PUIG.MC', 'Puig', 'Consumo', 10], ['UNI.MC', 'Unicaja', 'Banca', 5], ['LOG.MC', 'Logista', 'Transporte', 4],
    ['MRL.MC', 'Merlin Properties', 'Inmobiliaria', 6], ['COL.MC', 'Colonial', 'Inmobiliaria', 3.5], ['ACX.MC', 'Acerinox', 'Materiales', 2.8], ['FDR.MC', 'Fluidra', 'Industria', 4.5],
    ['ROVI.MC', 'Rovi', 'Salud', 3.5], ['SCYR.MC', 'Sacyr', 'Infraestructuras', 2.5], ['SLR.MC', 'Solaria', 'Energía', 1.5],
  ]),
  ...L('us', 'USD', 'stock', [
    ['NVDA', 'NVIDIA', 'Tecnología', 4500], ['MSFT', 'Microsoft', 'Tecnología', 3900], ['AAPL', 'Apple', 'Tecnología', 5100], ['AMZN', 'Amazon', 'Consumo', 2600],
    ['GOOGL', 'Alphabet (Google)', 'Comunicación', 3000], ['META', 'Meta', 'Comunicación', 1800], ['AVGO', 'Broadcom', 'Tecnología', 1600], ['TSLA', 'Tesla', 'Consumo', 1400],
    ['BRK-B', 'Berkshire Hathaway', 'Finanzas', 1050], ['JPM', 'JPMorgan', 'Banca', 820], ['LLY', 'Eli Lilly', 'Salud', 800], ['V', 'Visa', 'Finanzas', 680],
    ['ORCL', 'Oracle', 'Tecnología', 700], ['WMT', 'Walmart', 'Consumo', 800], ['MA', 'Mastercard', 'Finanzas', 520], ['XOM', 'ExxonMobil', 'Energía', 480],
    ['NFLX', 'Netflix', 'Comunicación', 500], ['COST', 'Costco', 'Consumo', 420], ['JNJ', 'Johnson & Johnson', 'Salud', 420], ['PG', 'Procter & Gamble', 'Consumo', 360],
    ['HD', 'Home Depot', 'Consumo', 380], ['PLTR', 'Palantir', 'Tecnología', 420], ['AMD', 'AMD', 'Tecnología', 380], ['BAC', 'Bank of America', 'Banca', 360],
    ['UNH', 'UnitedHealth', 'Salud', 300], ['KO', 'Coca-Cola', 'Consumo', 300], ['CRM', 'Salesforce', 'Tecnología', 240], ['CSCO', 'Cisco', 'Tecnología', 270],
    ['ABBV', 'AbbVie', 'Salud', 400], ['CVX', 'Chevron', 'Energía', 310], ['IBM', 'IBM', 'Tecnología', 270], ['MCD', "McDonald's", 'Consumo', 220],
    ['PEP', 'PepsiCo', 'Consumo', 200], ['MRK', 'Merck', 'Salud', 220], ['DIS', 'Disney', 'Comunicación', 200], ['GS', 'Goldman Sachs', 'Banca', 240],
    ['ADBE', 'Adobe', 'Tecnología', 150], ['QCOM', 'Qualcomm', 'Tecnología', 180], ['CAT', 'Caterpillar', 'Industria', 260], ['BA', 'Boeing', 'Industria', 160],
    ['UBER', 'Uber', 'Transporte', 190], ['INTC', 'Intel', 'Tecnología', 160], ['PFE', 'Pfizer', 'Salud', 140], ['T', 'AT&T', 'Telecom', 190],
    ['NKE', 'Nike', 'Consumo', 100], ['SBUX', 'Starbucks', 'Consumo', 100], ['PYPL', 'PayPal', 'Finanzas', 65], ['COIN', 'Coinbase', 'Finanzas', 80],
    ['MSTR', 'Strategy (MicroStrategy)', 'Tecnología', 70], ['TSM', 'TSMC', 'Tecnología', 1500],
  ]),
  ...L('eu', 'EUR', 'stock', [
    ['ASML.AS', 'ASML', 'Tecnología', 330], ['SAP.DE', 'SAP', 'Tecnología', 260], ['MC.PA', 'LVMH', 'Consumo', 300], ['SIE.DE', 'Siemens', 'Industria', 190],
    ['TTE.PA', 'TotalEnergies', 'Energía', 130], ['AIR.PA', 'Airbus', 'Industria', 160], ['OR.PA', "L'Oréal", 'Consumo', 200], ['RMS.PA', 'Hermès', 'Consumo', 240],
    ['ALV.DE', 'Allianz', 'Seguros', 140], ['DTE.DE', 'Deutsche Telekom', 'Telecom', 150], ['SAN.PA', 'Sanofi', 'Salud', 120], ['SU.PA', 'Schneider Electric', 'Industria', 130],
    ['RHM.DE', 'Rheinmetall', 'Defensa', 80], ['BNP.PA', 'BNP Paribas', 'Banca', 85], ['ENEL.MI', 'Enel', 'Energía', 85], ['UCG.MI', 'UniCredit', 'Banca', 100],
    ['ISP.MI', 'Intesa Sanpaolo', 'Banca', 95], ['RACE.MI', 'Ferrari', 'Consumo', 75], ['BMW.DE', 'BMW', 'Consumo', 55], ['MBG.DE', 'Mercedes-Benz', 'Consumo', 55],
    ['VOW3.DE', 'Volkswagen', 'Consumo', 50], ['BAS.DE', 'BASF', 'Materiales', 42], ['ADYEN.AS', 'Adyen', 'Finanzas', 45], ['INGA.AS', 'ING', 'Banca', 60],
  ]),
  ...L('eu2', null, 'stock', [
    ['NOVO-B.CO', 'Novo Nordisk', 'Salud', 250], ['NESN.SW', 'Nestlé', 'Consumo', 220], ['ROG.SW', 'Roche', 'Salud', 230], ['NOVN.SW', 'Novartis', 'Salud', 220],
    ['UBSG.SW', 'UBS', 'Banca', 100], ['SHEL.L', 'Shell', 'Energía', 190], ['AZN.L', 'AstraZeneca', 'Salud', 210], ['HSBA.L', 'HSBC', 'Banca', 200],
    ['ULVR.L', 'Unilever', 'Consumo', 140], ['BP.L', 'BP', 'Energía', 75], ['RIO.L', 'Rio Tinto', 'Materiales', 85],
  ]),
  ...L('asia', null, 'stock', [
    ['7203.T', 'Toyota', 'Consumo', 280], ['6758.T', 'Sony', 'Tecnología', 150], ['9984.T', 'SoftBank', 'Tecnología', 120], ['0700.HK', 'Tencent', 'Comunicación', 600],
    ['9988.HK', 'Alibaba', 'Consumo', 300], ['1810.HK', 'Xiaomi', 'Tecnología', 150], ['1211.HK', 'BYD', 'Consumo', 130], ['005930.KS', 'Samsung', 'Tecnología', 350],
  ]),
  ...L('etf', null, 'etf', [
    ['VWCE.DE', 'Vanguard FTSE All-World', 'Mundo'], ['IWDA.AS', 'iShares MSCI World', 'Mundo'], ['CSPX.L', 'iShares S&P 500', 'EE. UU.'], ['SPY', 'SPDR S&P 500', 'EE. UU.'],
    ['QQQ', 'Invesco Nasdaq 100', 'EE. UU.'], ['VOO', 'Vanguard S&P 500', 'EE. UU.'], ['VTI', 'Vanguard Total Market', 'EE. UU.'], ['EWP', 'iShares MSCI España', 'España'],
    ['GLD', 'SPDR Oro', 'Oro'], ['EUNL.DE', 'iShares Core MSCI World', 'Mundo'],
  ]),
  ...L('cmd', 'USD', 'cmd', [
    ['GC=F', 'Oro', 'Metales'], ['SI=F', 'Plata', 'Metales'], ['HG=F', 'Cobre', 'Metales'], ['CL=F', 'Petróleo WTI', 'Energía'],
    ['BZ=F', 'Petróleo Brent', 'Energía'], ['NG=F', 'Gas natural', 'Energía'], ['ZW=F', 'Trigo', 'Agrícolas'],
  ]),
  ...L('fx', null, 'fx', [
    ['EURUSD=X', 'Euro / Dólar', 'Divisas'], ['EURGBP=X', 'Euro / Libra', 'Divisas'], ['EURJPY=X', 'Euro / Yen', 'Divisas'], ['EURCHF=X', 'Euro / Franco suizo', 'Divisas'],
    ['GBPUSD=X', 'Libra / Dólar', 'Divisas'], ['USDJPY=X', 'Dólar / Yen', 'Divisas'],
  ]),
  ...L('bond', null, 'bond', [['^TNX', 'Bono EE. UU. 10 años (rentabilidad)', 'Bonos'], ['^TYX', 'Bono EE. UU. 30 años (rentabilidad)', 'Bonos']]),
  { s: 'BTC-EUR', n: 'Bitcoin', sec: 'Cripto', g: 'crypto', cur: 'EUR', t: 'crypto' },
];
const CUR_BY_SUFFIX = { MC: 'EUR', DE: 'EUR', PA: 'EUR', AS: 'EUR', MI: 'EUR', BR: 'EUR', LS: 'EUR', HE: 'EUR', VI: 'EUR', IR: 'EUR', L: 'GBp', SW: 'CHF', CO: 'DKK', ST: 'SEK', OL: 'NOK', T: 'JPY', HK: 'HKD', KS: 'KRW', SS: 'CNY', SZ: 'CNY', TW: 'TWD', TO: 'CAD', AX: 'AUD' };
export const BY = new Map(UNIVERSE.map((u) => [u.s, u]));
export function info(s) {
  if (BY.has(s)) return BY.get(s);
  const suf = s.includes('.') ? s.split('.').pop() : '';
  const t = s.startsWith('^') ? 'index' : s.endsWith('=X') ? 'fx' : s.endsWith('=F') ? 'cmd' : 'stock';
  return { s, n: s, sec: '', g: 'other', cur: CUR_BY_SUFFIX[suf] || (t === 'stock' && !suf ? 'USD' : null), t };
}
export const isUS = (s) => /^[A-Z][A-Z.\-]{0,6}$/.test(s) && !s.includes('.') || /^[A-Z]{1,5}-[A-Z]$/.test(s);
export const isBTC = (s) => s === 'BTC-EUR' || s === 'BTC-USD';
// Mercados y su horario (hora local de cada bolsa)
export const EXCHANGES = {
  MC: { n: 'Madrid', tz: 'Europe/Madrid', o: [9, 0], c: [17, 30] },
  US: { n: 'Nueva York', tz: 'America/New_York', o: [9, 30], c: [16, 0] },
  EU: { n: 'Fráncfort', tz: 'Europe/Berlin', o: [9, 0], c: [17, 30] },
  L: { n: 'Londres', tz: 'Europe/London', o: [8, 0], c: [16, 30] },
  T: { n: 'Tokio', tz: 'Asia/Tokyo', o: [9, 0], c: [15, 30] },
  HK: { n: 'Hong Kong', tz: 'Asia/Hong_Kong', o: [9, 30], c: [16, 0] },
};
export function exchangeOf(s) {
  if (isBTC(s)) return null;
  const suf = s.includes('.') ? s.split('.').pop() : '';
  if (s === '^IBEX' || suf === 'MC') return 'MC';
  if (['DE', 'PA', 'AS', 'MI', 'SW', 'CO'].includes(suf) || ['^GDAXI', '^FCHI', '^STOXX50E'].includes(s) || s === 'FTSEMIB.MI') return 'EU';
  if (suf === 'L' || s === '^FTSE') return 'L';
  if (suf === 'T' || s === '^N225') return 'T';
  if (suf === 'HK' || s === '^HSI' || suf === 'SS' || suf === 'KS') return 'HK';
  return 'US';
}
export function isOpen(ex, now = new Date()) {
  const e = EXCHANGES[ex]; if (!e) return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: e.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const m = +p.hour * 60 + +p.minute;
  return m >= e.o[0] * 60 + e.o[1] && m < e.c[0] * 60 + e.c[1];
}
