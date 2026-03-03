'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { PaginationBar } from '@/components/common/PaginationBar';
import { api } from '@/lib/api';
import { useAuth, useOrders, usePublicOrders } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { getAvailableOrderActions, getOrderActionLabelKey, getOrderActorRole, type OrderActionKey } from '@/lib/order-actions';
import { Activity, LayoutList, ShieldCheck } from 'lucide-react';

type ViewMode = 'public' | 'mine';
type PublicStatusFilter = 'COMPLETED' | 'REFUNDED' | 'DISPUTED' | 'ALL';
const ORDER_PAGE_SIZE = 12;

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

export default function OrdersPage() {
  const { t, errorMessage } = useI18n();
  const { isAuthenticated, agent } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('public');
  const [publicStatus, setPublicStatus] = useState<PublicStatusFilter>('COMPLETED');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const mine = useOrders();
  const publicOrders = usePublicOrders({
    status: publicStatus,
    limit: ORDER_PAGE_SIZE,
    offset: (page - 1) * ORDER_PAGE_SIZE
  });

  const usingMine = isAuthenticated && viewMode === 'mine';
  const rawData = ((usingMine ? mine.data : publicOrders.data) || []) as any[];
  const data = usingMine
    ? rawData.slice((page - 1) * ORDER_PAGE_SIZE, page * ORDER_PAGE_SIZE)
    : rawData;
  const isLoading = usingMine ? mine.isLoading : publicOrders.isLoading;
  const error = usingMine ? mine.error : publicOrders.error;

  useEffect(() => {
    setPage(1);
  }, [viewMode, publicStatus]);

  const reload = async () => {
    if (usingMine) {
      await mine.mutate();
      return;
    }
    await publicOrders.mutate();
  };

  const statusStats = useMemo(() => {
    const map = new Map<string, number>();
    rawData.forEach((row) => {
      const key = String(row.status || 'UNKNOWN').toUpperCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawData]);

  const hasPrev = page > 1;
  const hasNext = usingMine
    ? page * ORDER_PAGE_SIZE < rawData.length
    : rawData.length === ORDER_PAGE_SIZE;

  const buildActionPayload = (action: OrderActionKey) => {
    if (typeof window === 'undefined') return {};

    if (action === 'requestReturn') {
      const reason = window.prompt(t('pages.orders.actionReasonPlaceholder'));
      return reason ? { reason_code: 'USER_REQUEST', detail: reason } : {};
    }
    if (action === 'approveReturn' || action === 'rejectReturn') {
      const reason = window.prompt(t('pages.orders.actionReasonPlaceholder'));
      return reason ? { reason } : {};
    }
    if (action === 'shipBackReturn' || action === 'receiveReturnedItem') {
      const detail = window.prompt(t('pages.orders.actionReasonPlaceholder'));
      return detail ? { detail } : {};
    }
    if (action === 'dispute') {
      const detail = window.prompt(t('pages.orders.actionReasonPlaceholder'));
      return detail ? { conversation_message: detail, conversation_reason_code: 'DISPUTE' } : {};
    }
    return {};
  };

  const executeOrderAction = async (orderId: string, action: OrderActionKey, payload: Record<string, unknown>) => {
    switch (action) {
      case 'pay':
        return api.payOrder(orderId, payload);
      case 'ship':
        return api.shipOrder(orderId, payload);
      case 'deliver':
        return api.deliverOrder(orderId, payload);
      case 'confirm':
        return api.confirmOrder(orderId, payload);
      case 'complete':
        return api.completeOrder(orderId, payload);
      case 'requestReturn':
        return api.requestReturn(orderId, payload);
      case 'approveReturn':
        return api.approveReturn(orderId, payload);
      case 'rejectReturn':
        return api.rejectReturn(orderId, payload);
      case 'shipBackReturn':
        return api.shipBackReturn(orderId, payload);
      case 'receiveReturnedItem':
        return api.receiveReturnedItem(orderId, payload);
      case 'refund':
        return api.refundOrder(orderId, payload);
      case 'dispute':
        return api.disputeOrder(orderId, payload);
      default:
        return null;
    }
  };

  const runAction = async (orderId: string, action: OrderActionKey) => {
    setActionError(null);
    const payload = buildActionPayload(action);
    const actionKey = `${orderId}:${action}`;
    setBusyActionKey(actionKey);
    try {
      await executeOrderAction(orderId, action, payload);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyActionKey(null);
    }
  };

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <Card className="p-5 border-white/10 bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black">{t('pages.orders.title')}</h1>
              <p className="mt-1 text-sm text-white/65">
                {usingMine ? t('pages.orders.myView') : t('pages.orders.publicView')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={viewMode === 'public' ? 'marketPrimary' : 'marketGhost'} onClick={() => setViewMode('public')}>
                {t('pages.orders.publicView')}
              </Button>
              {isAuthenticated && (
                <Button size="sm" variant={viewMode === 'mine' ? 'marketPrimary' : 'marketGhost'} onClick={() => setViewMode('mine')}>
                  {t('pages.orders.myView')}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            {!isAuthenticated && (
              <Card className="p-3 border-white/10 bg-white/[0.04] text-sm text-white/70">
                {t('pages.orders.guestHint')}
              </Card>
            )}

            {!usingMine && (
              <Card className="p-3 border-white/10 bg-white/[0.03]">
                <div className="flex flex-wrap gap-2">
                  {(['COMPLETED', 'REFUNDED', 'DISPUTED', 'ALL'] as PublicStatusFilter[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={publicStatus === status ? 'marketPrimary' : 'marketGhost'}
                      onClick={() => setPublicStatus(status)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            {isLoading && <Card className="p-4">{t('pages.orders.loading')}</Card>}
            {error && <Card className="p-4 border-destructive/40 bg-destructive/10">{errorMessage(error)}</Card>}
            {actionError && <Card className="p-4 border-destructive/40 bg-destructive/10">{actionError}</Card>}

            {data.length === 0 && !isLoading && !error && <Card className="p-4">{t('pages.orders.empty')}</Card>}

            <div className="grid gap-3 xl:grid-cols-2">
              {data.map((order) => (
                <Card key={order.id} className="p-4 border-white/10 bg-white/[0.04]">
                  {(() => {
                    const role = getOrderActorRole(order as any, agent?.id);
                    const roleLabel = role === 'buyer'
                      ? t('pages.orders.roleBuyer')
                      : role === 'seller'
                        ? t('pages.orders.roleSeller')
                        : t('pages.orders.roleObserver');
                    const availableActions = getAvailableOrderActions(order as any, agent?.id);
                    return (
                      <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <LocalizedLink href={`/orders/${order.id}`} className="font-mono text-sm hover:text-market-200">
                      #{order.id.slice(0, 8)}
                    </LocalizedLink>
                    <Badge variant={String(order.status).toUpperCase() === 'COMPLETED' ? 'statusActive' : 'secondary'}>
                      {order.status}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-white/85">{order.listing_title || order.listingTitle || t('common.untitledListing')}</p>
                  <p className="mt-1 text-sm text-white/65">{t('pages.orders.amount', { value: formatPrice(order.amount) })}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <LocalizedLink href={`/orders/${order.id}`}>
                      <Button size="sm" variant="marketGhost">{t('pages.orders.viewDetail')}</Button>
                    </LocalizedLink>
                    {(order.conversation_id || order.conversationId) && (
                      <LocalizedLink href={`/conversations/${order.conversation_id || order.conversationId}`}>
                        <Button size="sm" variant="marketGhost">{t('pages.orders.sourceConversation')}</Button>
                      </LocalizedLink>
                    )}
                  </div>

                  {usingMine && (
                    <>
                      <div className="mt-3 text-xs text-white/60">
                        {t('pages.orders.pendingActions')} · {roleLabel}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availableActions.length === 0 && (
                          <span className="text-xs text-white/55">{t('common.noData')}</span>
                        )}
                        {availableActions.map((action) => {
                          const actionKey = `${order.id}:${action}`;
                          const isBusy = busyActionKey === actionKey;
                          return (
                            <Button
                              key={action}
                              size="sm"
                              variant={action === 'pay' || action === 'confirm' || action === 'complete' ? 'marketPrimary' : action === 'dispute' ? 'destructive' : 'secondary'}
                              disabled={Boolean(busyActionKey)}
                              onClick={() => runAction(order.id, action)}
                            >
                              {isBusy ? t('common.loading') : t(getOrderActionLabelKey(action))}
                            </Button>
                          );
                        })}
                      </div>
                    </>
                  )}
                      </>
                    );
                  })()}
                </Card>
              ))}
            </div>

            {!isLoading && !error && data.length > 0 && (
              <PaginationBar
                page={page}
                hasPrev={hasPrev}
                hasNext={hasNext}
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
              <div className="space-y-2">
                {statusStats.length === 0 && <p className="text-sm text-white/60">{t('common.noData')}</p>}
                {statusStats.map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <span>{status}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-emerald-300" />
                <h3 className="font-semibold">{t('pages.orders.statusTimeline')}</h3>
              </div>
              <p className="text-sm text-white/65">{t('pages.conversations.publicSectionHint')}</p>
              <div className="mt-3">
                <LocalizedLink href="/conversations">
                  <Button className="w-full" variant="marketGhost">{t('pages.conversations.publicSectionTitle')}</Button>
                </LocalizedLink>
              </div>
            </Card>

            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-300" />
                <h3 className="font-semibold">{t('pages.conversations.publicTranscript')}</h3>
              </div>
              <p className="text-sm text-white/65">{t('pages.conversations.readOnly')}</p>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
