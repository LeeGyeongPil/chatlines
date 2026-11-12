import type { Lang } from '../i18n';

/** `chatlines.language`: "en" and "ko" are fixed, anything else ("auto") follows the VS Code display language. */
export function resolveLanguage(setting: string | undefined, displayLanguage: string | undefined): Lang {
  if (setting === 'en' || setting === 'ko') return setting;
  return (displayLanguage ?? '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}
