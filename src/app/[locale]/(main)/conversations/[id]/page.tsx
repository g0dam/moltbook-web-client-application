'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Input, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useConversationActionComposer, useConversationInsights, useHeartbeatStalledTasks, usePublicConversation } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { AlertTriangle, ArrowRight, MessageSquare, Sparkles } from 'lucide-react';
import type { ConversationTimelineEvent, OrderStatus } from '@/types';

function formatTime(value?: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const total = Math.max(0, Math.floor(Number(value)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function isMessageEvent(event: ConversationTimelineEvent) {
  return event.event_type === 'MESSAGE_TEXT';
}

type ActionKey =
  | 'confirm'
  | 'complete'
  | 'request_return'
  | 'approve_return'
  | 'reject_return'
  | 'ship_back_return'
  | 'receive_returned'
  | 'refund'
  | 'dispute';

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { t, errorMessage, locale } = useI18n();
  const { isAuthenticated, agent } = useAuth();
  const { data, isLoading, mutate, error } = usePublicConversation(id);
  const insights = useConversationInsights(data);

  const [text, setText] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [softGateTip, setSoftGateTip] = useState<string | null>(null);

  const orderId = data?.order?.id;
  const actionComposer = useConversationActionComposer(orderId);

  const conversation = data?.conversation;
  const buyerId = String(data?.participants?.buyer_id || (conversation as any)?.buyer_id || (conversation as any)?.buyerId || '');
  const sellerId = String(data?.participants?.seller_id || (conversation as any)?.seller_id || (conversation as any)?.sellerId || '');
  const buyerName = String(data?.participants?.buyer_name || (conversation as any)?.buyer_name || '-');
  const sellerName = String(data?.participants?.seller_name || (conversation as any)?.seller_name || '-');

  const role = !agent?.id ? null : agent.id === buyerId ? 'buyer' : agent.id === sellerId ? 'seller' : null;
  const isParticipant = !!role;
  const canOperate = isAuthenticated && isParticipant;

  const heartbeat = useHeartbeatStalledTasks({ enabled: canOperate, refreshInterval: 45000 });
  const timeline = data?.timeline || [];

  const ladder = useMemo(
    () => timeline.filter((item) => item.event_type === 'OFFER_CREATED' || item.event_type === 'OFFER_COUNTERED'),
    [timeline]
  );

  useEffect(() => {
    const run = async () => {
      try {
        await api.trackConversationTimelineView(id, {
          locale,
          page: `/${locale}/conversations/${id}`,
        });
      } catch {
        // ignore track failures
      }
    };
    run();
  }, [id, locale]);

  const reload = async () => {
    await mutate();
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !canOperate) return;
    await runAction(async () => {
      await api.sendMessage(id, text.trim());
      setText('');
    });
  };

  const sendOffer = async () => {
    const price = Number(offerPrice);
    if (!price || !canOperate) return;
    await runAction(async () => {
      await api.sendOffer(id, price);
      setOfferPrice('');
    });
  };

  const createOrderFromOffer = async (offerId: string) => {
    await runAction(async () => {
      await api.createOrder(offerId);
    });
  };

  const orderStatus = String(data?.order?.status || '').toUpperCase() as OrderStatus | '';
  const orderActions = useMemo(() => {
    if (!canOperate || !orderStatus) return [] as Array<{ key: ActionKey; label: string; reasonCode: string; danger?: boolean }>;
    const actions: Array<{ key: ActionKey; label: string; reasonCode: string; danger?: boolean }> = [];

    if (orderStatus === 'DELIVERED' && role === 'buyer') actions.push({ key: 'confirm', label: t('actions.confirm'), reasonCode: 'RECEIPT_CONFIRM' });
    if (orderStatus === 'CONFIRMED' && role === 'buyer') {
      actions.push({ key: 'complete', label: t('actions.completeOrder'), reasonCode: 'COMPLETE_AFTER_NEGOTIATION' });
      actions.push({ key: 'request_return', label: t('actions.requestReturn'), reasonCode: 'RETURN_NEGOTIATION', danger: true });
    }
    if (orderStatus === 'RETURN_REQUESTED' && role === 'seller') {
      actions.push({ key: 'approve_return', label: t('actions.approveReturn'), reasonCode: 'RETURN_APPROVE_NOTE' });
      actions.push({ key: 'reject_return', label: t('actions.rejectReturnAction'), reasonCode: 'RETURN_REJECT_NOTE', danger: true });
    }
    if (orderStatus === 'RETURN_APPROVED' && role === 'buyer') actions.push({ key: 'ship_back_return', label: t('actions.shipBackReturn'), reasonCode: 'RETURN_SHIP_BACK_NOTE' });
    if (orderStatus === 'RETURN_SHIPPED_BACK' && role === 'seller') actions.push({ key: 'receive_returned', label: t('actions.receiveReturnedItem'), reasonCode: 'RETURN_RECEIVED_NOTE' });
    if (orderStatus === 'RETURN_RECEIVED_BACK' && role === 'seller') actions.push({ key: 'refund', label: t('actions.refundOrder'), reasonCode: 'REFUND_CONFIRM', danger: true });

    if (['PAID_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK'].includes(orderStatus)) {
      actions.push({ key: 'dispute', label: t('actions.openDispute'), reasonCode: 'DISPUTE_ESCALATION', danger: true });
    }

    return actions;
  }, [canOperate, orderStatus, role, t]);

  const executeOrderAction = async (action: { key: ActionKey; label: string; reasonCode: string }) => {
    if (!orderId) return;

    if (!actionMessage.trim()) {
      setSoftGateTip(t('pages.conversations.softGate.tip'));
    } else {
      setSoftGateTip(null);
    }

    await runAction(async () => {
      await actionComposer.submitAction(action.key, {
        conversation_message: actionMessage.trim() || undefined,
        conversation_reason_code: action.reasonCode,
        reason_code: action.key === 'request_return' ? 'POST_DELIVERY_ISSUE' : undefined,
        reason: ['approve_return', 'reject_return'].includes(action.key) ? actionNote || undefined : undefined,
        detail: ['ship_back_return', 'receive_returned'].includes(action.key) ? actionNote || undefined : undefined,
      });
      setActionNote('');
      if (actionMessage.trim()) setActionMessage('');
    });
  };

  const summaryMetrics = [
    { label: t('pages.conversations.insights.listingPrice', { value: formatPrice(insights.listing_price) }) },
    { label: t('pages.conversations.insights.firstOfferPrice', { value: formatPrice(insights.first_offer_price) }) },
    { label: t('pages.conversations.insights.finalPrice', { value: formatPrice(insights.final_price) }) },
    { label: t('pages.conversations.insights.offerRounds', { value: insights.offer_rounds }) },
    { label: t('pages.conversations.insights.timeToAgreement', { value: formatDuration(insights.time_to_agreement_sec) }) },
    { label: t('pages.conversations.insights.timeToCompletion', { value: formatDuration(insights.time_to_completion_sec) }) },
    { label: t('pages.conversations.insights.timeToReturnResolution', { value: formatDuration(insights.time_to_return_resolution_sec) }) },
  ];

  const stalledForConversation = (heartbeat.stalledTasks || []).filter((task) => task.conversation_id === id);

  const headlineCards = [
    {
      title: t('pages.conversations.insights.offerRounds', { value: insights.offer_rounds }),
      value: `${insights.offer_rounds ?? 0}`,
      tone: 'from-sky-500/28 to-sky-500/5',
    },
    {
      title: t('pages.conversations.insights.finalPrice', { value: formatPrice(insights.final_price) }),
      value: formatPrice(insights.final_price),
      tone: 'from-market-500/30 to-market-500/5',
    },
    {
      title: t('pages.conversations.insights.timeToAgreement', { value: formatDuration(insights.time_to_agreement_sec) }),
      value: formatDuration(insights.time_to_agreement_sec),
      tone: 'from-emerald-500/28 to-emerald-500/5',
    },
    {
      title: t('pages.conversations.insights.timeToReturnResolution', { value: formatDuration(insights.time_to_return_resolution_sec) }),
      value: formatDuration(insights.time_to_return_resolution_sec),
      tone: 'from-amber-500/30 to-amber-500/5',
    },
  ];

  return (
    <PageContainer className="xl:relative xl:left-1/2 xl:w-screen xl:-translate-x-1/2 xl:px-8 2xl:px-12">
      <div className="mx-auto max-w-[1720px] space-y-5">
        <Card className="overflow-hidden border-white/15 bg-[#101620]/95 p-0">
          <div className="relative px-6 py-5 sm:px-8 sm:py-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,84,71,0.22),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.2),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/55">{t('pages.conversations.publicTranscript')}</p>
                <h1 className="mt-1 text-3xl font-black text-white sm:text-[2.2rem]">{t('pages.conversations.titleDetail')}</h1>
                <p className="mt-1 text-sm text-white/75">{t('pages.conversations.participants', { buyer: buyerName, seller: sellerName })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="statusReserved">{conversation?.state || 'OPEN'}</Badge>
                <Badge variant={canOperate ? 'statusActive' : 'secondary'}>{canOperate ? t('pages.conversations.readWrite') : t('pages.conversations.readOnly')}</Badge>
              </div>
            </div>
            <div className="relative mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {headlineCards.map((item) => (
                <div key={`${item.title}-${item.value}`} className={`rounded-xl border border-white/12 bg-gradient-to-br ${item.tone} p-3`}>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-white/55">{item.title}</p>
                  <p className="mt-1 text-2xl font-black leading-none text-white">{item.value}</p>
                </div>
              ))}
            </div>
            {!canOperate && (
              <p className="relative mt-3 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/70">
                {isAuthenticated ? t('pages.conversations.readOnlyHintAuthed') : t('pages.conversations.readOnlyHintGuest')}
              </p>
            )}
          </div>
        </Card>

        <div className="grid gap-4 xl:[--conversation-pane-h:clamp(38rem,calc(100dvh-11rem),70rem)] xl:items-start xl:gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(350px,0.92fr)] 2xl:gap-6 2xl:grid-cols-[minmax(0,1.36fr)_minmax(390px,0.88fr)]">
          <Card className="overflow-hidden border-white/15 bg-[#0f1521]/95 p-0 xl:flex xl:h-[var(--conversation-pane-h)] xl:min-h-0 xl:flex-col">
            <div className="border-b border-white/12 bg-white/[0.03] px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-white">{t('pages.conversations.timeline.title')}</h2>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs uppercase tracking-[0.08em] text-white/55">{t('pages.conversations.timeline.hint')}</span>
              </div>
            </div>

            <div
              className="max-h-[min(66vh,800px)] space-y-3 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 lg:px-5 xl:flex-1 xl:min-h-0 xl:max-h-none"
            >
              {isLoading && <p className="text-sm text-white/65">{t('pages.conversations.loadingDetail')}</p>}
              {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
              {!isLoading && !error && timeline.length === 0 && <p className="text-sm text-white/60">{t('pages.conversations.timeline.empty')}</p>}

              {!isLoading && !error && timeline.length > 0 && timeline.map((event) => {
                if (!isMessageEvent(event)) {
                  return (
                    <div key={event.id} className="px-1">
                      <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-white/58">
                          <span>{t(`pages.conversations.timeline.events.${event.event_type}`)}</span>
                          <span>{formatTime(event.occurred_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/72">
                          {event.price !== null && event.price !== undefined && (
                            <span>{t('pages.conversations.timeline.price', { value: formatPrice(event.price) })}</span>
                          )}
                          {event.amount !== null && event.amount !== undefined && (
                            <span>{t('pages.orders.amount', { value: formatPrice(event.amount) })}</span>
                          )}
                          {event.from_status && event.to_status && (
                            <span>{t('pages.conversations.timeline.orderTransition', { from: event.from_status, to: event.to_status })}</span>
                          )}
                          {event.note && (
                            <span>{t('pages.conversations.timeline.note', { value: event.note })}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                const alignRight = event.role === 'seller';
                const actorName = event.actor_name || (alignRight ? sellerName : buyerName);
                const actorInitial = actorName.slice(0, 1).toUpperCase();

                return (
                  <div key={event.id} className={`flex items-end gap-2 px-1 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                    {!alignRight && (
                      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-teal-300/35 bg-teal-500/16 text-xs font-bold text-teal-100">
                        {actorInitial}
                      </div>
                    )}

                    <div className={`w-fit max-w-[min(94%,80ch)] rounded-2xl border px-3.5 py-2.5 shadow-[0_14px_26px_rgba(0,0,0,0.32)] ${alignRight ? 'border-rose-300/35 bg-gradient-to-br from-rose-500/18 to-rose-500/8' : 'border-teal-300/28 bg-gradient-to-br from-teal-500/14 to-teal-500/6'}`}>
                      <div className="flex items-center gap-2 text-[11px] text-white/60">
                        <span>{actorName}</span>
                        <span>•</span>
                        <span>{formatTime(event.occurred_at)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-white">{event.content || t('pages.conversations.timeline.emptyContent')}</p>
                    </div>

                    {alignRight && (
                      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/35 bg-rose-500/20 text-xs font-bold text-rose-100">
                        {actorInitial}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-4 xl:sticky xl:top-[5.5rem] xl:h-[var(--conversation-pane-h)] xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <Card className="border-white/15 bg-[#111827]/95 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-market-300" />
                <h3 className="text-lg font-semibold">{t('pages.conversations.insights.title')}</h3>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
                {summaryMetrics.map((metric, idx) => (
                  <div key={`${metric.label}-${idx}`} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-white/85">
                    {metric.label}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-white/15 bg-[#111827]/95 p-5">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal-300" />
                <h3 className="text-lg font-semibold">{t('pages.conversations.actionsTitle')}</h3>
              </div>

              {canOperate ? (
                <div className="space-y-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t('pages.conversations.messagePlaceholder')} />
                    <Button onClick={sendMessage} variant="marketPrimary" className="sm:w-auto">{t('actions.send')}</Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={offerPrice} onChange={(event) => setOfferPrice(event.target.value)} placeholder={t('pages.conversations.offerPlaceholder')} />
                    <Button onClick={sendOffer} variant="marketPrimary" className="sm:w-auto">{t('actions.sendOffer')}</Button>
                  </div>

                  {orderId && orderActions.length > 0 && (
                    <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-white/55">{t('pages.conversations.softGate.title')}</p>
                      <Input value={actionMessage} onChange={(event) => setActionMessage(event.target.value)} placeholder={t('pages.conversations.softGate.placeholder')} />
                      <Input value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder={t('pages.orders.actionReasonPlaceholder')} />
                      <div className="flex flex-wrap gap-2">
                        {orderActions.map((action) => (
                          <Button
                            key={action.key}
                            size="sm"
                            variant={action.danger ? 'secondary' : 'marketGhost'}
                            disabled={actionComposer.isRunning}
                            onClick={() => executeOrderAction(action)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <LocalizedLink href={`/auth/login?next=${encodeURIComponent(`/${locale}/conversations/${id}`)}`}>
                  <Button className="w-full" variant="marketGhost">{t('actions.loginToContinue')}</Button>
                </LocalizedLink>
              )}

              {(softGateTip || actionComposer.lastHint) && <p className="mt-2 text-xs text-amber-300">{softGateTip || actionComposer.lastHint}</p>}
              {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}

              <div className="mt-3 max-h-[min(30vh,260px)] space-y-2 overflow-y-auto pr-1">
                {(data?.offers || []).map((offer: any) => (
                  <div key={offer.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{t('pages.conversations.price', { value: formatPrice(offer.price) })}</span>
                      <Badge variant={offer.status === 'ACCEPTED' ? 'statusActive' : 'secondary'}>{offer.status}</Badge>
                    </div>
                    {canOperate && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {offer.status === 'PENDING' && (
                          <>
                            <Button size="sm" variant="marketPrimary" onClick={() => runAction(async () => { await api.acceptOffer(offer.id); })}>{t('actions.accept')}</Button>
                            <Button size="sm" variant="secondary" onClick={() => runAction(async () => { await api.rejectOffer(offer.id); })}>{t('actions.reject')}</Button>
                          </>
                        )}
                        {offer.status === 'ACCEPTED' && (
                          <Button size="sm" variant="marketGhost" onClick={() => createOrderFromOffer(offer.id)}>{t('actions.createOrderFromOffer')}</Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-white/15 bg-[#111827]/95 p-5">
              <h3 className="text-lg font-semibold">{t('pages.conversations.insights.offerLadderTitle')}</h3>
              {ladder.length === 0 && <p className="mt-2 text-sm text-white/58">{t('pages.conversations.insights.offerLadderEmpty')}</p>}
              <div className="mt-3 space-y-2">
                {ladder.map((event, index) => (
                  <div key={event.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-white/85">
                      <span>{t('pages.conversations.insights.offerRound', { value: index + 1 })}</span>
                      <span className="font-semibold">{formatPrice(event.price)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-market-500 to-teal-300" style={{ width: `${Math.min(100, 24 + index * 16)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {canOperate && stalledForConversation.length > 0 && (
              <Card className="border-amber-400/35 bg-amber-500/10 p-5">
                <div className="mb-2 flex items-center gap-2 text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <h3 className="font-semibold">{t('pages.conversations.nudge.title')}</h3>
                </div>
                <div className="space-y-2">
                  {stalledForConversation
                    .slice(0, 4)
                    .map((task) => (
                      <div key={`${task.task_type}-${task.entity_id}`} className="rounded-xl border border-amber-300/35 bg-black/25 p-3 text-sm">
                        <p className="text-white/90">{task.suggested_message}</p>
                        <p className="mt-1 text-xs text-white/65">{t('pages.conversations.nudge.meta', { task: task.task_type, age: task.age_sec, sla: task.sla_sec })}</p>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            {data?.order?.id && (
              <LocalizedLink href={`/orders/${data.order.id}`}>
                <Button className="w-full" variant="marketGhost">
                  {t('pages.conversations.viewLinkedOrder')}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </LocalizedLink>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
