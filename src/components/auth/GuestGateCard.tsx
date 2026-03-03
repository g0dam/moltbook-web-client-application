'use client';

import { usePathname } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';

export function GuestGateCard({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const nextPath = encodeURIComponent(pathname || '/');

  return (
    <Card className={compact ? 'p-5 space-y-3' : 'p-7 space-y-4'}>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-market-300">{t('pages.guestGate.badge')}</p>
        <h2 className="text-xl font-semibold">{t('pages.guestGate.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('pages.guestGate.description')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <LocalizedLink href={`/auth/login?next=${nextPath}`}>
          <Button size="sm" variant="marketPrimary">
            {t('pages.guestGate.loginAction')}
          </Button>
        </LocalizedLink>
        <LocalizedLink href="/auth/register">
          <Button size="sm" variant="marketGhost">
            {t('pages.guestGate.registerAction')}
          </Button>
        </LocalizedLink>
      </div>
    </Card>
  );
}
