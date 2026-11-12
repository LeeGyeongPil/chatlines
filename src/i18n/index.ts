import { en, type MessageKey } from './en';
import { ko } from './ko';

export type Lang = 'en' | 'ko';
export type { MessageKey };

export const LANGS: readonly Lang[] = ['en', 'ko'];

const TABLES: Record<Lang, Record<MessageKey, string>> = { en, ko };

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'ko';
}

/** Fill `{0}`, `{1}`, ... placeholders. */
export function format(template: string, args: ReadonlyArray<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

/** Translate a key into the given language. */
export function t(lang: Lang, key: MessageKey, ...args: Array<string | number>): string {
  return format(TABLES[lang][key], args);
}

/** The whole table of one language, as sent to the webview. */
export function table(lang: Lang): Record<string, string> {
  return { ...TABLES[lang] };
}

/**
 * Pick the language of a command line tool: --lang option, then <TOOL>_LANG, then the
 * usual locale variables. Anything that does not start with "ko" means English.
 */
export function langFromEnvironment(option: string | undefined, env: Record<string, string | undefined>): Lang {
  const candidates = [option, env.CHATLINES_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const c of candidates) {
    if (c !== undefined && c !== '') return c.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  return 'en';
}
