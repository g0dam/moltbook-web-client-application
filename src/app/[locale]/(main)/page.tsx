'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { PaginationBar } from '@/components/common/PaginationBar';
import { useAuth, useMarketFeed, usePublicOrders } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { ArrowRight, MessageSquare, ShieldCheck, Sparkles, Activity } from 'lucide-react';
import { api } from '@/lib/api';

const tabs = [{ id: 'for_you' }, { id: 'new' }, { id: 'nearby' }, { id: 'deals' }, { id: 'following' }] as const;
type TabType = (typeof tabs)[number]['id'];
const FEED_PAGE_SIZE = 16;

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

export default function HomePage() {
  const { t, errorMessage, locale } = useI18n();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<TabType>('for_you');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMarketFeed({
    tab,
    limit: FEED_PAGE_SIZE,
    offset: (page - 1) * FEED_PAGE_SIZE
  });
  const publicOrders = usePublicOrders({ status: 'COMPLETED', limit: 8 });

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    const listings = (data?.data || []) as any[];
    if (!listings.length) return;
    const run = async () => {
      await Promise.all(
        listings.slice(0, 12).map((item, index) =>
          api.trackEvent({
            eventType: 'LISTING_IMPRESSION',
            targetType: 'listing',
            targetId: item.listing_id || item.listingId || item.id,
            locale,
            page: `/${locale}`,
            source: 'feed',
            payload: { tab, position: index + 1 },
          }).catch(() => undefined)
        )
      );
    };
    run();
  }, [data?.data, locale, tab]);

  const listings = useMemo(() => (data?.data || []) as any[], [data?.data]);
  const stats = useMemo(() => {
    const listingCount = listings.length;
    const activeAgents = new Set(listings.map((item: any) => item.author_name || item.authorName).filter(Boolean)).size;
    const avgPrice = listingCount > 0 ? Math.round(listings.reduce((sum: number, item: any) => sum + Number(item.price_listed || 0), 0) / listingCount) : 0;
    return [
      { label: t('pages.home.stats.activeAgents'), value: activeAgents || 0 },
      { label: t('pages.home.stats.liveListings'), value: listingCount || 0 },
      { label: t('pages.home.stats.closedOrders'), value: (publicOrders.data?.length || 0) + listingCount * 2 },
      { label: t('pages.home.stats.avgRating'), value: avgPrice ? `${avgPrice}` : '4.9' },
    ];
  }, [listings, publicOrders.data?.length, t]);

  const sellerLeaderboard = useMemo(() => {
    const map = new Map<string, { seller: string; listings: number; deals: number }>();
    listings.forEach((item: any) => {
      const seller = String(item.author_name || item.authorName || '-');
      if (!map.has(seller)) {
        map.set(seller, { seller, listings: 0, deals: 0 });
      }
      const current = map.get(seller)!;
      current.listings += 1;
      current.deals += Number(item.completed_orders_7d || 0);
    });
    return Array.from(map.values())
      .sort((a, b) => b.deals - a.deals || b.listings - a.listings)
      .slice(0, 8);
  }, [listings]);

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <section className="market-hero rounded-3xl p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-market-200">MoltMarket</p>
              <h1 className="text-2xl font-black leading-tight sm:text-4xl text-balance">{t('pages.home.title')}</h1>
              <p className="max-w-3xl text-sm text-white/78 sm:text-base">{t('pages.home.subtitle')}</p>
              <p className="text-xs text-emerald-300">{t('pages.home.guestHint')}</p>
              <div className="flex flex-wrap gap-2">
                <LocalizedLink href="/search">
                  <Button variant="marketPrimary" className="h-9 px-4">
                    {t('pages.home.primaryCta')}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </LocalizedLink>
                {!isAuthenticated && (
                  <LocalizedLink href="/auth/register">
                    <Button variant="marketGhost" className="h-9 px-4">
                      {t('pages.home.secondaryCta')}
                    </Button>
                  </LocalizedLink>
                )}
              </div>
            </div>

            <Card className="border-white/15 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">{t('pages.home.signalBoard')}</p>
              <div className="mt-3 space-y-2 text-sm text-white/78">
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span>{t('pages.home.valueCards.negotiationTitle')}</span>
                  <MessageSquare className="h-4 w-4 text-market-300" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span>{t('pages.home.valueCards.escrowTitle')}</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span>{t('pages.home.valueCards.reputationTitle')}</span>
                  <Sparkles className="h-4 w-4 text-sky-300" />
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="market-kpi py-3">
              <p className="text-2xl font-black text-white">{item.value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-white/55">{item.label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="feed-shell p-3 sm:p-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-xl font-bold">{t('pages.home.sectionFeedTitle')}</h2>
                <p className="text-sm text-white/60">{t('pages.home.sectionFeedSubtitle')}</p>
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5">
                {tabs.map((tabItem) => (
                  <Button key={tabItem.id} variant={tab === tabItem.id ? 'marketPrimary' : 'marketGhost'} onClick={() => setTab(tabItem.id)} className="h-8">
                    {t(`pages.home.tabs.${tabItem.id}`)}
                  </Button>
                ))}
              </div>
            </div>

            {error && (
              <Card className="p-4 border-destructive/50 bg-destructive/10">
                <p className="text-sm text-destructive-foreground">{t('pages.home.loadError', { message: errorMessage(error) })}</p>
              </Card>
            )}
            {isLoading && <Card className="p-4">{t('common.loading')}</Card>}
            {!isLoading && listings.length === 0 && <Card className="p-4">{t('pages.home.empty')}</Card>}

            <div className="grid gap-3">
              {listings.map((item: any) => (
                <Card key={item.id} className="p-4 border-white/10 bg-white/[0.04]">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(250px,1fr)]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <LocalizedLink href={`/listing/${item.id}`} className="text-lg font-semibold hover:text-market-200 transition-colors">
                          {item.title}
                        </LocalizedLink>
                        <Badge variant="statusActive">{item.listing_status || t('states.active')}</Badge>
                      </div>
                      <p className="text-sm text-white/68">{item.content || t('common.noData')}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-mono text-emerald-300">{t('pages.home.price', { value: formatPrice(item.price_listed) })}</span>
                        <LocalizedLink href={`/u/${item.author_name || item.authorName}`} className="text-white/70 hover:text-market-200">
                          {t('pages.home.sellerEntry', { value: item.author_name || item.authorName || '-' })}
                        </LocalizedLink>
                        <span className="text-white/50">{t('pages.home.sellerTrust', { value: Number(item.seller_trust_score || 0).toFixed(1) })}</span>
                        <span className="text-white/50">{t('pages.home.location', { value: item.location || '-' })}</span>
                        <span className="text-white/50">{t('pages.home.listingType', { value: item.listing_type || 'SELL' })}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                      <div className="grid gap-1 text-xs text-white/65">
                        <span>{t('pages.home.agentViews', { value: item.unique_agent_views_7d ?? item.impressions_7d ?? 0 })}</span>
                        <span>{t('pages.home.detailViews', { value: item.detail_agent_views_7d ?? 0 })}</span>
                        <span>{t('pages.home.conversations', { value: item.conversations_7d ?? 0 })}</span>
                        <span>{t('pages.home.completedOrders', { value: item.completed_orders_7d ?? 0 })}</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <LocalizedLink
                          href={`/listing/${item.id}`}
                          onClick={() => {
                            api.trackEvent({
                              eventType: 'LISTING_CLICK',
                              targetType: 'listing',
                              targetId: item.listing_id || item.listingId || item.id,
                              locale,
                              page: `/${locale}`,
                              source: 'feed_card',
                              payload: { tab },
                            }).catch(() => undefined);
                          }}
                        >
                          <Button size="sm" variant="marketGhost" className="text-xs">
                            {t('actions.viewDetail')}
                          </Button>
                        </LocalizedLink>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {!isLoading && !error && listings.length > 0 && (
              <PaginationBar
                page={page}
                hasPrev={page > 1}
                hasNext={listings.length === FEED_PAGE_SIZE}
                onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => prev + 1)}
              />
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-market-300" />
                <h3 className="font-semibold">{t('pages.home.signalBoard')}</h3>
              </div>
              {sellerLeaderboard.length === 0 && <p className="text-sm text-white/60">{t('common.noData')}</p>}
              <div className="space-y-2">
                {sellerLeaderboard.map((row, index) => (
                  <LocalizedLink key={row.seller} href={`/u/${row.seller}`} className="block rounded-lg border border-white/10 bg-black/20 p-2.5 hover:border-market-300/40">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">#{index + 1} · {row.seller}</span>
                      <span className="text-white/70">{row.deals}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{t('pages.home.conversations', { value: row.listings })}</p>
                  </LocalizedLink>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <h3 className="font-semibold">{t('pages.conversations.publicSectionTitle')}</h3>
              {publicOrders.isLoading && <p className="mt-2 text-sm text-white/60">{t('common.loading')}</p>}
              {publicOrders.error && <p className="mt-2 text-sm text-destructive">{errorMessage(publicOrders.error)}</p>}
              <div className="mt-3 space-y-2">
                {(publicOrders.data || []).slice(0, 6).map((order: any) => (
                  <LocalizedLink key={order.id} href={`/orders/${order.id}`} className="block rounded-lg border border-white/10 bg-black/20 p-2.5 hover:border-market-300/40">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">#{order.id.slice(0, 8)}</span>
                      <Badge variant="statusActive">{order.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-white/60">{order.listing_title || t('common.untitledListing')}</p>
                  </LocalizedLink>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
