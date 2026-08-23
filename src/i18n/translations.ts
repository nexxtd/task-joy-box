import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import pt from './locales/pt';
import it from './locales/it';
import zh from './locales/zh';
import ja from './locales/ja';
import ko from './locales/ko';
import ar from './locales/ar';
import hi from './locales/hi';
import ru from './locales/ru';
import nl from './locales/nl';
import tr from './locales/tr';
import vi from './locales/vi';
import he from './locales/he';
import { PHRASES } from './phrases';

export const LANG_CODES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru', 'nl', 'tr', 'vi', 'he'] as const;
export type LangCode = (typeof LANG_CODES)[number];
export type Translations = Record<string, string>;

export interface LanguageDef {
  code: LangCode;
  native: string;      // Display name in the language's own script
  english: string;     // Display name in English
  rtl?: boolean;
}

// Official supported languages list (matches the product spec).
export const LANGUAGES: LanguageDef[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  { code: 'zh', native: '中文', english: 'Mandarin Chinese' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ko', native: '한국어', english: 'Korean' },
  { code: 'ar', native: 'العربية', english: 'Arabic', rtl: true },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'nl', native: 'Nederlands', english: 'Dutch' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish' },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese' },
];

// Legacy / defensive mapping so previously stored values keep resolving.
// Covers proper native names and the mojibake values seen in old local storage.
const MOJIBAKE_ALIASES: Record<string, LangCode> = {
  'EspaÃ±ol': 'es',
  'FranÃ§ais': 'fr',
  'PortuguÃªs': 'pt',
  'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©': 'ar',
  '×¢×‘×¨×™×ª': 'he',
  'ä¸­æ–‡': 'zh',
  'à¤¹à¤¿à¤¨à¥à¤¦à¥€': 'hi',
  'Ð ÑƒÑÑÐºÐ¸Ð¹': 'ru',
  'æ—¥æœ¬èªž': 'ja',
  'í•œêµ­ì–´': 'ko',
  'ItaliÃ¡no': 'it',
  'NederlÃ¤nds': 'nl',
  'TÃ¼rkÃ§e': 'tr',
  'Tiáº¿ng Viá»‡t': 'vi',
};

export const LANGUAGE_MAP: Record<string, LangCode> = {
  ...Object.fromEntries(LANGUAGES.map(l => [l.native, l.code])),
  ...Object.fromEntries([...Object.entries(MOJIBAKE_ALIASES)].map(([name, code]) => [name, code])),
  // Historical English spellings used before native-name display.
  Spanish: 'es', French: 'fr', German: 'de', Portuguese: 'pt', Italian: 'it', Dutch: 'nl',
  Mandarin: 'zh', 'Mandarin Chinese': 'zh', Japanese: 'ja', Korean: 'ko', Arabic: 'ar', Hindi: 'hi',
  Russian: 'ru', Turkish: 'tr', Vietnamese: 'vi', Hebrew: 'he', Chinese: 'zh',
  en: 'en', es: 'es', fr: 'fr', de: 'de', pt: 'pt', it: 'it', zh: 'zh', ja: 'ja',
  ko: 'ko', ar: 'ar', hi: 'hi', ru: 'ru', nl: 'nl', tr: 'tr', vi: 'vi', he: 'he',
};

export const RTL_LANGUAGES: LangCode[] = ['ar', 'he'];

/** Returns the canonical native display name for a stored/stale language value. */
export const canonicalLanguageName = (value: string | null | undefined): string => {
  const code = LANGUAGE_MAP[value ?? ''];
  const def = code ? LANGUAGES.find(l => l.code === code) : undefined;
  return def?.native ?? 'English';
};

const t: Record<LangCode, Translations> = { en, es, fr, de, pt, it, zh, ja, ko, ar, hi, ru, nl, tr, vi, he };

const NEVER_TRANSLATE = new Set<string>([
  'MyPlanner', 'My Planner', 'Planora', 'Google', 'Inter', 'Nunito', 'Outfit', 'Roboto',
  'Lofi', 'MM/YY', 'XXXX-XXXX', 'you@example.com',
  ...LANGUAGES.map(l => l.native),
]);

const reverseEn: Record<string, string> = {};
for (const [key, value] of Object.entries(en)) {
  if (value && !reverseEn[value]) reverseEn[value] = key;
}

const mergeDict = (lang: LangCode): Translations => ({
  ...t[lang],
  ...(PHRASES[lang] || {}),
});

/** Interpolation helper shared by all languages: "{{name}} wins" -> "Sam wins" */
export const interpolate = (template: string, vars?: Record<string, string | number>): string => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = vars[key];
    return v === undefined || v === null ? match : String(v);
  });
};

const looksTranslatable = (s: string): boolean => {
  if (!s || NEVER_TRANSLATE.has(s)) return false;
  if (s.length > 240) return false;
  if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(s)) return false;
  if (/^(https?:|mailto:|tel:|\/|#)/.test(s)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false;
  return true;
};

const lookup = (phrase: string, dict: Translations): string | undefined => {
  if (dict[phrase]) return dict[phrase];
  const legacyKey = reverseEn[phrase];
  if (legacyKey && dict[legacyKey]) return dict[legacyKey];

  const numbered = phrase.replace(/\d+/g, '{{count}}');
  if (numbered !== phrase && dict[numbered]) {
    const n = phrase.match(/\d+/)?.[0];
    return interpolate(dict[numbered], { count: n ?? '', n: n ?? '' });
  }

  const quoted = phrase.replace(/"([^"]*)"/g, '"{{name}}"');
  if (quoted !== phrase && dict[quoted]) {
    const name = phrase.match(/"([^"]*)"/)?.[1] ?? '';
    return interpolate(dict[quoted], { name });
  }

  if (/^Created /.test(phrase) && dict['Created {{date}}']) {
    return interpolate(dict['Created {{date}}'], { date: phrase.slice(8) });
  }
  if (/^Updated /.test(phrase) && dict['Updated {{date}}']) {
    return interpolate(dict['Updated {{date}}'], { date: phrase.slice(8) });
  }
  const pw = phrase.match(/^Password must be at least (\d+) characters$/);
  if (pw && dict['Password must be at least {{count}} characters']) {
    return interpolate(dict['Password must be at least {{count}} characters'], { count: pw[1] });
  }
  return undefined;
};

// Module-level current language (mirrors the provider) so non-React code
// (libs, services, module-scope helpers) can translate too.
let currentLang: LangCode = 'en';
let currentDict: Translations = mergeDict('en');

export const setCurrentLanguage = (lang: LangCode) => {
  currentLang = lang;
  currentDict = mergeDict(lang);
};

/** Translate a phrase outside of React components. Falls back to the source string. */
export const tt = (phrase: string, vars?: Record<string, string | number>): string => {
  if (typeof phrase !== 'string' || !looksTranslatable(phrase.trim())) {
    return interpolate(phrase, vars);
  }
  const leading = phrase.match(/^\s*/)?.[0] ?? '';
  const trailing = phrase.match(/\s*$/)?.[0] ?? '';
  const trimmed = phrase.trim();
  const found = lookup(trimmed, currentDict);
  return interpolate(`${leading}${found ?? trimmed}${trailing}`, vars);
};

export const getCurrentLang = (): LangCode => currentLang;

export const getTranslations = (lang: LangCode): Translations => mergeDict(lang);

export default t;