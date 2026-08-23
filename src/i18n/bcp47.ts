export const BCP47: Record<string, string> = {
  en: 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
  pt: 'pt',
  it: 'it',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  ar: 'ar',
  hi: 'hi',
  ru: 'ru',
  nl: 'nl',
  tr: 'tr',
  vi: 'vi',
  he: 'he',
};

export const dateLocaleFromCode = (code: string): string => BCP47[code] || 'en';
