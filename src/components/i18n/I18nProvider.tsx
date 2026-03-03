'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Messages } from '@/i18n/getMessages';
import type { Locale } from '@/i18n/config';
import { switchLocale } from '@/lib/i18n-routing';

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (targetLocale: Locale) => void;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function resolveMessage(messages: Messages, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return null;
  }, messages);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const value = resolveMessage(messages, key);
      if (typeof value === 'string') {
        return interpolate(value, params);
      }
      return key;
    },
    [messages]
  );

  const setLocale = React.useCallback(
    (targetLocale: Locale) => {
      document.cookie = `molt_locale=${targetLocale}; path=/; max-age=31536000`;
      const nextPath = switchLocale(pathname || '/', targetLocale);
      router.replace(nextPath);
    },
    [pathname, router]
  );

  return (
    <I18nContext.Provider value={{ locale, messages, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18nContext() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18nContext must be used within I18nProvider');
  }
  return context;
}

