const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { parseInteger, parseEnum, parseText } = require('../utils/validators');
const OrderService = require('../services/OrderService');
const { OrderStatus } = require('../domain/marketStates');
const EventLogService = require('../services/EventLogService');

const router = Router();

function extractConversationActionOptions(body = {}) {
  return {
    conversationMessage: parseText(body.conversation_message, {
      field: 'conversation_message',
      required: false,
      maxLength: 2000
    }) || null,
    conversationReasonCode: parseText(body.conversation_reason_code, {
      field: 'conversation_reason_code',
      required: false,
      maxLength: 40
    }) || null
  };
}

function sendOrder(res, order) {
  if (order?.soft_hint) {
    success(res, { order, hint: order.soft_hint });
    return;
  }
  success(res, { order });
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const orders = await OrderService.listMine(req.agent.id);
  success(res, { orders });
}));

router.get('/public', optionalAuth, asyncHandler(async (req, res) => {
  const role = parseEnum(req.query.role || 'all', ['buyer', 'seller', 'all'], {
    field: 'role',
    normalize: 'lower'
  });
  const status = parseEnum(req.query.status || 'COMPLETED', [
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
    'ALL'
  ], {
    field: 'status',
    normalize: 'upper'
  });

  const orders = await OrderService.listPublic({
    status,
    role,
    agentId: req.query.agent_id || null,
    limit: parseInteger(req.query.limit, { field: 'limit', min: 1, max: 100, defaultValue: 20 }),
    offset: parseInteger(req.query.offset, { field: 'offset', min: 0, max: 100000, defaultValue: 0 })
  });
  success(res, { orders });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { offer_id } = req.body;
  const order = await OrderService.createFromAcceptedOffer({ offerId: offer_id, buyerId: req.agent.id });
  created(res, { order });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.findReadable(req.params.id, req.agent?.id || null);
  await EventLogService.log({
    eventType: 'ORDER_DETAIL_VIEW',
    actorId: req.agent?.id || null,
    targetType: 'order',
    targetId: req.params.id,
    payload: { status: order.status }
  });
  success(res, { order });
}));

router.post('/:id/pay', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.PAID_IN_ESCROW,
    'buyer_paid',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

router.post('/:id/ship', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.SHIPPED,
    'seller_shipped',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

router.post('/:id/deliver', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.DELIVERED,
    'seller_delivered',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

router.post('/:id/confirm', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.CONFIRMED,
    'buyer_confirmed',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

router.post('/:id/complete', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.complete(req.params.id, req.agent.id, extractConversationActionOptions(req.body || {}));
  sendOrder(res, order);
}));

router.post('/:id/return/request', requireAuth, asyncHandler(async (req, res) => {
  const { reason_code, detail, conversation_message, conversation_reason_code } = req.body || {};
  const order = await OrderService.requestReturn(req.params.id, req.agent.id, {
    reasonCode: parseText(reason_code, { field: 'reason_code', maxLength: 40, required: false }) || null,
    detail: parseText(detail, { field: 'detail', maxLength: 500, required: false }) || null,
    conversationMessage: parseText(conversation_message, { field: 'conversation_message', maxLength: 2000, required: false }) || null,
    conversationReasonCode: parseText(conversation_reason_code, { field: 'conversation_reason_code', maxLength: 40, required: false }) || null
  });
  sendOrder(res, order);
}));

router.post('/:id/return/approve', requireAuth, asyncHandler(async (req, res) => {
  const { reason, conversation_message, conversation_reason_code } = req.body || {};
  const order = await OrderService.approveReturn(req.params.id, req.agent.id, {
    reason: parseText(reason, { field: 'reason', maxLength: 500, required: false }) || null,
    conversationMessage: parseText(conversation_message, { field: 'conversation_message', maxLength: 2000, required: false }) || null,
    conversationReasonCode: parseText(conversation_reason_code, { field: 'conversation_reason_code', maxLength: 40, required: false }) || null
  });
  sendOrder(res, order);
}));

router.post('/:id/return/reject', requireAuth, asyncHandler(async (req, res) => {
  const { reason, conversation_message, conversation_reason_code } = req.body || {};
  const order = await OrderService.rejectReturn(req.params.id, req.agent.id, {
    reason: parseText(reason, { field: 'reason', maxLength: 500, required: false }) || null,
    conversationMessage: parseText(conversation_message, { field: 'conversation_message', maxLength: 2000, required: false }) || null,
    conversationReasonCode: parseText(conversation_reason_code, { field: 'conversation_reason_code', maxLength: 40, required: false }) || null
  });
  sendOrder(res, order);
}));

router.post('/:id/return/ship_back', requireAuth, asyncHandler(async (req, res) => {
  const { detail, conversation_message, conversation_reason_code } = req.body || {};
  const order = await OrderService.shipBackReturn(req.params.id, req.agent.id, {
    detail: parseText(detail, { field: 'detail', maxLength: 500, required: false }) || null,
    conversationMessage: parseText(conversation_message, { field: 'conversation_message', maxLength: 2000, required: false }) || null,
    conversationReasonCode: parseText(conversation_reason_code, { field: 'conversation_reason_code', maxLength: 40, required: false }) || null
  });
  sendOrder(res, order);
}));

router.post('/:id/return/receive_back', requireAuth, asyncHandler(async (req, res) => {
  const { detail, conversation_message, conversation_reason_code } = req.body || {};
  const order = await OrderService.receiveReturnedItem(req.params.id, req.agent.id, {
    detail: parseText(detail, { field: 'detail', maxLength: 500, required: false }) || null,
    conversationMessage: parseText(conversation_message, { field: 'conversation_message', maxLength: 2000, required: false }) || null,
    conversationReasonCode: parseText(conversation_reason_code, { field: 'conversation_reason_code', maxLength: 40, required: false }) || null
  });
  sendOrder(res, order);
}));

router.post('/:id/dispute', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.DISPUTED,
    'dispute_opened',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

router.post('/:id/refund', requireAuth, asyncHandler(async (req, res) => {
  const order = await OrderService.transition(
    req.params.id,
    req.agent.id,
    OrderStatus.REFUNDED,
    'refund_processed',
    extractConversationActionOptions(req.body || {})
  );
  sendOrder(res, order);
}));

module.exports = router;
