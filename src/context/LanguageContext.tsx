import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import t, { LangCode, Translations, LANGUAGE_MAP, RTL_LANGUAGES, canonicalLanguageName, setCurrentLanguage, interpolate, tt, getTranslations, getCurrentLang } from '@/i18n/translations';
import { detectCurrency, detectLanguageFromBrowser, detectTimezone } from '@/lib/location';

type TranslateFn = (phrase: string, vars?: Record<string, string | number>) => string;

interface LanguageContextType {
  language: string;
  lang: LangCode;
  T: Translations;
  t: TranslateFn;
  setLanguage: (lang: string) => void;
  isRTL: boolean;
  currency: string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

const FIRST_VISIT_KEY = 'first_visit_done';
const LOCATION_KEY = 'user_location';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState(() => canonicalLanguageName(localStorage.getItem('language')));
  const [currency, setCurrency] = useState(() => {
    try {
      const loc = localStorage.getItem(LOCATION_KEY);
      return loc ? (JSON.parse(loc).currency || 'USD') : 'USD';
    } catch {
      return 'USD';
    }
  });

  const getLangCode = (lang: string): LangCode => LANGUAGE_MAP[lang] || 'en';

  const lang = getLangCode(language);
  if (getCurrentLang() !== lang) setCurrentLanguage(lang);
  const isRTL = RTL_LANGUAGES.includes(lang);

  useEffect(() => {
    setCurrentLanguage(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const setLanguage = useCallback((newLang: string) => {
    setLanguageState(canonicalLanguageName(newLang));
    localStorage.setItem('language', newLang);
  }, []);

  const translate: TranslateFn = useCallback((phrase, vars) => tt(phrase, vars), [language]);

  useEffect(() => {
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!headers.has('Accept-Language')) headers.set('Accept-Language', lang);
      headers.set('X-UI-Language', language);
      const nextInit: RequestInit = { ...init, headers, credentials: init?.credentials ?? 'include' };

      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/ai') && typeof nextInit.body === 'string') {
        try {
          const json = JSON.parse(nextInit.body);
          if (json && typeof json === 'object' && !Array.isArray(json) && json.language == null) {
            json.language = language;
            json.languageCode = lang;
            nextInit.body = JSON.stringify(json);
          }
        } catch {
          // body is not JSON
        }
      }
      return orig(input, nextInit);
    };
    return () => {
      window.fetch = orig;
    };
  }, [lang, language]);

  // Location detection:
  // - First visit: detect language + currency + timezone, apply the detected
  //   language as the default and store the location.
  // - Every subsequent visit: re-check the location for currency/timezone only.
  //   Language is never auto-changed again after the first visit.
  useEffect(() => {
    const firstVisit = localStorage.getItem(FIRST_VISIT_KEY) !== 'true';
    const detectedCurrency = detectCurrency();
    const detectedTz = detectTimezone();

    if (firstVisit) {
      const detectedLang = detectLanguageFromBrowser();
      const storedLang = localStorage.getItem('language');
      const effectiveLang = storedLang || detectedLang;
      localStorage.setItem(FIRST_VISIT_KEY, 'true');
      localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: effectiveLang, currency: detectedCurrency, tz: detectedTz }));
      if (!storedLang && LANGUAGE_MAP[detectedLang]) {
        setLanguageState(canonicalLanguageName(detectedLang));
        localStorage.setItem('language', detectedLang);
      }
      setCurrency(detectedCurrency);
      fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language: canonicalLanguageName(effectiveLang), currency: detectedCurrency }),
      }).catch(() => {});
      return;
    }

    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      const loc = raw ? JSON.parse(raw) : { lang: 'en' };
      if (loc.currency !== detectedCurrency || loc.tz !== detectedTz) {
        const next = { ...loc, currency: detectedCurrency, tz: detectedTz };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
        setCurrency(detectedCurrency);
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currency: detectedCurrency }),
        }).catch(() => {});
      }
    } catch {
      localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: 'en', currency: detectedCurrency, tz: detectedTz }));
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, lang, T: getTranslations(lang), t: translate, setLanguage, isRTL, currency }}>
      {children}
    </LanguageContext.Provider>
  );
};