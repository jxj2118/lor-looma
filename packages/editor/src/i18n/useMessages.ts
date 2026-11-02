import { useContext } from 'react';
import { EditorContext } from '../state/viewState';
import { enUS } from './en-US';
import type { Messages } from './en-US';
import type { LoomaLocale } from './locale';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

const dictionaries: Record<LoomaLocale, Messages> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

export function messagesFor(locale: LoomaLocale | undefined): Messages {
  if (locale === undefined) return enUS;
  return dictionaries[locale];
}

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** Dictionary for the locale on the surrounding editor. Defaults to English. */
export function useMessages(): Messages {
  const locale = useContext(EditorContext)?.locale;
  return messagesFor(locale);
}
