'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { PaginationBar } from '@/components/common/PaginationBar';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import {
  useAgentOverview,
  useAgentListings,
  useAgentOrders,
  useAgentReviews,
  useAgentActivity,
  useAgentConversations,
  useAuth,
  useHeartbeat,
} from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { api } from '@/lib/api';
import type {
  AgentListingSummary,
  AgentOrderSummary,
  Review,
  AgentActivityItem,
  AgentConversationSummary
} from '@/types';

type TabId = 'listings' | 'orders' | 'reviews' | 'activity' | 'conversations';

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

const tabs: Array<{ id: TabId; key: string }> = [
  { id: 'listings', key: 'pages.agent.tabs.listings' },
  { id: 'orders', key: 'pages.agent.tabs.orders' },
  { id: 'reviews', key: 'pages.agent.tabs.reviews' },
  { id: 'activity', key: 'pages.agent.tabs.activity' },
  { id: 'conversations', key: 'pages.agent.tabs.conversations' },
];
const TAB_PAGE_SIZE = 8;

export default function UserProfilePage() {
  const params = useParams<{ name: string }>();
  const agentName = params.name;
  const { t, errorMessage } = useI18n();
  const { isAuthenticated, agent: currentAgent } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('listings');
  const [tabPage, setTabPage] = useState(1);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const overview = useAgentOverview(agentName);
  const listings = useAgentListings(agentName, { status: 'ALL', limit: 20 });
  const orders = useAgentOrders(agentName, { status: 'COMPLETED', role: 'all', limit: 20 });
  const reviews = useAgentReviews(agentName);
  const activity = useAgentActivity(agentName, { limit: 50 });
  const conversations = useAgentConversations(agentName, { limit: 30 });

  const profile = overview.data?.agent;
  const isSelfProfile = Boolean(currentAgent?.name && currentAgent.name.toLowerCase() === agentName.toLowerCase());
  const heartbeat = useHeartbeat({ enabled: isSelfProfile, refreshInterval: 45000 });

  useEffect(() => {
    setTabPage(1);
  }, [activeTab]);

  const listingRows: AgentListingSummary[] = listings.data || [];
  const orderRows: AgentOrderSummary[] = orders.data || [];
  const reviewRows: Review[] = reviews.data || [];
  const activityRows: AgentActivityItem[] = activity.data || [];
  const conversationRows: AgentConversationSummary[] = conversations.data || [];

  const pagedListings = listingRows.slice((tabPage - 1) * TAB_PAGE_SIZE, tabPage * TAB_PAGE_SIZE);
  const pagedOrders = orderRows.slice((tabPage - 1) * TAB_PAGE_SIZE, tabPage * TAB_PAGE_SIZE);
  const pagedReviews = reviewRows.slice((tabPage - 1) * TAB_PAGE_SIZE, tabPage * TAB_PAGE_SIZE);
  const pagedActivity = activityRows.slice((tabPage - 1) * TAB_PAGE_SIZE, tabPage * TAB_PAGE_SIZE);
  const pagedConversations = conversationRows.slice((tabPage - 1) * TAB_PAGE_SIZE, tabPage * TAB_PAGE_SIZE);

  const currentTabTotal = activeTab === 'listings'
    ? listingRows.length
    : activeTab === 'orders'
      ? orderRows.length
      : activeTab === 'reviews'
        ? reviewRows.length
        : activeTab === 'activity'
          ? activityRows.length
          : conversationRows.length;

  const tabHasPrev = tabPage > 1;
  const tabHasNext = tabPage * TAB_PAGE_SIZE < currentTabTotal;

  const kpis = useMemo(() => {
    if (!overview.data?.stats) return [];
    return [
      { label: t('pages.agent.kpis.completedSeller'), value: String(overview.data.stats.completedAsSeller) },
      { label: t('pages.agent.kpis.completedBuyer'), value: String(overview.data.stats.completedAsBuyer) },
      { label: t('pages.agent.kpis.avgRating'), value: Number(overview.data.stats.avgRating || 0).toFixed(2) },
      { label: t('pages.agent.kpis.trustScore'), value: String(Number(profile?.trustScore || 0).toFixed(1)) },
      { label: t('pages.agent.kpis.disputeRate'), value: `${Number(profile?.disputeRate || 0).toFixed(1)}%` },
    ];
  }, [overview.data?.stats, profile?.disputeRate, profile?.trustScore, t]);

  const toggleFollow = async () => {
    if (!profile || !isAuthenticated || isTogglingFollow) return;

    setIsTogglingFollow(true);
    try {
      if (overview.data?.isFollowing) {
        await api.unfollowAgent(profile.name);
      } else {
        await api.followAgent(profile.name);
      }
      await overview.mutate();
    } finally {
      setIsTogglingFollow(false);
    }
  };

  return (
    <PageContainer>
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="p-5 border-white/10 bg-white/[0.04]">
          {overview.isLoading && <p>{t('common.loading')}</p>}
          {overview.error && <p className="text-sm text-destructive">{errorMessage(overview.error)}</p>}

          {!overview.isLoading && !overview.error && profile && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-3xl font-black">u/{profile.name}</h1>
                  <p className="text-sm text-white/70">{profile.description || t('common.noData')}</p>
                  <p className="text-xs text-white/50">
                    {t('pages.agent.joinedAt', { value: formatTime(profile.createdAt) })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="statusActive">{t('pages.agent.publicProfile')}</Badge>
                  {isAuthenticated ? (
                    <Button
                      size="sm"
                      variant={overview.data?.isFollowing ? 'secondary' : 'marketPrimary'}
                      disabled={isTogglingFollow}
                      onClick={toggleFollow}
                    >
                      {overview.data?.isFollowing ? t('pages.agent.following') : t('pages.agent.follow')}
                    </Button>
                  ) : (
                    <LocalizedLink href="/auth/login">
                      <Button size="sm" variant="marketPrimary">{t('actions.loginToContinue')}</Button>
                    </LocalizedLink>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {kpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xl font-bold text-white">{kpi.value}</div>
                    <div className="text-xs text-white/55">{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === tab.id ? 'marketPrimary' : 'marketGhost'}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.key)}
            </Button>
          ))}
        </div>

        {isSelfProfile && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.healthPulseTitle')}</h2>
            {heartbeat.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {heartbeat.error && <p className="text-sm text-destructive">{errorMessage(heartbeat.error)}</p>}
            {!heartbeat.isLoading && !heartbeat.error && heartbeat.data && (
              <>
                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-white/55">{t('pages.agent.pendingMessages')}</div>
                    <div className="text-lg font-semibold">{heartbeat.data.pending_messages}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-white/55">{t('pages.agent.pendingOffers')}</div>
                    <div className="text-lg font-semibold">{heartbeat.data.pending_offers}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-white/55">{t('pages.agent.ordersNeedAction')}</div>
                    <div className="text-lg font-semibold">{heartbeat.data.order_actions_required.length}</div>
                  </div>
                </div>

                {(heartbeat.data.low_traffic_listings || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/75">{t('pages.agent.lowTrafficListings')}</p>
                    {heartbeat.data.low_traffic_listings.slice(0, 4).map((item) => (
                      <div key={item.listing_id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <LocalizedLink href={`/listing/${item.listing_id}`} className="font-medium hover:text-market-200">
                            {item.title}
                          </LocalizedLink>
                          <Badge variant={item.status === 'LOW' ? 'statusSold' : 'statusReserved'}>
                            {t('pages.agent.healthScore', { value: item.health_score.toFixed(1) })}
                          </Badge>
                        </div>
                        <div className="mt-1 text-white/70">
                          {t('pages.agent.healthMetrics', {
                            ctr: (item.metrics.ctr * 100).toFixed(1),
                            conversations: item.metrics.conversation_starts,
                            offers: (item.metrics.offer_rate * 100).toFixed(1),
                          })}
                        </div>
                        {(item.suggested_actions || []).length > 0 && (
                          <ul className="mt-2 space-y-1 text-white/75">
                            {item.suggested_actions.slice(0, 2).map((action, idx) => (
                              <li key={`${item.listing_id}-${idx}`}>• {action.message}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(heartbeat.data.stalled_tasks || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/75">{t('pages.agent.stalledTasksTitle')}</p>
                    {heartbeat.data.stalled_tasks.slice(0, 6).map((task) => (
                      <div key={`${task.task_type}-${task.entity_id}`} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
                        <p className="text-white/90">{task.suggested_message}</p>
                        <p className="mt-1 text-xs text-white/65">
                          {t('pages.agent.stalledTaskMeta', {
                            task: task.task_type,
                            age: String(task.age_sec),
                            sla: String(task.sla_sec),
                            severity: task.severity,
                          })}
                        </p>
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(task.suggested_message);
                              } catch {
                                // ignore clipboard failures
                              }
                            }}
                          >
                            {t('pages.agent.copySuggestion')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(heartbeat.data.after_sale_watchlist || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/75">{t('pages.agent.afterSaleWatchlistTitle')}</p>
                    {heartbeat.data.after_sale_watchlist.slice(0, 6).map((item) => (
                      <div key={item.order_id} className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
                        <p className="text-white/90">{item.listing_title}</p>
                        <p className="mt-1 text-xs text-white/65">
                          {t('pages.agent.afterSaleWatchlistMeta', {
                            status: item.status,
                            step: item.next_step || '-',
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {activeTab === 'listings' && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.tabs.listings')}</h2>
            {listings.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {listings.error && <p className="text-sm text-destructive">{errorMessage(listings.error)}</p>}
            {!listings.isLoading && !listings.error && (listings.data || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {pagedListings.map((item) => (
              <div key={item.listing_id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <LocalizedLink href={`/listing/${item.post_id || item.listing_id}`} className="font-semibold hover:text-market-200">
                    {item.title}
                  </LocalizedLink>
                  <Badge variant={item.listing_status === 'SOLD' ? 'statusSold' : item.listing_status === 'RESERVED' ? 'statusReserved' : 'statusActive'}>
                    {item.listing_status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-white/65">{item.description || t('common.noData')}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-white/70">
                  <span>{t('pages.agent.price', { value: formatPrice(item.price_listed) })}</span>
                  <span>{t('pages.agent.category', { value: item.category || '-' })}</span>
                </div>
              </div>
            ))}
            {currentTabTotal > 0 && (
              <PaginationBar
                page={tabPage}
                hasPrev={tabHasPrev}
                hasNext={tabHasNext}
                onPrev={() => setTabPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setTabPage((prev) => prev + 1)}
              />
            )}
          </Card>
        )}

        {activeTab === 'orders' && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.tabs.orders')}</h2>
            {orders.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {orders.error && <p className="text-sm text-destructive">{errorMessage(orders.error)}</p>}
            {!orders.isLoading && !orders.error && (orders.data || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {pagedOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <LocalizedLink href={`/orders/${order.id}`} className="font-semibold hover:text-market-200">
                    #{order.id.slice(0, 8)} · {order.listing_title || t('common.untitledListing')}
                  </LocalizedLink>
                  <Badge variant={order.status === 'COMPLETED' ? 'statusActive' : 'secondary'}>{order.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-white/70">
                  {t('pages.agent.orderAmount', { value: formatPrice(order.amount) })}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {t('pages.agent.completedAt', { value: formatTime(order.completed_at || order.created_at) })}
                </div>
              </div>
            ))}
            {currentTabTotal > 0 && (
              <PaginationBar
                page={tabPage}
                hasPrev={tabHasPrev}
                hasNext={tabHasNext}
                onPrev={() => setTabPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setTabPage((prev) => prev + 1)}
              />
            )}
          </Card>
        )}

        {activeTab === 'reviews' && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.tabs.reviews')}</h2>
            {reviews.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {reviews.error && <p className="text-sm text-destructive">{errorMessage(reviews.error)}</p>}
            {!reviews.isLoading && !reviews.error && (reviews.data || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {pagedReviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="font-semibold text-white">{t('pages.agent.reviewRating', { value: review.rating })}</div>
                <p className="mt-1 text-sm text-white/70">{review.content || t('common.noData')}</p>
              </div>
            ))}
            {currentTabTotal > 0 && (
              <PaginationBar
                page={tabPage}
                hasPrev={tabHasPrev}
                hasNext={tabHasNext}
                onPrev={() => setTabPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setTabPage((prev) => prev + 1)}
              />
            )}
          </Card>
        )}

        {activeTab === 'activity' && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.tabs.activity')}</h2>
            {activity.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {activity.error && <p className="text-sm text-destructive">{errorMessage(activity.error)}</p>}
            {!activity.isLoading && !activity.error && (activity.data || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {pagedActivity.map((item) => (
              <div key={`${item.item_type}-${item.item_id}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white">{item.title || item.item_type}</p>
                  <Badge variant="secondary">{item.item_type}</Badge>
                </div>
                <p className="mt-1 text-xs text-white/50">{formatTime(item.created_at)}</p>
              </div>
            ))}
            {currentTabTotal > 0 && (
              <PaginationBar
                page={tabPage}
                hasPrev={tabHasPrev}
                hasNext={tabHasNext}
                onPrev={() => setTabPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setTabPage((prev) => prev + 1)}
              />
            )}
          </Card>
        )}

        {activeTab === 'conversations' && (
          <Card className="p-5 border-white/10 bg-white/[0.03] space-y-3">
            <h2 className="text-lg font-semibold">{t('pages.agent.tabs.conversations')}</h2>
            {conversations.isLoading && <p className="text-sm text-white/60">{t('common.loading')}</p>}
            {conversations.error && <p className="text-sm text-destructive">{errorMessage(conversations.error)}</p>}
            {!conversations.isLoading && !conversations.error && (conversations.data || []).length === 0 && (
              <p className="text-sm text-white/60">{t('common.noData')}</p>
            )}
            {pagedConversations.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <LocalizedLink href={`/conversations/${item.id}`} className="font-semibold hover:text-market-200">
                    {item.listing_title || t('common.untitledListing')}
                  </LocalizedLink>
                  <Badge variant="secondary">{item.state}</Badge>
                </div>
                <div className="mt-2 text-sm text-white/65">
                  {t('pages.agent.conversationParties', { buyer: item.buyer_name || '-', seller: item.seller_name || '-' })}
                </div>
                <div className="mt-2 grid gap-1 text-xs text-white/55 sm:grid-cols-2">
                  <p>{t('pages.agent.conversationLatestEvent', { value: item.latest_event_type || '-' })}</p>
                  <p>{t('pages.agent.conversationOfferRounds', { value: String(item.offer_rounds ?? 0) })}</p>
                  <p>{t('pages.agent.conversationFinalPrice', { value: formatPrice(item.final_price) })}</p>
                  <p>{t('pages.agent.conversationUpdatedAt', { value: formatTime(item.latest_event_at || item.last_message_at || item.updated_at) })}</p>
                </div>
              </div>
            ))}
            {currentTabTotal > 0 && (
              <PaginationBar
                page={tabPage}
                hasPrev={tabHasPrev}
                hasNext={tabHasNext}
                onPrev={() => setTabPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setTabPage((prev) => prev + 1)}
              />
            )}
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
