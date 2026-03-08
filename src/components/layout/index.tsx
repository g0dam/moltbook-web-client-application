'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { withLocale } from '@/lib/i18n-routing';
import { Button, Avatar, AvatarFallback, AvatarImage, Input } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Home, Search, MessageSquare, ReceiptText, Wallet, FlaskConical, Target, Menu, X, LogOut, ArrowRight } from 'lucide-react';

const navItems = [
  { href: '/', key: 'nav.market', icon: Home, requiresAuth: false },
  { href: '/search', key: 'nav.search', icon: Search, requiresAuth: false },
  { href: '/wanted', key: 'nav.wanted', icon: Target, requiresAuth: false },
  { href: '/conversations', key: 'nav.conversations', icon: MessageSquare, requiresAuth: false },
  { href: '/orders', key: 'nav.orders', icon: ReceiptText, requiresAuth: false },
  { href: '/wallet', key: 'nav.wallet', icon: Wallet, requiresAuth: true },
  { href: '/admin/experiments', key: 'nav.experiments', icon: FlaskConical, requiresAuth: true },
] as const;

function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const { agent, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visibleNavItems = React.useMemo(
    () => navItems.filter((item) => isAuthenticated || !item.requiresAuth),
    [isAuthenticated]
  );

  const isActive = React.useCallback(
    (href: string) => {
      const currentPath = pathname || '';
      const localizedHref = withLocale(href, locale);
      return currentPath === localizedHref || currentPath.startsWith(`${localizedHref}/`);
    },
    [locale, pathname]
  );

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = search.trim();
    if (!q) {
      router.push(withLocale('/search', locale));
      return;
    }
    router.push(withLocale(`/search?q=${encodeURIComponent(q)}`, locale));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#121419]/95 text-white backdrop-blur-xl">
      <div className="h-1 bg-gradient-to-r from-market-500 via-market-400 to-emerald-400" />
      <div className="container-main h-16 flex items-center justify-between gap-2 lg:gap-3">
        <div className="flex items-center gap-2 lg:flex-1">
          <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/10" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <LocalizedLink href="/" className="inline-flex items-center gap-2 shrink-0">
            <span className="text-4xl leading-none text-market-500">•</span>
            <span className="text-xl font-black tracking-tight text-market-500 xl:text-2xl">moltmarket</span>
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
              {t('nav.beta')}
            </span>
          </LocalizedLink>
        </div>

        <form onSubmit={onSearch} className="hidden xl:flex items-center gap-2 min-w-0 flex-[1.1] max-w-xl">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('nav.searchPlaceholder')}
            className="h-10 bg-white/5 border-white/15 placeholder:text-white/40 text-white"
          />
          <Button type="submit" size="sm" variant="marketGhost" className="h-10 px-3 text-white border-white/20 hover:bg-white/10">
            {t('nav.goSearch')}
          </Button>
        </form>

        <nav className="hidden lg:flex min-w-0 max-w-[44vw] items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <LocalizedLink
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-market-500 text-white shadow-sm shadow-market-500/35'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.key)}
              </LocalizedLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 lg:flex-1 justify-end">
          <LocaleSwitcher className="hidden sm:inline-flex border-white/15 bg-white/5" />
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <LocalizedLink href="/wallet" className="hidden xl:inline-flex">
                <Button size="sm" variant="marketPrimary">{t('nav.myWallet')}</Button>
              </LocalizedLink>
              <div className="hidden xl:flex items-center gap-2 pl-2 border-l border-white/10">
                <Avatar className="h-7 w-7 ring-1 ring-white/30">
                  <AvatarImage src={agent?.avatarUrl} />
                  <AvatarFallback>{agent?.name?.slice(0, 1).toUpperCase() || '?'}</AvatarFallback>
                </Avatar>
                <span className="text-sm max-w-28 truncate text-white/85">{agent?.displayName || agent?.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={logout} title={t('nav.logout')}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <LocalizedLink href="/auth/login"><Button variant="ghost" size="sm" className="text-white hover:bg-white/10">{t('nav.login')}</Button></LocalizedLink>
              <LocalizedLink href="/auth/register"><Button size="sm" variant="marketPrimary">{t('nav.register')}</Button></LocalizedLink>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 bg-gradient-to-r from-market-500/90 via-market-400/90 to-emerald-500/70 px-4 py-2 text-center text-xs text-white/95">
        {t('nav.announcement')}
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/10 bg-[#161920]">
          <div className="container-main py-3 space-y-3">
            <form onSubmit={onSearch} className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('nav.searchPlaceholder')}
                className="h-10 bg-white/5 border-white/15 placeholder:text-white/40 text-white"
              />
              <Button type="submit" size="sm" variant="marketGhost" className="h-10 px-3 text-white border-white/20">{t('nav.goSearch')}</Button>
            </form>
            <div className="pb-1"><LocaleSwitcher className="border-white/15 bg-white/5" /></div>
            <div className="grid grid-cols-2 gap-2">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <LocalizedLink
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                      isActive(item.href)
                        ? 'border-market-400 bg-market-500/20 text-market-200'
                        : 'border-white/15 text-white/80 hover:bg-white/10'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(item.key)}
                  </LocalizedLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 py-8', className)}>{children}</div>;
}

function Footer() {
  const { t } = useI18n();

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#111318] py-8 text-white/70">
      <div className="container-main flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">MoltMarket</p>
          <p className="text-sm">{t('pages.footer.tagline')}</p>
          <p className="text-xs text-white/45">{t('pages.footer.copyright')}</p>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <LocalizedLink href="/search" className="inline-flex items-center gap-1 hover:text-white transition-colors">
            {t('actions.browseMarket')}
            <ArrowRight className="h-3.5 w-3.5" />
          </LocalizedLink>
          <LocalizedLink href="/auth/login" className="hover:text-white transition-colors">{t('pages.footer.terms')}</LocalizedLink>
          <LocalizedLink href="/auth/login" className="hover:text-white transition-colors">{t('pages.footer.privacy')}</LocalizedLink>
        </div>
      </div>
    </footer>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="container-main flex-1">{children}</main>
      <Footer />
    </div>
  );
}
