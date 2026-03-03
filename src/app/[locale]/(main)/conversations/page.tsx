'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { useAuth, useConversations, useConversationStream } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { Activity, MessageSquareMore, TrendingUp } from 'lucide-react';
import type { ConversationListItem, ConversationPreviewSegment } from '@/types';

type FilterKey = 'all' | 'negotiating' | 'returning' | 'completed' | 'wanted';
const PAGE_SIZE = 10;

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

function BubblePreview({ segment }: { segment: ConversationPreviewSegment }) {
  if (segment.segment_type === 'STATUS_LINE') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="h-px flex-1 bg-white/15" />
        <span className="rounded-full border border-white/20 bg-white/8 px-2 py-0.5 text-[11px] text-white/65">
          {segment.text}
        </span>
        <span className="h-px flex-1 bg-white/15" />
      </div>
    );
  }

  const alignRight = segment.side === 'seller';
  return (
    <div className={`flex ${alignRight ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${alignRight ? 'bg-market-500/20 text-market-100 border border-market-300/35' : 'bg-white/10 text-white/85 border border-white/15'}`}>
        {segment.text}
      </div>
    </div>
  );
}

function ConversationRow({ item, t }: { item: ConversationListItem; t: (key: string, params?: Record<string, string | number>) => string }) {
  const orderStatus = String(item.order_status || '').toUpperCase();
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <LocalizedLink href={`/conversations/${item.id}`} className="font-semibold hover:text-market-200">
          {item.listing_title || t('common.untitledListing')}
        </LocalizedLink>
        <div className="flex items-center gap-2">
          {item.contains_return_flow && <Badge variant="statusReserved">RETURN</Badge>}
          <Badge variant={orderStatus === 'COMPLETED' || orderStatus === 'REFUNDED' ? 'statusActive' : 'secondary'}>
            {orderStatus || item.state}
          </Badge>
        </div>
      </div>

      <div className="space-y-1.5">
        {(item.preview_segments || []).length === 0 && (
          <p className="text-xs text-white/55">{t('pages.conversations.previewEmpty')}</p>
        )}
        {(item.preview_segments || []).map((segment, index) => (
          <BubblePreview key={`${segment.occurred_at}-${index}`} segment={segment} />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/58">
        <span>#{item.id.slice(0, 8)}</span>
        <span>{t('pages.listing.conversationOfferRounds', { value: String(item.offer_rounds ?? 0) })}</span>
        <span>{t('pages.conversations.heat', { value: item.conversation_heat ?? 0 })}</span>
        <span>{t('pages.conversations.price', { value: formatPrice(item.final_price) })}</span>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const { t, errorMessage } = useI18n();
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  const mine = useConversations();
  const stream = useConversationStream(
    {
      status: filter === 'all' || filter === 'wanted' ? 'ALL' : filter === 'negotiating' ? 'NEGOTIATING' : filter === 'returning' ? 'RETURNING' : 'COMPLETED',
      listingType: filter === 'wanted' ? 'WANTED' : 'ALL',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    { refreshInterval: 15000 }
  );

  useEffect(() => {
    setPage(1);
  }, [filter, isAuthenticated]);

  const mineRows = useMemo(() => {
    const rows = (mine.data || []) as ConversationListItem[];
    if (filter === 'all') return rows;
    if (filter === 'wanted') return rows.filter((row) => String(row.listing_type || '').toUpperCase() === 'WANTED');
    if (filter === 'completed') {
      return rows.filter((row) => ['COMPLETED', 'REFUNDED'].includes(String(row.order_status || '').toUpperCase()));
    }
    if (filter === 'returning') {
      return rows.filter((row) => row.contains_return_flow || String(row.order_status || '').startsWith('RETURN_') || String(row.order_status || '').toUpperCase() === 'DISPUTED');
    }
    return rows.filter((row) => !['COMPLETED', 'REFUNDED'].includes(String(row.order_status || '').toUpperCase()));
  }, [mine.data, filter]);

  const minePageRows = useMemo(() => {
    const offset = (page - 1) * PAGE_SIZE;
    return mineRows.slice(offset, offset + PAGE_SIZE);
  }, [mineRows, page]);

  const publicRows = (stream.data || []) as ConversationListItem[];
  const rows = isAuthenticated ? minePageRows : publicRows;
  const canPrev = page > 1;
  const canNext = isAuthenticated ? page * PAGE_SIZE < mineRows.length : publicRows.length === PAGE_SIZE;

  const heatBoard = useMemo(() => {
    return [...rows].sort((a, b) => (b.conversation_heat || 0) - (a.conversation_heat || 0)).slice(0, 8);
  }, [rows]);

  const filterOptions: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: t('pages.conversations.filters.all') },
    { key: 'negotiating', label: t('pages.conversations.filters.negotiating') },
    { key: 'returning', label: t('pages.conversations.filters.returning') },
    { key: 'completed', label: t('pages.conversations.filters.completed') },
    { key: 'wanted', label: t('pages.conversations.filters.wanted') },
  ];

  const isLoading = isAuthenticated ? mine.isLoading : stream.isLoading;
  const loadError = isAuthenticated ? mine.error : stream.error;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <Card className="p-5 border-white/10 bg-white/[0.04]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] lg:items-center">
            <div>
              <h1 className="text-3xl font-black">{t('pages.conversations.title')}</h1>
              <p className="mt-2 text-sm text-white/65">
                {isAuthenticated ? t('pages.conversations.authHint') : t('pages.conversations.publicStreamHint')}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">{t('pages.orders.myView')}</p>
                <p className="mt-1 text-lg font-bold">{isAuthenticated ? mineRows.length : 0}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">{t('pages.orders.publicView')}</p>
                <p className="mt-1 text-lg font-bold">{publicRows.length}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">{t('pages.conversations.heatTitle')}</p>
                <p className="mt-1 text-lg font-bold">{rows[0]?.conversation_heat ?? 0}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            <Card className="p-3 border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <Button
                    key={option.key}
                    size="sm"
                    variant={filter === option.key ? 'marketPrimary' : 'marketGhost'}
                    onClick={() => setFilter(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              {isLoading && <p className="text-sm text-white/60">{t('pages.conversations.loadingList')}</p>}
              {loadError && <p className="text-sm text-destructive">{t('pages.conversations.loadError', { message: errorMessage(loadError) })}</p>}
              {!isLoading && !loadError && rows.length === 0 && <p className="text-sm text-white/60">{t('pages.conversations.empty')}</p>}

              <div className="space-y-3">
                {rows.map((item) => (
                  <ConversationRow key={item.id} item={item} t={t} />
                ))}
              </div>

              {!isLoading && !loadError && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <p className="text-xs text-white/55">
                    {t('pages.conversations.pagination.page', { page, size: PAGE_SIZE })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="marketGhost" disabled={!canPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                      {t('pages.conversations.pagination.prev')}
                    </Button>
                    <Button size="sm" variant="marketGhost" disabled={!canNext} onClick={() => setPage((prev) => prev + 1)}>
                      {t('pages.conversations.pagination.next')}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-market-300" />
                <h3 className="font-semibold">{t('pages.conversations.heatTitle')}</h3>
              </div>
              <div className="space-y-2">
                {heatBoard.length === 0 && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                {heatBoard.map((item, idx) => (
                  <LocalizedLink key={item.id} href={`/conversations/${item.id}`} className="block rounded-lg border border-white/10 bg-black/20 p-2.5 hover:border-market-300/40">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>#{idx + 1} · {item.listing_title || t('common.untitledListing')}</span>
                      <span className="font-semibold">{item.conversation_heat}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{item.latest_event_type || item.state}</p>
                  </LocalizedLink>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareMore className="h-4 w-4 text-emerald-300" />
                <h3 className="font-semibold">{t('pages.conversations.publicTranscript')}</h3>
              </div>
              <p className="text-sm text-white/65">{t('pages.conversations.readOnlyHintGuest')}</p>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-sky-300" />
                <h3 className="font-semibold">{t('pages.listing.publicActivityTitle')}</h3>
              </div>
              <LocalizedLink href="/wanted" className="text-sm text-market-200 hover:underline">
                {t('nav.wanted')} →
              </LocalizedLink>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
