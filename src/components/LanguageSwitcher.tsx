import React from 'react';
import { LANGUAGES } from '@/i18n/translations';
import { useLanguage } from '@/context/LanguageContext';

interface Props {
  className?: string;
  compact?: boolean;
}

const LanguageSwitcher: React.FC<Props> = ({ className = '', compact }) => {
  const { lang, setLanguage, t } = useLanguage();

  return (
    <label className={`flex items-center gap-2 ${className}`}>
      {!compact && <span className="text-xs text-muted-foreground">{t('Language')}</span>}
      <select
        data-no-i18n
        aria-label={t('Language')}
        value={lang}
        onChange={e => {
          // Values are language codes (en, zh, ...); only the labels are
          // display names. setLanguage persists the code locally + account.
          setLanguage(e.target.value);
        }}
        className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.native}</option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
