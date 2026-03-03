'use client';

import { useEffect } from 'react';
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('errors.somethingWentWrong')}</h1>
        <p className="text-muted-foreground mb-6">{t('errors.unexpectedError')}</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            {t('pages.error.tryAgain')}
          </Button>
          <LocalizedLink href="/">
            <Button variant="marketPrimary">
              <Home className="h-4 w-4 mr-2" />
              {t('pages.error.goHome')}
            </Button>
          </LocalizedLink>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground mt-4">{t('pages.error.errorId', { value: error.digest })}</p>
        )}
      </div>
    </div>
  );
}

