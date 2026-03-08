const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { eventLimiter } = require('../middleware/rateLimit');
const { success, created } = require('../utils/response');
const { BadRequestError } = require('../utils/errors');
const EventLogService = require('../services/EventLogService');

const router = Router();

const ALLOWED_EVENT_TYPES = new Set([
  'LISTING_IMPRESSION',
  'LISTING_CLICK',
  'LISTING_DETAIL_VIEW',
  'LISTING_EDITED',
  'LISTING_HEALTH_ALERT',
  'LISTING_OPTIMIZATION_SUGGESTED',
  'HEARTBEAT_PULL',
  'PROFILE_VIEW',
  'PUBLIC_CONVERSATION_VIEW',
  'CONVERSATION_TIMELINE_VIEW',
  'ORDER_DETAIL_VIEW',
  'FOLLOW_CLICK',
  'SEARCH_SUBMIT',
  'FILTER_APPLY',
  'MESSAGE_SENT',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'OFFER_COUNTERED',
  'ORDER_CREATED',
  'ORDER_PAID_IN_ESCROW',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_CONFIRMED',
  'ORDER_COMPLETED',
  'ORDER_RETURN_REQUESTED',
  'ORDER_RETURN_APPROVED',
  'ORDER_RETURN_REJECTED',
  'ORDER_RETURN_SHIPPED_BACK',
  'ORDER_RETURN_RECEIVED_BACK',
  'ORDER_REFUNDED',
  'ORDER_NUDGE_SENT',
  'ORDER_ACTION_OVERDUE',
  'REVIEW_CREATED'
]);

router.post('/track', optionalAuth, eventLimiter, asyncHandler(async (req, res) => {
  const {
    event_type,
    target_type,
    target_id,
    session_id,
    locale,
    page,
    source,
    payload = {}
  } = req.body || {};

  if (!event_type || !ALLOWED_EVENT_TYPES.has(String(event_type))) {
    throw new BadRequestError('Unsupported event_type');
  }

  const event = await EventLogService.trackEvent({
    eventType: String(event_type),
    actorId: req.agent?.id || null,
    targetType: target_type || null,
    targetId: target_id || null,
    sessionId: session_id || null,
    locale: locale || null,
    page: page || null,
    source: source || null,
    payload
  });

  created(res, { event });
}));

router.get('/export', optionalAuth, asyncHandler(async (req, res) => {
  const events = await EventLogService.exportEvents({
    eventType: req.query.event_type || null,
    eventTypes: req.query.event_types || null,
    from: req.query.from || null,
    to: req.query.to || null,
    limit: parseInt(req.query.limit, 10) || 1000,
    agentName: req.query.agent_name || null,
    listingId: req.query.listing_id || null
  });
  success(res, { events });
}));

module.exports = router;
