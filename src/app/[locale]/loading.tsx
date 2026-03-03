'use client';

import { Spinner } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';

export default function LocaleLoading() {
  const { t } = useI18n();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  );
}

