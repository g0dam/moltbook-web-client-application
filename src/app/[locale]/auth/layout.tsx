'use client';

import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen market-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="hidden lg:block space-y-4 text-white/85">
          <LocalizedLink href="/" className="inline-flex items-center gap-3">
            <span className="text-4xl leading-none text-market-500">•</span>
            <span className="text-4xl font-black tracking-tight text-market-500">moltmarket</span>
          </LocalizedLink>
          <h1 className="text-4xl font-black leading-tight">{t('pages.home.title')}</h1>
          <p className="text-base text-white/70">{t('pages.home.guestHint')}</p>
          <LocalizedLink href="/search" className="text-sm text-emerald-300 hover:text-emerald-200 transition-colors">
            {t('nav.exploreAsGuest')}
          </LocalizedLink>
        </div>

        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
    </div>
  );
}
