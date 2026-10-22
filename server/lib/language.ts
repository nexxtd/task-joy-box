// Language codes are the ONLY values stored on the user account.
// Older builds stored display names ("中文", "English", ...); those legacy
// values are still accepted on input and normalized to their codes, so
// already-affected accounts self-heal on their next save.

export const SUPPORTED_LANGUAGE_CODES = [
  'en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru', 'nl', 'tr', 'vi', 'he',
] as const;

const VALID_LANGUAGE_CODES = new Set<string>(SUPPORTED_LANGUAGE_CODES);

// Legacy values previously written by the frontend (native display names and
// older English names) mapped to their canonical codes.
const LEGACY_LANGUAGE_NAMES: Record<string, string> = {
  english: 'en', español: 'es', spanish: 'es', français: 'fr', french: 'fr',
  deutsch: 'de', german: 'de', português: 'pt', portuguese: 'pt', italiano: 'it',
  italian: 'it', nederlands: 'nl', dutch: 'nl', '中文': 'zh', mandarin: 'zh',
  'mandarin chinese': 'zh', chinese: 'zh', 日本語: 'ja', japanese: 'ja',
  한국어: 'ko', korean: 'ko', العربية: 'ar', arabic: 'ar', עברית: 'he', hebrew: 'he',
  हिन्दी: 'hi', hindi: 'hi', русский: 'ru', russian: 'ru', türkçe: 'tr', turkish: 'tr',
  'tiếng việt': 'vi', vietnamese: 'vi',
};

/**
 * Normalizes any stored/supplied language value to a supported language code.
 * Unrecognized or missing values fall back to 'en'.
 */
export function normalizeLanguageCode(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'en';
  if (VALID_LANGUAGE_CODES.has(raw)) return raw;
  return LEGACY_LANGUAGE_NAMES[raw] || 'en';
}
