import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_PHRASES,
  languageDisplayLabel,
  translateAnalytics,
  type SupportedLang,
} from '../../shared/analyticsI18n';

const ALL_LANGUAGES: SupportedLang[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'zh',
  'ja',
  'ko',
  'ar',
  'hi',
  'ru',
  'nl',
  'tr',
  'vi',
  'he',
];

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{[a-zA-Z0-9_]+\}\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe('analytics i18n parity & translation helper', () => {
  const nonEnLanguages = ALL_LANGUAGES.filter((l) => l !== 'en');
  const referenceKeys = Object.keys(ANALYTICS_PHRASES.es).sort();

  it('has complete 1:1 key parity across all 15 non-English locale dictionaries', () => {
    expect(referenceKeys.length).toBeGreaterThan(400);
    expect(ANALYTICS_PHRASES.en).toBeDefined();

    for (const lang of nonEnLanguages) {
      const dict = ANALYTICS_PHRASES[lang];
      expect(dict, `missing dictionary for ${lang}`).toBeDefined();

      const keys = Object.keys(dict).sort();
      const missing = referenceKeys.filter((k) => !(k in dict));
      const extra = keys.filter((k) => !referenceKeys.includes(k));

      expect(missing, `${lang} missing keys: ${missing.slice(0, 5).join(', ')}`).toEqual([]);
      expect(extra, `${lang} unexpected extra keys`).toEqual([]);
    }
  });

  it('preserves exact {{variable}} placeholders for every key in every locale', () => {
    for (const lang of nonEnLanguages) {
      const dict = ANALYTICS_PHRASES[lang];
      for (const key of referenceKeys) {
        const expected = extractPlaceholders(key);
        const actual = extractPlaceholders(dict[key]);
        expect(actual, `${lang} placeholder mismatch for key "${key}"`).toEqual(expected);
      }
    }
  });

  it('substitutes variables cleanly across all 16 languages and BCP-47 region tags', () => {
    for (const lang of ALL_LANGUAGES) {
      const rendered = translateAnalytics(
        lang,
        'Productivity score stands at {{score}}/100 ({{completed}} of {{total}} tasks completed, {{rate}}% completion rate).',
        { score: 82, completed: 14, total: 17, rate: 82 },
      );
      expect(rendered).toContain('82');
      expect(rendered).toContain('14');
      expect(rendered).toContain('17');
      expect(rendered).not.toMatch(/\{\{.*?\}\}/);
      expect(languageDisplayLabel(lang).length).toBeGreaterThan(1);
    }

    expect(translateAnalytics('en', '1 Month')).toBe('1 Month');
    expect(translateAnalytics('pt-BR', '1 Month')).toBe(ANALYTICS_PHRASES.pt['1 Month']);
    expect(translateAnalytics('zh-CN', '1 Month')).toBe(ANALYTICS_PHRASES.zh['1 Month']);
    expect(translateAnalytics('he-IL', '1 Month')).toBe(ANALYTICS_PHRASES.he['1 Month']);
    expect(translateAnalytics('unknown-xx', 'No tasks yet.')).toBe('No tasks yet.');
  });
});
