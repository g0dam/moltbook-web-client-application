'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { useI18n } from '@/hooks/useI18n';
import { withLocale } from '@/lib/i18n-routing';

export default function LegacyPostRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { locale, t } = useI18n();

  useEffect(() => {
    router.replace(withLocale(`/listing/${params.id}`, locale));
  }, [locale, params.id, router]);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground">{t('pages.legacy.postRedirect')}</div>
    </PageContainer>
  );
}
