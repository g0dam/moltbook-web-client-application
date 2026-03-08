const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { messageLimiter, offerLimiter, conversationLimiter } = require('../middleware/rateLimit');
const { success, created } = require('../utils/response');
const { parseInteger, parseEnum, parseText, parseNumber } = require('../utils/validators');
const ConversationService = require('../services/ConversationService');
const OfferService = require('../services/OfferService');

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const conversations = await ConversationService.listMine(req.agent.id);
  success(res, { conversations });
}));

router.get('/public-stream', optionalAuth, asyncHandler(async (req, res) => {
  const status = parseEnum(req.query.status || 'ALL', ['ALL', 'OPEN', 'NEGOTIATING', 'RETURNING', 'COMPLETED'], {
    field: 'status',
    normalize: 'upper'
  });
  const listingType = parseEnum(req.query.listing_type || 'ALL', ['ALL', 'SELL', 'WANTED'], {
    field: 'listing_type',
    normalize: 'upper'
  });
  const conversations = await ConversationService.listPublicStream({
    status,
    listingType,
    limit: parseInteger(req.query.limit, { field: 'limit', min: 1, max: 100, defaultValue: 30 }),
    offset: parseInteger(req.query.offset, { field: 'offset', min: 0, max: 100000, defaultValue: 0 })
  });
  success(res, { conversations });
}));

router.post('/listing/:listingId', requireAuth, conversationLimiter, asyncHandler(async (req, res) => {
  const conversation = await ConversationService.create({
    listingId: req.params.listingId,
    buyerId: req.agent.id
  });
  created(res, { conversation });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await ConversationService.findById(req.params.id, req.agent.id);
  const messages = await ConversationService.getMessages(req.params.id, req.agent.id);
  const offers = await OfferService.listByConversation(req.params.id, req.agent.id);
  success(res, { conversation, messages, offers });
}));

router.get('/:id/public', optionalAuth, asyncHandler(async (req, res) => {
  const view = await ConversationService.getPublicView(req.params.id, req.agent?.id || null);
  success(res, view);
}));

router.post('/:id/messages', requireAuth, messageLimiter, asyncHandler(async (req, res) => {
  const { content, reason_code, metadata } = req.body;
  const message = await ConversationService.addMessage({
    conversationId: req.params.id,
    senderId: req.agent.id,
    content: parseText(content, { field: 'content', required: true, maxLength: 2000 }),
    reasonCode: parseText(reason_code, { field: 'reason_code', required: false, maxLength: 40 }) || null,
    metadata: metadata || {}
  });
  created(res, { message });
}));

router.post('/:id/offers', requireAuth, offerLimiter, asyncHandler(async (req, res) => {
  const { price, expires_in_minutes, reason_code } = req.body;
  const result = await OfferService.create({
    conversationId: req.params.id,
    actorId: req.agent.id,
    price: parseNumber(price, { field: 'price', min: 0.01, max: 100000000 }),
    expiresInMinutes: parseInteger(expires_in_minutes, { field: 'expires_in_minutes', min: 1, max: 1440, defaultValue: 30 }),
    reasonCode: parseText(reason_code, { field: 'reason_code', required: false, maxLength: 40 }) || null
  });
  created(res, result);
}));

router.post('/offers/:offerId/accept', requireAuth, asyncHandler(async (req, res) => {
  const offer = await OfferService.decide({
    offerId: req.params.offerId,
    actorId: req.agent.id,
    decision: 'accept'
  });
  success(res, { offer });
}));

router.post('/offers/:offerId/reject', requireAuth, asyncHandler(async (req, res) => {
  const offer = await OfferService.decide({
    offerId: req.params.offerId,
    actorId: req.agent.id,
    decision: 'reject'
  });
  success(res, { offer });
}));

router.post('/offers/:offerId/counter', requireAuth, asyncHandler(async (req, res) => {
  const { price } = req.body;
  const offer = await OfferService.decide({
    offerId: req.params.offerId,
    actorId: req.agent.id,
    decision: 'counter',
    counterPrice: parseNumber(price, { field: 'price', min: 0.01, max: 100000000 })
  });
  success(res, offer);
}));

module.exports = router;
