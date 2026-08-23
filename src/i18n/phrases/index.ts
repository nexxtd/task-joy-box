import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import pt from './pt.json';
import it from './it.json';
import zh from './zh.json';
import ja from './ja.json';
import ko from './ko.json';
import ar from './ar.json';
import hi from './hi.json';
import ru from './ru.json';
import nl from './nl.json';
import tr from './tr.json';
import vi from './vi.json';
import he from './he.json';
import type { Translations } from '../locales/types';

export const PHRASES: Record<string, Translations> = {
  en: {},
  es: es as Translations,
  fr: fr as Translations,
  de: de as Translations,
  pt: pt as Translations,
  it: it as Translations,
  zh: zh as Translations,
  ja: ja as Translations,
  ko: ko as Translations,
  ar: ar as Translations,
  hi: hi as Translations,
  ru: ru as Translations,
  nl: nl as Translations,
  tr: tr as Translations,
  vi: vi as Translations,
  he: he as Translations,
};
