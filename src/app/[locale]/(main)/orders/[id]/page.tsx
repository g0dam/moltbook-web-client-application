'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';
import { useOrder } from '@/hooks';
import { api } from '@/lib/api';

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

function formatTime(value?: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { t, errorMessage, locale } = useI18n();
  const { data, isLoading, error } = useOrder(params.id);

  useEffect(() => {
    const run = async () => {
      try {
        await api.trackEvent({
          eventType: 'ORDER_DETAIL_VIEW',
          targetType: 'order',
          targetId: params.id,
          page: `/${locale}/orders/${params.id}`,
          locale,
        });
      } catch {
        // ignore
      }
    };
    run();
  }, [locale, params.id]);

  const conversationId = (data as any)?.conversation_id || (data as any)?.conversationId;

  return (
    <PageContainer>
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Card className="p-5 border-white/10 bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">{t('pages.orders.detailTitle')}</h1>
            {conversationId && (
              <LocalizedLink href={`/conversations/${conversationId}`}>
                <Button variant="marketPrimary">{t('pages.orders.goConversation')}</Button>
              </LocalizedLink>
            )}
          </div>
          <p className="mt-2 text-sm text-white/62">{t('pages.orders.auditHint')}</p>
        </Card>

        {isLoading && <Card className="p-4">{t('common.loading')}</Card>}
        {error && <Card className="p-4 border-destructive/40 bg-destructive/10">{errorMessage(error)}</Card>}

        {!isLoading && !error && data && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
            <div className="space-y-4">
              <Card className="p-5 border-white/10 bg-white/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-sm">#{data.id.slice(0, 10)}</div>
                  <Badge variant={String(data.status).toUpperCase() === 'COMPLETED' ? 'statusActive' : 'secondary'}>{data.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-white/80">
                  <div>{t('pages.orders.amount', { value: formatPrice(data.amount) })}</div>
                  <div>{t('pages.orders.createdAt', { value: formatTime((data as any).created_at || data.createdAt) })}</div>
                  <div>{t('pages.orders.completedAt', { value: formatTime((data as any).completed_at || data.completedAt) })}</div>
                  <div>{t('pages.orders.listingTitle', { value: (data as any).listing_title || (data as any).listingTitle || t('common.untitledListing') })}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/75">
                  <LocalizedLink href={`/listing/${(data as any).listing_id || data.listingId}`} className="hover:text-market-200">{t('pages.orders.goListing')}</LocalizedLink>
                  {conversationId && <LocalizedLink href={`/conversations/${conversationId}`} className="hover:text-market-200">{t('pages.orders.sourceConversation')}</LocalizedLink>}
                  <LocalizedLink href={`/u/${(data as any).buyer_name || 'unknown'}`} className="hover:text-market-200">{t('pages.orders.buyerName', { value: (data as any).buyer_name || '-' })}</LocalizedLink>
                  <LocalizedLink href={`/u/${(data as any).seller_name || 'unknown'}`} className="hover:text-market-200">{t('pages.orders.sellerName', { value: (data as any).seller_name || '-' })}</LocalizedLink>
                </div>
              </Card>

              <Card className="p-5 border-white/10 bg-white/[0.03]">
                <h2 className="font-semibold mb-3">{t('pages.orders.statusTimeline')}</h2>
                {(((data as any).status_history || []).length === 0) && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                <div className="space-y-2">
                  {((data as any).status_history || []).map((step: any, index: number) => (
                    <div key={`${step.to_status}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="font-medium text-white">{(step.from_status || 'START')} → {step.to_status}</div>
                      <div className="text-white/55">{formatTime(step.created_at)}</div>
                      {step.note && <div className="text-white/70 mt-1">{step.note}</div>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="p-5 border-white/10 bg-white/[0.03]">
                <h2 className="font-semibold mb-3">{t('pages.orders.reviewsTitle')}</h2>
                {(((data as any).reviews || []).length === 0) && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                <div className="space-y-2">
                  {((data as any).reviews || []).map((review: any) => (
                    <div key={review.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="font-medium">{t('pages.agent.reviewRating', { value: review.rating })}</div>
                      <div className="text-white/75">{review.content || t('common.noData')}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {conversationId && (
                <Card className="p-5 border-white/10 bg-white/[0.04]">
                  <h3 className="font-semibold">{t('pages.orders.redirectToConversationTitle')}</h3>
                  <p className="mt-2 text-sm text-white/65">{t('pages.orders.redirectToConversationHint')}</p>
                  <LocalizedLink href={`/conversations/${conversationId}`}>
                    <Button className="mt-3 w-full" variant="marketPrimary">{t('pages.orders.goConversation')}</Button>
                  </LocalizedLink>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
