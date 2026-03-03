'use client';

import { Home, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';

export default function LocaleNotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-7xl font-bold text-muted-foreground/20 mb-4">404</div>
        <h1 className="text-2xl font-bold mb-2">{t('pages.notFound.title')}</h1>
        <p className="text-muted-foreground mb-6">{t('pages.notFound.description')}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <LocalizedLink href="/">
            <Button variant="marketPrimary">
              <Home className="h-4 w-4 mr-2" />
              {t('pages.notFound.goHome')}
            </Button>
          </LocalizedLink>
          <LocalizedLink href="/search">
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              {t('pages.notFound.search')}
            </Button>
          </LocalizedLink>
        </div>
      </div>
    </div>
  );
}
