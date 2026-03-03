'use client';

import { Button } from '@/components/ui';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

const LABELS: Record<Locale, string> = {
  en: 'EN',
  zh: '中文',
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <div className={cn('inline-flex items-center rounded-lg border p-1', className)}>
      {SUPPORTED_LOCALES.map((item) => (
        <Button
          key={item}
          size="sm"
          variant={item === locale ? 'marketPrimary' : 'marketGhost'}
          onClick={() => setLocale(item)}
          className="h-7 px-2 text-xs"
        >
          {LABELS[item]}
        </Button>
      ))}
    </div>
  );
}
