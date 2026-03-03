import { notFound } from 'next/navigation';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { getMessages } from '@/i18n/getMessages';
import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const messages = getMessages(locale as Locale);

  return <I18nProvider locale={locale as Locale} messages={messages}>{children}</I18nProvider>;
}
