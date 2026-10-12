import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import t, { LangCode, Translations, LANGUAGE_MAP, RTL_LANGUAGES, canonicalLanguageName, setCurrentLanguage, interpolate, tt, getTranslations, getCurrentLang, loadLanguage } from '@/i18n/translations';
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
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

const FIRST_VISIT_KEY = 'first_visit_done';
const LOCATION_KEY = 'user_location';

function readStoredLanguage(): string {
  try {
    return canonicalLanguageName(localStorage.getItem('language'));
  } catch {
    return 'English';
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState(() => readStoredLanguage());
  const [currency, setCurrency] = useState(() => {
    try {
      const loc = localStorage.getItem(LOCATION_KEY);
      return loc ? (JSON.parse(loc).currency || 'USD') : 'USD';
    } catch {
      return 'USD';
    }
  });
  // Block first paint until the saved language (server) + its dictionary
  // chunk are loaded, so the user never sees a flash of the old language.
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  const getLangCode = (lang: string): LangCode => LANGUAGE_MAP[lang] || 'en';

  const lang = getLangCode(language);
  const [dictVersion, setDictVersion] = useState(0);
  useEffect(() => {
    if (lang === 'en') {
      setCurrentLanguage('en');
      return;
    }
    let cancelled = false;
    setCurrentLanguage(lang);
    loadLanguage(lang).then(() => {
      if (cancelled) return;
      setCurrentLanguage(lang);
      setDictVersion(v => v + 1);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lang]);
  if (getCurrentLang() !== lang) setCurrentLanguage(lang);
  const isRTL = RTL_LANGUAGES.includes(lang);

  useEffect(() => {
    setCurrentLanguage(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const setLanguage = useCallback((newLang: string) => {
    const canonical = canonicalLanguageName(newLang);
    // Apply straight away everywhere with no refresh needed.
    setLanguageState(canonical);
    try { localStorage.setItem('language', canonical); } catch {}
    // Keep <html> in sync instantly so dates/dir switch without a flash.
    try {
      const code: LangCode = LANGUAGE_MAP[canonical] || 'en';
      setCurrentLanguage(code);
      document.documentElement.lang = code;
      document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
    } catch {}
    // Save to the account the moment it is picked (other devices + refresh).
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: canonical }),
    }).catch(() => {});
  }, []);

  const translate: TranslateFn = useCallback((phrase, vars) => tt(phrase, vars), [language, dictVersion]);

  // Re-sync from the account after login/logout (other devices, post-logout).
  // Auth flows dispatch `language-refresh`; we also re-check on focus.
  const refetchFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data && typeof data.language === 'string' && data.language.trim()) {
        const serverCanon = canonicalLanguageName(data.language);
        setLanguageState(prev => {
          if (prev !== serverCanon) {
            try { localStorage.setItem('language', serverCanon); } catch {}
            const code: LangCode = LANGUAGE_MAP[serverCanon] || 'en';
            setCurrentLanguage(code);
            if (code !== 'en') {
              loadLanguage(code).then(() => {
                setCurrentLanguage(code);
                setDictVersion(v => v + 1);
              }).catch(() => {});
            }
            try {
              document.documentElement.lang = code;
              document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
            } catch {}
            return serverCanon;
          }
          return prev;
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    const onRefresh = () => { void refetchFromServer(); };
    const onFocus = () => { void refetchFromServer(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'language' && e.newValue) {
        const canon = canonicalLanguageName(e.newValue);
        setLanguageState(canon);
      }
    };
    window.addEventListener('language-refresh', onRefresh);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('language-refresh', onRefresh);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [refetchFromServer]);

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

  // Boot: server is the source of truth. Fetch it before showing the page.
  // - If the account has a saved language, it wins over localStorage and
  //   over the auto-detected language (other devices, post-logout, refresh).
  // - Auto-detect only when there is no saved language anywhere (true first
  //   run, logged-out, no cache). Never overwrites a saved pick afterwards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const finish = async (finalLang: string) => {
        if (cancelled) return;
        const canonical = canonicalLanguageName(finalLang);
        setLanguageState(canonical);
        try { localStorage.setItem('language', canonical); } catch {}
        const code: LangCode = LANGUAGE_MAP[canonical] || 'en';
        setCurrentLanguage(code);
        if (code !== 'en') {
          try { await loadLanguage(code); } catch {}
          if (cancelled) return;
          setCurrentLanguage(code);
          setDictVersion(v => v + 1);
        }
        try {
          document.documentElement.lang = code;
          document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
        } catch {}
        if (!readyRef.current) {
          readyRef.current = true;
          setReady(true);
        }
      };

      // Currency/timezone bookkeeping (never touches language after this).
      const detectedCurrency = detectCurrency();
      const detectedTz = detectTimezone();
      setCurrency(detectedCurrency);

      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        if (!cancelled && res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && typeof data.language === 'string' && data.language.trim()) {
            const serverCanon = canonicalLanguageName(data.language);
            // Server wins — adopt it locally so refresh/other devices match.
            try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch {}
            try {
              const raw = localStorage.getItem(LOCATION_KEY);
              const loc = raw ? JSON.parse(raw) : {};
              localStorage.setItem(LOCATION_KEY, JSON.stringify({ ...loc, lang: serverCanon, currency: detectedCurrency, tz: detectedTz }));
            } catch {
              try { localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: serverCanon, currency: detectedCurrency, tz: detectedTz })); } catch {}
            }
            await finish(serverCanon);
            return;
          }
        }
      } catch {
        // Unauthenticated or offline — fall through to local/auto.
      }
      if (cancelled) return;

      // No saved language on the account: use the local pick if there is one.
      let localRaw: string | null = null;
      try { localRaw = localStorage.getItem('language'); } catch {}
      if (localRaw) {
        const canonical = canonicalLanguageName(localRaw);
        if (canonical !== localRaw) {
          try { localStorage.setItem('language', canonical); } catch {}
        }
        await finish(canonical);
        return;
      }

      // True first run: auto-detect once, then persist everywhere.
      const firstVisit = (() => { try { return localStorage.getItem(FIRST_VISIT_KEY) !== 'true'; } catch { return true; } })();
      if (firstVisit) {
        const detected = detectLanguageFromBrowser();
        const canonical = canonicalLanguageName(detected);
        try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch {}
        try { localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: canonical, currency: detectedCurrency, tz: detectedTz })); } catch {}
        try { localStorage.setItem('language', canonical); } catch {}
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ language: canonical, currency: detectedCurrency }),
        }).catch(() => {});
        await finish(canonical);
        return;
      }

      // Fallback: English, but never overwrite a future saved value.
      await finish('English');
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep currency/timezone fresh without ever touching the language again.
  useEffect(() => {
    if (!ready) return;
    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      const loc = raw ? JSON.parse(raw) : {};
      const detectedCurrency = detectCurrency();
      const detectedTz = detectTimezone();
      if (loc.currency !== detectedCurrency || loc.tz !== detectedTz) {
        const next = { ...loc, currency: detectedCurrency, tz: detectedTz };
        try { localStorage.setItem(LOCATION_KEY, JSON.stringify(next)); } catch {}
        setCurrency(detectedCurrency);
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currency: detectedCurrency }),
        }).catch(() => {});
      }
    } catch {}
  }, [ready]);

  return (
    <LanguageContext.Provider value={{ language, lang, T: getTranslations(lang), t: translate, setLanguage, isRTL, currency, ready }}>
      {ready ? children : (
        <div className="min-h-dvh flex items-center justify-center bg-background" aria-hidden="true">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </LanguageContext.Provider>
  );
};
