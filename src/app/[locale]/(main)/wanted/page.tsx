'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { PaginationBar } from '@/components/common/PaginationBar';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { withLocale } from '@/lib/i18n-routing';
import { Compass, Radar, TrendingUp } from 'lucide-react';
const WANTED_PAGE_SIZE = 12;

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

export default function WantedPage() {
  const { t, errorMessage, locale } = useI18n();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'new' | 'hot'>('new');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.getListings({
          listingType: 'WANTED',
          sort: sortMode,
          limit: WANTED_PAGE_SIZE,
          offset: (page - 1) * WANTED_PAGE_SIZE
        });
        if (!cancelled) setItems(response.data || []);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sortMode, page]);

  useEffect(() => {
    setPage(1);
  }, [sortMode]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      const key = String(item.category || 'other').toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const avgBudget = useMemo(() => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, cur) => acc + Number(cur.price_listed || 0), 0);
    return Math.round(sum / items.length);
  }, [items]);

  const topIntent = useMemo(() => {
    return [...items]
      .sort((a, b) => Number(b.conversations_7d || b.comment_count || 0) - Number(a.conversations_7d || a.comment_count || 0))
      .slice(0, 6);
  }, [items]);

  const startConversation = async (listingId: string) => {
    if (!isAuthenticated) {
      router.push(withLocale(`/auth/login?next=${encodeURIComponent('/wanted')}`, locale));
      return;
    }

    const conversation = await api.startConversation(listingId);
    router.push(withLocale(`/conversations/${conversation.id}`, locale));
  };

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <Card className="market-hero p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
            <div>
              <h1 className="text-3xl font-black">{t('pages.wanted.title')}</h1>
              <p className="mt-2 text-white/75">{t('pages.wanted.subtitle')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant={sortMode === 'new' ? 'marketPrimary' : 'marketGhost'} onClick={() => setSortMode('new')}>
                  {t('pages.home.tabs.new')}
                </Button>
                <Button size="sm" variant={sortMode === 'hot' ? 'marketPrimary' : 'marketGhost'} onClick={() => setSortMode('hot')}>
                  {t('pages.home.tabs.for_you')}
                </Button>
                <LocalizedLink href="/search">
                  <Button size="sm" variant="marketGhost">{t('nav.search')}</Button>
                </LocalizedLink>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.1em] text-white/50">WANTED</p>
                <p className="mt-1 text-2xl font-black">{items.length}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.1em] text-white/50">AVG BUDGET</p>
                <p className="mt-1 text-2xl font-black">{formatPrice(avgBudget)}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 col-span-2">
                <p className="text-xs uppercase tracking-[0.1em] text-white/50">{t('pages.wanted.radarTitle')}</p>
                <p className="mt-1 text-sm text-white/72">{t('pages.wanted.radarHint')}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            {isLoading && <Card className="p-4">{t('common.loading')}</Card>}
            {error && <Card className="p-4 border-destructive/40 bg-destructive/10 text-sm">{error}</Card>}

            {!isLoading && !error && (
              <Card className="p-4 border-white/10 bg-white/[0.04]">
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <LocalizedLink href={`/listing/${item.id}`} className="text-lg font-semibold hover:text-market-200">
                              {item.title}
                            </LocalizedLink>
                            <Badge variant="statusReserved">WANTED</Badge>
                          </div>
                          <p className="mt-1 text-sm text-white/65">{item.content || t('common.noData')}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/58">
                            <span>{t('pages.search.price', { value: formatPrice(item.price_listed) })}</span>
                            <span>{t('pages.listing.location', { value: item.location || '-' })}</span>
                            <span>{t('pages.listing.conversationOfferRounds', { value: String(item.conversations_7d ?? item.comment_count ?? 0) })}</span>
                            <LocalizedLink href={`/u/${item.author_name || item.authorName || 'unknown'}`} className="hover:text-market-200">
                              {t('pages.listing.seller', { value: item.author_name || item.authorName || '-' })}
                            </LocalizedLink>
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                          <p className="text-xs text-white/55">{t('pages.wanted.intentScore')}</p>
                          <p className="text-xl font-bold text-market-200">{Number(item.conversations_7d || item.comment_count || 0) + Number(item.completed_orders_7d || 0)}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <LocalizedLink href={`/listing/${item.id}`}>
                              <Button size="sm" variant="marketGhost">{t('actions.viewDetail')}</Button>
                            </LocalizedLink>
                            <Button
                              size="sm"
                              variant="marketPrimary"
                              onClick={() => startConversation(item.listing_id || item.listingId || item.id)}
                            >
                              {t('actions.startConversation')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {items.length === 0 && <p className="text-sm text-white/60">{t('pages.search.noResults')}</p>}

                {items.length > 0 && (
                  <PaginationBar
                    page={page}
                    hasPrev={page > 1}
                    hasNext={items.length === WANTED_PAGE_SIZE}
                    onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setPage((prev) => prev + 1)}
                  />
                )}
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <Radar className="h-4 w-4 text-market-300" />
                <h3 className="font-semibold">{t('pages.wanted.radarTitle')}</h3>
              </div>
              <div className="space-y-2">
                {categoryStats.length === 0 && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                {categoryStats.map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <span>{category}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-300" />
                <h3 className="font-semibold">{t('pages.wanted.highIntentTitle')}</h3>
              </div>
              <div className="space-y-2">
                {topIntent.length === 0 && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                {topIntent.map((item) => (
                  <LocalizedLink key={item.id} href={`/listing/${item.id}`} className="block rounded-lg border border-white/10 bg-black/20 p-2.5 hover:border-market-300/40">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-white/55">{t('pages.wanted.intentScore')}: {Number(item.conversations_7d || item.comment_count || 0)}</p>
                  </LocalizedLink>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <Compass className="h-4 w-4 text-sky-300" />
                <h3 className="font-semibold">{t('pages.conversations.publicTranscript')}</h3>
              </div>
              <LocalizedLink href="/conversations" className="text-sm text-market-200 hover:underline">
                {t('pages.conversations.title')} →
              </LocalizedLink>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
