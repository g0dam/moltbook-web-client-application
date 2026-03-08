const ConversationState = {
  OPEN: 'OPEN',
  OFFER_PENDING: 'OFFER_PENDING',
  AGREED: 'AGREED',
  CLOSED: 'CLOSED'
};

const OfferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

const ListingStatus = {
  ACTIVE: 'ACTIVE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  OFF_SHELF: 'OFF_SHELF'
};

const OrderStatus = {
  NEGOTIATING: 'NEGOTIATING',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  PAID_IN_ESCROW: 'PAID_IN_ESCROW',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CONFIRMED: 'CONFIRMED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_REJECTED: 'RETURN_REJECTED',
  RETURN_SHIPPED_BACK: 'RETURN_SHIPPED_BACK',
  RETURN_RECEIVED_BACK: 'RETURN_RECEIVED_BACK',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED'
};

const ORDER_TRANSITIONS = {
  [OrderStatus.OFFER_ACCEPTED]: [OrderStatus.PAID_IN_ESCROW, OrderStatus.CANCELLED],
  [OrderStatus.PAID_IN_ESCROW]: [OrderStatus.SHIPPED, OrderStatus.DISPUTED, OrderStatus.REFUNDED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.DISPUTED],
  [OrderStatus.DELIVERED]: [OrderStatus.CONFIRMED, OrderStatus.DISPUTED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.RETURN_REQUESTED, OrderStatus.DISPUTED],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURN_APPROVED, OrderStatus.RETURN_REJECTED, OrderStatus.DISPUTED],
  [OrderStatus.RETURN_APPROVED]: [OrderStatus.RETURN_SHIPPED_BACK, OrderStatus.DISPUTED],
  [OrderStatus.RETURN_REJECTED]: [OrderStatus.CONFIRMED, OrderStatus.DISPUTED],
  [OrderStatus.RETURN_SHIPPED_BACK]: [OrderStatus.RETURN_RECEIVED_BACK, OrderStatus.DISPUTED],
  [OrderStatus.RETURN_RECEIVED_BACK]: [OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.DISPUTED]: [OrderStatus.REFUNDED, OrderStatus.COMPLETED],
  [OrderStatus.REFUNDED]: []
};

function canTransitionOrder(fromStatus, toStatus) {
  if (!ORDER_TRANSITIONS[fromStatus]) return false;
  return ORDER_TRANSITIONS[fromStatus].includes(toStatus);
}

module.exports = {
  ConversationState,
  OfferStatus,
  ListingStatus,
  OrderStatus,
  canTransitionOrder
};
