import { LANG_CODES, LANGUAGE_MAP } from '@/i18n/translations';

export const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

const TZ_REGION_CURRENCY: Array<[string, string]> = [
  ['US', 'USD'],
  ['CA', 'CAD'],
  ['GB', 'GBP'],
  ['EU', 'EUR'],
  ['AT', 'EUR'], ['BE', 'EUR'], ['CY', 'EUR'], ['DE', 'EUR'], ['EE', 'EUR'], ['ES', 'EUR'],
  ['FI', 'EUR'], ['FR', 'EUR'], ['GR', 'EUR'], ['IE', 'EUR'], ['IT', 'EUR'], ['LV', 'EUR'],
  ['LT', 'EUR'], ['LU', 'EUR'], ['MT', 'EUR'], ['NL', 'EUR'], ['PT', 'EUR'], ['SI', 'EUR'],
  ['SK', 'EUR'], ['HR', 'EUR'],
  ['AU', 'AUD'], ['NZ', 'NZD'],
  ['JP', 'JPY'], ['CN', 'CNY'], ['IN', 'INR'], ['BR', 'BRL'], ['MX', 'MXN'],
  ['KR', 'KRW'], ['SG', 'SGD'], ['HK', 'HKD'], ['CH', 'CHF'], ['SE', 'SEK'],
  ['NO', 'NOK'], ['DK', 'DKK'], ['IL', 'ILS'], ['RU', 'RUB'],
  ['SA', 'SAR'], ['AE', 'AED'], ['QA', 'QAR'], ['KW', 'KWD'], ['TR', 'TRY'],
  ['ZA', 'ZAR'], ['EG', 'EGP'], ['NG', 'NGN'], ['ID', 'IDR'], ['MY', 'MYR'],
  ['TH', 'THB'], ['VN', 'VND'], ['PH', 'PHP'], ['PK', 'PKR'], ['BD', 'BDT'],
  ['AR', 'ARS'], ['CL', 'CLP'], ['CO', 'COP'], ['PE', 'PEN'], ['PL', 'PLN'],
  ['CZ', 'CZK'], ['RO', 'RON'], ['HU', 'HUF'], ['UA', 'UAH'], ['GR', 'EUR'],
];

export const detectCurrency = (): string => {
  const tz = detectTimezone();
  if (!tz) return 'USD';
  const parts = tz.split('/');
  const region = parts[0];
  if (region === 'America') {
    const city = parts[1];
    const country = city && city.includes('_') ? city.split('_')[1] : city;
    const map: Record<string, string> = {
      New_York: 'USD', Los_Angeles: 'USD', Chicago: 'USD', Denver: 'USD', Phoenix: 'USD',
      Mexico_City: 'MXN', Toronto: 'CAD', Vancouver: 'CAD', Montreal: 'CAD',
      Sao_Paulo: 'BRL', Buenos_Aires: 'ARS', Santiago: 'CLP', Bogota: 'COP', Lima: 'PEN',
      Panama: 'USD', Puerto_Rico: 'USD', Halifax: 'CAD', Winnipeg: 'CAD', Edmonton: 'CAD',
    };
    if (country && map[country]) return map[country];
    return 'USD';
  }
  const match = region ? TZ_REGION_CURRENCY.find(([r]) => r === region) : undefined;
  return match ? match[1] : 'USD';
};

const CODE_TO_LANG: Record<string, string> = LANG_CODES.reduce(
  (acc, code) => {
    const name = Object.keys(LANGUAGE_MAP).find(k => LANGUAGE_MAP[k] === code);
    if (name) acc[code] = name;
    return acc;
  },
  {} as Record<string, string>,
);

export const detectLanguageFromBrowser = (): string => {
  try {
    const raw = navigator.language || '';
    const base = raw.split('-')[0].toLowerCase();
    if (base === 'pt' && raw.toLowerCase().startsWith('pt-br')) return 'Português';
    for (const code of LANG_CODES) {
      if (code === base) return CODE_TO_LANG[code] || 'English';
    }
  } catch {
    // Ignore — defaults to English.
  }
  return 'English';
};