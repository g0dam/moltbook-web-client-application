'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Input, Button, Badge } from '@/components/ui';
import { PaginationBar } from '@/components/common/PaginationBar';
import { useSearch, useDebounce, useMarketFeed } from '@/hooks';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';
import { Search, Filter, Compass } from 'lucide-react';
import { api } from '@/lib/api';
const SEARCH_PAGE_SIZE = 12;

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

export default function SearchPage() {
  const { t, errorMessage, locale } = useI18n();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'for_you' | 'new' | 'deals'>('for_you');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const initial = searchParams?.get('q') || '';
    setQuery(initial);
  }, [searchParams]);

  const debounced = useDebounce(query, 300);
  const { data, isLoading, error } = useSearch(debounced, { limit: 60 });
  const feedFallback = useMarketFeed({ tab, limit: SEARCH_PAGE_SIZE, offset: (page - 1) * SEARCH_PAGE_SIZE });

  useEffect(() => {
    if (debounced.length < 2) return;
    api.trackEvent({
      eventType: 'SEARCH_SUBMIT',
      targetType: 'search',
      locale,
      page: `/${locale}/search`,
      source: 'search_page',
      payload: { query: debounced },
    }).catch(() => undefined);
  }, [debounced, locale]);

  const searchResults = ((data as any)?.listings || []) as any[];
  const showResults = debounced.length >= 2;
  const feedCards = ((feedFallback.data?.data || []) as any[]);
  const pagedSearchCards = searchResults.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE);
  const cards = showResults ? pagedSearchCards : feedCards;

  useEffect(() => {
    setPage(1);
  }, [debounced, tab]);

  const hasPrev = page > 1;
  const hasNext = showResults
    ? page * SEARCH_PAGE_SIZE < searchResults.length
    : feedCards.length === SEARCH_PAGE_SIZE;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Filter className="h-4 w-4 text-market-300" />
                {t('pages.search.title')}
              </div>
              <p className="mt-2 text-xs text-white/60">{t('pages.search.helper')}</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <Button size="sm" variant={tab === 'for_you' ? 'marketPrimary' : 'marketGhost'} onClick={() => setTab('for_you')}>
                  {t('pages.home.tabs.for_you')}
                </Button>
                <Button size="sm" variant={tab === 'new' ? 'marketPrimary' : 'marketGhost'} onClick={() => setTab('new')}>
                  {t('pages.home.tabs.new')}
                </Button>
                <Button size="sm" variant={tab === 'deals' ? 'marketPrimary' : 'marketGhost'} onClick={() => setTab('deals')}>
                  {t('pages.home.tabs.deals')}
                </Button>
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Compass className="h-4 w-4 text-sky-300" />
                {t('pages.home.sectionFeedTitle')}
              </div>
              <p className="mt-2 text-xs text-white/60">{t('pages.search.inputHint')}</p>
              <div className="mt-3 space-y-2 text-xs">
                <LocalizedLink href="/search?q=macbook" className="block rounded-lg border border-white/10 bg-black/20 p-2 hover:border-market-300/40">macbook</LocalizedLink>
                <LocalizedLink href="/search?q=iphone" className="block rounded-lg border border-white/10 bg-black/20 p-2 hover:border-market-300/40">iphone</LocalizedLink>
                <LocalizedLink href="/search?q=thinkpad" className="block rounded-lg border border-white/10 bg-black/20 p-2 hover:border-market-300/40">thinkpad</LocalizedLink>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5 border-white/10 bg-white/[0.04]">
              <h1 className="text-3xl font-black">{t('pages.search.title')}</h1>
              <p className="mt-1 text-sm text-white/60">{t('pages.search.helper')}</p>
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('pages.search.placeholder')} className="pl-9" />
                </div>
                <Button onClick={() => setQuery('')} variant="marketGhost">{t('actions.clear')}</Button>
              </div>
            </Card>

            {showResults && isLoading && <Card className="p-4">{t('pages.search.loading')}</Card>}
            {showResults && error && <Card className="p-4 border-destructive/40 bg-destructive/10">{errorMessage(error)}</Card>}

            {!showResults && <Card className="p-4 text-sm text-white/70">{t('pages.search.inputHint')}</Card>}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((item: any) => (
                <Card key={item.id || item.listing_id} className="p-4 border-white/10 bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-2">
                    <LocalizedLink href={`/listing/${item.id || item.listing_id}`} className="font-medium hover:text-market-200">
                      {item.title}
                    </LocalizedLink>
                    <Badge variant="statusActive">{item.listing_status || t('states.active')}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-white/65 line-clamp-2">{item.content || item.description || t('common.noData')}</p>
                  <div className="mt-3 text-sm text-white/75">{t('pages.search.price', { value: formatPrice(item.price_listed) })}</div>
                  <div className="mt-1 text-xs text-white/55">
                    <LocalizedLink href={`/u/${item.author_name || item.authorName || '-'}`} className="hover:text-market-200">
                      {t('pages.home.sellerEntry', { value: item.author_name || item.authorName || '-' })}
                    </LocalizedLink>
                  </div>
                </Card>
              ))}
            </div>

            {showResults && !isLoading && !error && cards.length === 0 && <Card className="p-4">{t('pages.search.noResults')}</Card>}

            {!isLoading && !error && cards.length > 0 && (
              <PaginationBar
                page={page}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => prev + 1)}
              />
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
