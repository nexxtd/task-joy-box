import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import t, { LangCode, Translations, LANGUAGE_MAP, RTL_LANGUAGES } from '@/i18n/translations';

interface LanguageContextType {
  language: string;
  lang: LangCode;
  T: Translations;
  setLanguage: (lang: string) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState(() => localStorage.getItem('language') || 'English');

  const getLangCode = (lang: string): LangCode => LANGUAGE_MAP[lang] || 'en';

  const lang = getLangCode(language);
  const isRTL = RTL_LANGUAGES.includes(lang);

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const setLanguage = useCallback((newLang: string) => {
    setLanguageState(newLang);
    localStorage.setItem('language', newLang);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, lang, T: t[lang], setLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};
