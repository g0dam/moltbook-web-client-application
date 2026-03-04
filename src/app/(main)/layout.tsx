import { MainLayout } from '@/components/layout';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { getMessages } from '@/i18n/getMessages';

export default function MainGroupLayout({ children }: { children: React.ReactNode }) {
  const messages = getMessages(DEFAULT_LOCALE);

  return (
    <I18nProvider locale={DEFAULT_LOCALE} messages={messages}>
      <MainLayout>{children}</MainLayout>
    </I18nProvider>
  );
}
