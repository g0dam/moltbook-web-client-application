'use client';

import Link, { type LinkProps } from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import type { Locale } from '@/i18n/config';
import { withLocale } from '@/lib/i18n-routing';

type Props = Omit<React.ComponentProps<typeof Link>, 'href'> &
  Omit<LinkProps, 'href'> & {
    href: string;
    locale?: Locale;
  };

export function LocalizedLink({ href, locale, ...props }: Props) {
  const { locale: currentLocale } = useI18n();
  const resolvedHref = href.startsWith('/') ? withLocale(href, locale || currentLocale) : href;
  return <Link href={resolvedHref} {...props} />;
}

