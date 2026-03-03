import type { Order, OrderStatus } from '@/types';

export type OrderActorRole = 'buyer' | 'seller' | 'observer';

export type OrderActionKey =
  | 'pay'
  | 'ship'
  | 'deliver'
  | 'confirm'
  | 'complete'
  | 'requestReturn'
  | 'approveReturn'
  | 'rejectReturn'
  | 'shipBackReturn'
  | 'receiveReturnedItem'
  | 'refund'
  | 'dispute';

const ACTION_LABEL_KEY: Record<OrderActionKey, string> = {
  pay: 'actions.pay',
  ship: 'actions.ship',
  deliver: 'actions.deliver',
  confirm: 'actions.confirm',
  complete: 'actions.completeOrder',
  requestReturn: 'actions.requestReturn',
  approveReturn: 'actions.approveReturn',
  rejectReturn: 'actions.rejectReturnAction',
  shipBackReturn: 'actions.shipBackReturn',
  receiveReturnedItem: 'actions.receiveReturnedItem',
  refund: 'actions.refundOrder',
  dispute: 'actions.openDispute',
};

function asText(value: unknown): string {
  return String(value || '').trim();
}

export function getOrderActorRole(order: Order, agentId?: string | null): OrderActorRole {
  const me = asText(agentId);
  if (!me) return 'observer';

  const buyerId = asText(order.buyer_id || order.buyerId);
  const sellerId = asText(order.seller_id || order.sellerId);

  if (me && me === buyerId) return 'buyer';
  if (me && me === sellerId) return 'seller';
  return 'observer';
}

export function normalizeOrderStatus(status?: string | null): OrderStatus | 'UNKNOWN' {
  const normalized = asText(status).toUpperCase();
  const known = new Set([
    'NEGOTIATING',
    'OFFER_ACCEPTED',
    'PAID_IN_ESCROW',
    'SHIPPED',
    'DELIVERED',
    'CONFIRMED',
    'RETURN_REQUESTED',
    'RETURN_APPROVED',
    'RETURN_REJECTED',
    'RETURN_SHIPPED_BACK',
    'RETURN_RECEIVED_BACK',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
    'REFUNDED',
  ]);
  return known.has(normalized) ? (normalized as OrderStatus) : 'UNKNOWN';
}

export function getAvailableOrderActions(order: Order, agentId?: string | null): OrderActionKey[] {
  const role = getOrderActorRole(order, agentId);
  const status = normalizeOrderStatus(order.status);
  if (role === 'observer') return [];

  const actions: OrderActionKey[] = [];
  const push = (...items: OrderActionKey[]) => {
    items.forEach((item) => {
      if (!actions.includes(item)) actions.push(item);
    });
  };

  if (status === 'OFFER_ACCEPTED' && role === 'buyer') push('pay');
  if (status === 'PAID_IN_ESCROW' && role === 'seller') push('ship');
  if (status === 'SHIPPED' && role === 'seller') push('deliver');
  if (status === 'DELIVERED' && role === 'buyer') push('confirm');
  if (status === 'CONFIRMED' && role === 'buyer') push('complete', 'requestReturn');
  if (status === 'RETURN_REQUESTED' && role === 'seller') push('approveReturn', 'rejectReturn');
  if (status === 'RETURN_APPROVED' && role === 'buyer') push('shipBackReturn');
  if (status === 'RETURN_REJECTED' && role === 'buyer') push('confirm');
  if (status === 'RETURN_SHIPPED_BACK' && role === 'seller') push('receiveReturnedItem');
  if (status === 'RETURN_RECEIVED_BACK' && role === 'seller') push('refund');
  if (status === 'DISPUTED' && role === 'buyer') push('complete');
  if (status === 'DISPUTED' && role === 'seller') push('refund');

  if (
    ['PAID_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK'].includes(status)
  ) {
    push('dispute');
  }

  return actions;
}

export function getOrderActionLabelKey(action: OrderActionKey): string {
  return ACTION_LABEL_KEY[action];
}
