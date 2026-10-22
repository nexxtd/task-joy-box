import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { LangCode, Translations, RTL_LANGUAGES, canonicalLanguageCode, languageDisplayName, resolveLanguageCode, setCurrentLanguage, tt, getTranslations, getCurrentLang, loadLanguage } from '@/i18n/translations';
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

/**
 * Header values must be ISO-8859-1 (all char codes <= 0xFF); anything else
 * makes Headers.set() THROW ("String contains non ISO-8859-1 code point"),
 * which used to break every request (blank app) when a display name like
 * "中文" was stored as the language. Never let a bad value take down a
 * request: drop the header instead.
 */
export const isHeaderValueSafe = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
};

// Always persist language CODES (en, zh, ...) — never display names ("中文").
// Display names can contain non ISO-8859-1 characters, which used to break
// the fetch wrapper's request headers and blank out the whole app.
function readStoredLanguageCode(): LangCode {
  try {
    const raw = localStorage.getItem('language');
    const code = resolveLanguageCode(raw);
    if (code === null) {
      // Missing/invalid value: fall back to English and clear the bad value.
      if (raw !== null) { try { localStorage.removeItem('language'); } catch {} }
      return 'en';
    }
    // Migrate legacy display-name values ("中文" -> "zh") in place.
    if (code !== raw) { try { localStorage.setItem('language', code); } catch {} }
    return code;
  } catch {
    return 'en';
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Internal state is always a language CODE (en, zh, ...). The display name
  // is derived for the UI only and is never persisted or sent in headers.
  const [langCode, setLangCode] = useState<LangCode>(() => readStoredLanguageCode());
  const language = languageDisplayName(langCode);
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

  const lang = langCode;
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
    // Accepts a code ("zh") or a legacy display name ("中文"); persists the code.
    const code: LangCode = canonicalLanguageCode(newLang);
    // Apply straight away everywhere with no refresh needed.
    setLangCode(code);
    try { localStorage.setItem('language', code); } catch {}
    // Keep <html> in sync instantly so dates/dir switch without a flash.
    try {
      setCurrentLanguage(code);
      document.documentElement.lang = code;
      document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
    } catch {}
    // Save to the account the moment it is picked (other devices + refresh).
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
  }, []);

  const translate: TranslateFn = useCallback((phrase, vars) => tt(phrase, vars), [language, dictVersion]);

  // Re-sync from the account after login/logout (other devices, post-logout).
  // Auth flows dispatch `language-refresh`; we also re-check on focus.
  // Every fetch here has a timeout so a hanging request can never brick the UI.
  const refetchFromServer = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch('/api/settings', { credentials: 'include', signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data && typeof data.language === 'string' && data.language.trim()) {
        const serverCode = resolveLanguageCode(data.language);
        if (serverCode === null) {
          // Invalid value saved on the account (e.g. a mojibake display name):
          // fall back to English and repair the account so other devices recover.
          setLangCode(prev => (prev === 'en' ? prev : 'en'));
          try { localStorage.setItem('language', 'en'); } catch {}
          fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ language: 'en' }),
          }).catch(() => {});
          return;
        }
        setLangCode(prev => {
          if (prev !== serverCode) {
            try { localStorage.setItem('language', serverCode); } catch {}
            setCurrentLanguage(serverCode);
            if (serverCode !== 'en') {
              loadLanguage(serverCode).then(() => {
                setCurrentLanguage(serverCode);
                setDictVersion(v => v + 1);
              }).catch(() => {});
            }
            try {
              document.documentElement.lang = serverCode;
              document.documentElement.dir = RTL_LANGUAGES.includes(serverCode) ? 'rtl' : 'ltr';
            } catch {}
            return serverCode;
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
        // Another tab changed it — normalize to a code before adopting.
        const code = resolveLanguageCode(e.newValue) ?? 'en';
        setLangCode(code);
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
    const safeSet = (h: Headers, key: string, value: string) => {
      if (isHeaderValueSafe(value)) h.set(key, value);
    };
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const headers = new Headers(init?.headers);
        if (!headers.has('Accept-Language')) safeSet(headers, 'Accept-Language', lang);
        safeSet(headers, 'X-UI-Language', lang);
        const nextInit: RequestInit = { ...init, headers, credentials: init?.credentials ?? 'include' };

        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/api/ai') && typeof nextInit.body === 'string') {
          try {
            const json = JSON.parse(nextInit.body);
            if (json && typeof json === 'object' && !Array.isArray(json) && json.language == null) {
              json.language = lang;
              json.languageCode = lang;
              nextInit.body = JSON.stringify(json);
            }
          } catch {
            // body is not JSON
          }
        }
        return orig(input, nextInit);
      } catch {
        // Defensive: header handling must never swallow the request itself.
        return orig(input, init);
      }
    };
    return () => {
      window.fetch = orig;
    };
  }, [lang]);

  // Boot: server is the source of truth. Fetch it before showing the page.
  // - If the account has a saved language, it wins over localStorage and
  //   over the auto-detected language (other devices, post-logout, refresh).
  // - Auto-detect only when there is no saved language anywhere (true first
  //   run, logged-out, no cache). Never overwrites a saved pick afterwards.
  useEffect(() => {
    let cancelled = false;
    // Safety net: a hanging settings request or dictionary chunk must never
    // leave the app on the boot spinner forever. Force-ready with the local
    // language if boot hasn't finished in time.
    const safety = setTimeout(() => {
      if (!cancelled && !readyRef.current) {
        try {
          const fallback = readStoredLanguageCode();
          setCurrentLanguage(fallback);
          setLangCode(fallback);
          document.documentElement.lang = fallback;
          document.documentElement.dir = RTL_LANGUAGES.includes(fallback) ? 'rtl' : 'ltr';
        } catch {}
        readyRef.current = true;
        setReady(true);
      }
    }, 8000);
    // When the account holds an unrecognizable language value, the final
    // chosen language is PATCHed back so the bad account value gets repaired.
    let serverLanguageInvalid = false;
    (async () => {
      const finish = async (finalLang: string) => {
        if (cancelled) return;
        clearTimeout(safety);
        // Normalizes codes AND legacy display names ("中文" -> "zh");
        // unknown values fall back to English.
        const code: LangCode = canonicalLanguageCode(finalLang);
        setLangCode(code);
        try { localStorage.setItem('language', code); } catch {}
        setCurrentLanguage(code);
        if (code !== 'en') {
          // Never let a slow dictionary chunk delay first paint: race it so
          // boot always finishes, then swap in real strings when it lands.
          try { await Promise.race([loadLanguage(code), new Promise(r => setTimeout(r, 5000))]); } catch {}
          if (cancelled) return;
          setCurrentLanguage(code);
          setDictVersion(v => v + 1);
        }
        try {
          document.documentElement.lang = code;
          document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
        } catch {}
        if (serverLanguageInvalid) {
          // Repair the account so every device (and the next boot) recovers.
          fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ language: code }),
          }).catch(() => {});
        }
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
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch('/api/settings', { credentials: 'include', signal: ctrl.signal });
        clearTimeout(tid);
        if (!cancelled && res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && typeof data.language === 'string' && data.language.trim()) {
            const serverCode = resolveLanguageCode(data.language);
            if (serverCode === null) {
              // Invalid saved value on the account: don't adopt it. Flag it
              // for repair and fall through to the local pick / auto-detect
              // so the user still lands in a working language.
              serverLanguageInvalid = true;
            } else {
              // Server wins — adopt it locally so refresh/other devices match.
              try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch {}
              try {
                const raw = localStorage.getItem(LOCATION_KEY);
                const loc = raw ? JSON.parse(raw) : {};
                localStorage.setItem(LOCATION_KEY, JSON.stringify({ ...loc, lang: serverCode, currency: detectedCurrency, tz: detectedTz }));
              } catch {
                try { localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: serverCode, currency: detectedCurrency, tz: detectedTz })); } catch {}
              }
              await finish(serverCode);
              return;
            }
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
        const localCode = resolveLanguageCode(localRaw);
        if (localCode === null) {
          // Unrecognized local value: clear it and fall through to auto-detect.
          try { localStorage.removeItem('language'); } catch {}
        } else {
          // Migrate legacy display-name values ("中文" -> "zh") in place.
          if (localCode !== localRaw) {
            try { localStorage.setItem('language', localCode); } catch {}
          }
          await finish(localCode);
          return;
        }
      }

      // True first run: auto-detect once, then persist everywhere.
      const firstVisit = (() => { try { return localStorage.getItem(FIRST_VISIT_KEY) !== 'true'; } catch { return true; } })();
      if (firstVisit) {
        const detected = detectLanguageFromBrowser();
        const code = canonicalLanguageCode(detected);
        try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch {}
        try { localStorage.setItem(LOCATION_KEY, JSON.stringify({ lang: code, currency: detectedCurrency, tz: detectedTz })); } catch {}
        try { localStorage.setItem('language', code); } catch {}
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ language: code, currency: detectedCurrency }),
        }).catch(() => {});
        await finish(code);
        return;
      }

      // Fallback: English, but never overwrite a future saved value.
      await finish('en');
    })();
    return () => { cancelled = true; clearTimeout(safety); };
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
