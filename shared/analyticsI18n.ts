import { normalizeLanguageCode } from '../server/lib/language';
import es from './analyticsLocales/es';
import fr from './analyticsLocales/fr';
import de from './analyticsLocales/de';
import pt from './analyticsLocales/pt';
import it from './analyticsLocales/it';
import zh from './analyticsLocales/zh';
import ja from './analyticsLocales/ja';
import ko from './analyticsLocales/ko';
import ar from './analyticsLocales/ar';
import hi from './analyticsLocales/hi';
import ru from './analyticsLocales/ru';
import nl from './analyticsLocales/nl';
import tr from './analyticsLocales/tr';
import vi from './analyticsLocales/vi';
import he from './analyticsLocales/he';

export type SupportedLang =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it'
  | 'zh' | 'ja' | 'ko' | 'ar' | 'hi' | 'ru'
  | 'nl' | 'tr' | 'vi' | 'he';

/**
 * Modular localization dictionary for Insights, Dashboard analytics, Energy Insights,
 * and AI analytics widgets across all 16 supported application languages.
 */
export const ANALYTICS_PHRASES: Record<string, Record<string, string>> = {
  en: {},
  es,
  fr,
  de,
  pt,
  it,
  zh,
  ja,
  ko,
  ar,
  hi,
  ru,
  nl,
  tr,
  vi,
  he,
};

const LANG_ENGLISH_NAMES: Record<SupportedLang, string> = {
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
  zh: 'Simplified Chinese (中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)',
  ru: 'Russian (Русский)',
  nl: 'Dutch (Nederlands)',
  tr: 'Turkish (Türkçe)',
  vi: 'Vietnamese (Tiếng Việt)',
  he: 'Hebrew (עברית)',
};

export function languageDisplayLabel(langCode: string | null | undefined): string {
  const normalized = normalizeLanguageCode(langCode) as SupportedLang;
  return LANG_ENGLISH_NAMES[normalized] || 'English';
}

export function translateAnalytics(
  langCode: string | null | undefined,
  template: string,
  vars?: Record<string, string | number>,
): string {
  const lang = normalizeLanguageCode(langCode);
  const dict = ANALYTICS_PHRASES[lang] || ANALYTICS_PHRASES.en;
  const resolved = dict[template] || template;
  if (!vars) return resolved;
  return resolved.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return val === undefined || val === null ? match : String(val);
  });
}
