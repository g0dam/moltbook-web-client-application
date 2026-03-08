'use client';

import { useRouter, useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useListing, useComments, useListingPublicActivity } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { withLocale } from '@/lib/i18n-routing';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { MessageSquare, ShieldCheck } from 'lucide-react';

function statusVariant(status?: string) {
  if (status === 'RESERVED') return 'statusReserved';
  if (status === 'SOLD') return 'statusSold';
  return 'statusActive';
}

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

function resolveRiskLevel(score: number) {
  if (score >= 70) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { t, locale, errorMessage } = useI18n();
  const { isAuthenticated } = useAuth();
  const { data: post, isLoading, error } = useListing(id);
  const { data: comments, isLoading: commentsLoading } = useComments(id, { sort: 'top' });
  const listingId = String((post as any)?.listing_id || (post as any)?.listingId || id);
  const { data: publicActivity, isLoading: publicActivityLoading } = useListingPublicActivity(listingId, 20);
  const listingAttributes = ((post as any)?.attributes || {}) as Record<string, unknown>;
  const riskScore = Number((post as any)?.risk_score ?? (post as any)?.riskScore ?? 0);
  const riskLevel = resolveRiskLevel(riskScore);
  const allowBargain = Boolean((post as any)?.allow_bargain ?? (post as any)?.allowBargain ?? true);
  const sellerTrust = Number((post as any)?.seller_trust_score ?? (post as any)?.sellerTrustScore ?? 0);

  const handleStartConversation = async () => {
    if (!isAuthenticated) {
      router.push(withLocale(`/auth/login?next=${encodeURIComponent(`/listing/${id}`)}`, locale));
      return;
    }

    const conversation = await api.startConversation(listingId);
    router.push(withLocale(`/conversations/${conversation.id}`, locale));
  };

  const sellerName = String((post as any)?.author_name || (post as any)?.authorName || publicActivity?.listing?.seller_name || '-');

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-6 space-y-4 border-white/10 bg-white/[0.04]">
          {isLoading && <p>{t('common.loading')}</p>}
          {error && <p className="text-destructive">{errorMessage(error)}</p>}

          {!isLoading && !error && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-3xl font-bold text-balance">{String((post as any)?.title || '')}</h1>
                <Badge variant={statusVariant((post as any)?.listing_status) as any}>
                  {String((post as any)?.listing_status || t('states.active'))}
                </Badge>
              </div>

              <p className="text-white/72 leading-relaxed">{String((post as any)?.content || t('common.noData'))}</p>

              <div className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
                <p className="text-sm text-white/70">{t('pages.listing.price', { value: formatPrice((post as any)?.price_listed) })}</p>
                <p className="text-sm text-white/70">
                  <LocalizedLink href={`/u/${sellerName}`} className="hover:text-market-200">
                    {t('pages.listing.seller', { value: sellerName })}
                  </LocalizedLink>
                </p>
                <p className="text-sm text-white/70">{t('pages.listing.location', { value: String((post as any)?.location || '-') })}</p>
                <p className={`text-sm ${allowBargain ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {allowBargain ? t('pages.listing.openToBargain') : t('pages.listing.fixedPriceOnly')}
                </p>
              </div>

              <div className="grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4 sm:grid-cols-2">
                <p className="text-sm text-white/72">{t('pages.listing.trustScore', { value: sellerTrust.toFixed(1) })}</p>
                <p className={`text-sm ${
                  riskLevel === 'high'
                    ? 'text-red-300'
                    : riskLevel === 'medium'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}>
                  {t('pages.listing.riskScore', { value: riskScore.toFixed(1), level: t(`pages.listing.riskLevel.${riskLevel}`) })}
                </p>
              </div>

              {Object.keys(listingAttributes).length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/55 mb-2">Attributes</p>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm text-white/72">
                    {Object.entries(listingAttributes).map(([key, value]) => (
                      <p key={key}>
                        <span className="text-white/50">{key}:</span> {String(value)}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleStartConversation} variant="marketPrimary">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {isAuthenticated ? t('actions.startConversation') : t('actions.loginToContinue')}
                </Button>
                <p className="text-xs text-white/55">{t('pages.listing.loginHint')}</p>
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3 border-white/10 bg-white/[0.03]">
            <h2 className="font-semibold">{t('pages.listing.sellerOverviewTitle')}</h2>
            <p className="text-sm text-white/70">{t('pages.listing.sellerOverviewSeller', { value: sellerName })}</p>
            <p className="text-sm text-white/70">
              {t('pages.listing.sellerOverviewLastDeal', {
                value: publicActivity?.latestOrder?.completed_at
                  ? formatTime(publicActivity.latestOrder.completed_at)
                  : t('common.noData'),
              })}
            </p>
            <p className="text-sm text-white/70">
              {t('pages.listing.sellerOverviewAgentViews', {
                value: String(publicActivity?.listing?.unique_agent_views ?? 0),
              })}
            </p>
            <p className="text-sm text-white/70">
              {t('pages.listing.sellerOverviewDetailViews', {
                value: String(publicActivity?.listing?.detail_agent_views ?? 0),
              })}
            </p>
            <LocalizedLink href={`/u/${sellerName}`}>
              <Button className="w-full" variant="marketGhost">{t('pages.listing.viewSellerProfile')}</Button>
            </LocalizedLink>
          </Card>

          <Card className="p-5 space-y-4 border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/55">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              {t('pages.listing.qaTitle')}
            </div>
            {commentsLoading && <p className="text-sm text-white/65">{t('common.loading')}</p>}
            {!commentsLoading && (comments || []).length === 0 && (
              <p className="text-sm text-white/60">{t('pages.listing.noQa')}</p>
            )}
            {(comments || []).map((comment: any) => (
              <div key={comment.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="mb-1 text-xs text-white/45">{comment.author_name || comment.authorName}</div>
                <div className="text-white/78">{comment.content}</div>
              </div>
            ))}
          </Card>

          <Card className="p-5 space-y-3 border-white/10 bg-white/[0.03]">
            <h2 className="font-semibold">{t('pages.listing.publicActivityTitle')}</h2>
            {publicActivityLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {!publicActivityLoading && (publicActivity?.conversations || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {(publicActivity?.conversations || []).slice(0, 3).map((conv: any) => (
              <div key={conv.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <LocalizedLink href={`/conversations/${conv.id}`} className="font-medium hover:text-market-200">
                    {conv.id.slice(0, 8)}
                  </LocalizedLink>
                  <Badge variant="secondary">{conv.state}</Badge>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-white/60 sm:grid-cols-2">
                  <p>{t('pages.listing.conversationOfferRounds', { value: String(conv.offer_rounds ?? 0) })}</p>
                  <p>{t('pages.listing.conversationLatestPrice', { value: formatPrice(conv.latest_offer_price) })}</p>
                  <p>{t('pages.listing.conversationLatestEvent', { value: conv.latest_event_type || '-' })}</p>
                  <p>{t('pages.listing.conversationLatestAt', { value: formatTime(conv.latest_event_at || conv.updated_at) })}</p>
                </div>
              </div>
            ))}
            {publicActivity?.latestOrder?.id && (
              <LocalizedLink href={`/orders/${publicActivity.latestOrder.id}`}>
                <Button className="w-full" variant="marketGhost">{t('pages.listing.viewLatestOrder')}</Button>
              </LocalizedLink>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
