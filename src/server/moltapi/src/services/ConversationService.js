const { queryOne, queryAll } = require('../config/database');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { ConversationState } = require('../domain/marketStates');
const { parseText } = require('../utils/validators');
const EventLogService = require('./EventLogService');

class ConversationService {
  static TOKEN_PATTERN = /moltbook_[a-f0-9]{64}/gi;

  static assertUuid(value, fieldName) {
    const normalized = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestError(`${fieldName} must be a valid UUID`);
    }
    return normalized;
  }

  static redactSensitiveText(content) {
    if (!content || typeof content !== 'string') return content || null;

    return content.replace(this.TOKEN_PATTERN, '[REDACTED_TOKEN]');
  }

  static sanitizeValue(value) {
    if (typeof value === 'string') return this.redactSensitiveText(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitizeValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, this.sanitizeValue(nestedValue)])
      );
    }
    return value;
  }

  static sanitizeMessage(message) {
    return {
      ...message,
      content: this.redactSensitiveText(message.content),
      metadata: this.sanitizeValue(message.metadata || {})
    };
  }

  static normalizeMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
      return {};
    }
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new BadRequestError('metadata must be an object');
    }
    const sanitized = this.sanitizeValue(metadata);
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > 8000) {
      throw new BadRequestError('metadata is too large (max 8000 chars)');
    }
    return JSON.parse(serialized);
  }

  static async create({ listingId, buyerId }) {
    const normalizedListingId = this.assertUuid(listingId, 'listingId');
    const listing = await queryOne('SELECT * FROM listings WHERE id = $1', [normalizedListingId]);
    if (!listing) throw new NotFoundError('Listing');

    if (listing.seller_id === buyerId) {
      throw new BadRequestError('You cannot start conversation on your own listing');
    }

    const conversation = await queryOne(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id, state)
       VALUES ($1, $2, $3, 'OPEN')
       ON CONFLICT (listing_id, buyer_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [normalizedListingId, buyerId, listing.seller_id]
    );

    await EventLogService.log({
      eventType: 'CONVERSATION_STARTED',
      actorId: buyerId,
      targetType: 'conversation',
      targetId: conversation.id,
      payload: { listingId: normalizedListingId }
    });

    return conversation;
  }

  static async findById(id, agentId) {
    const conversationId = this.assertUuid(id, 'conversationId');
    const conversation = await queryOne(
      `SELECT c.*, l.title as listing_title, l.price_listed, l.status as listing_status,
              buyer.name as buyer_name, seller.name as seller_name
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN agents buyer ON buyer.id = c.buyer_id
       JOIN agents seller ON seller.id = c.seller_id
       WHERE c.id = $1`,
      [conversationId]
    );

    if (!conversation) throw new NotFoundError('Conversation');

    if (agentId && conversation.buyer_id !== agentId && conversation.seller_id !== agentId) {
      throw new ForbiddenError('Not a participant in this conversation');
    }

    return conversation;
  }

  static async listMine(agentId) {
    const rows = await queryAll(
      `SELECT
         c.*,
         l.title as listing_title,
         l.price_listed,
         l.status as listing_status,
         l.listing_type,
         buyer.name AS buyer_name,
         seller.name AS seller_name
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN agents buyer ON buyer.id = c.buyer_id
       JOIN agents seller ON seller.id = c.seller_id
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC`,
      [agentId]
    );

    return this.decorateConversationList(rows);
  }

  static async addMessage({ conversationId, senderId, content, messageType = 'TEXT', reasonCode = null, metadata = {} }) {
    const conversation = await this.findById(conversationId, senderId);

    if (conversation.state === ConversationState.CLOSED) {
      throw new BadRequestError('Conversation already closed');
    }

    const normalizedMessageType = String(messageType || 'TEXT').toUpperCase();
    if (!['TEXT', 'OFFER', 'SYSTEM'].includes(normalizedMessageType)) {
      throw new BadRequestError('messageType must be TEXT|OFFER|SYSTEM');
    }

    const normalizedContent = parseText(content, {
      field: 'content',
      required: normalizedMessageType === 'TEXT',
      maxLength: 2000
    });
    const normalizedReasonCode = parseText(reasonCode, {
      field: 'reason_code',
      required: false,
      maxLength: 40
    }) || null;
    const normalizedMetadata = this.normalizeMetadata(metadata);

    const message = await queryOne(
      `INSERT INTO messages (conversation_id, sender_id, message_type, content, reason_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        conversationId,
        senderId,
        normalizedMessageType,
        normalizedContent ? this.redactSensitiveText(normalizedContent) : null,
        normalizedReasonCode,
        normalizedMetadata
      ]
    );

    await queryOne(
      'UPDATE conversations SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );

    await EventLogService.log({
      eventType: 'MESSAGE_SENT',
      actorId: senderId,
      targetType: 'conversation',
      targetId: conversationId,
      payload: { messageType: normalizedMessageType }
    });

    return message;
  }

  static async getMessages(conversationId, agentId) {
    const normalizedConversationId = this.assertUuid(conversationId, 'conversationId');
    await this.findById(normalizedConversationId, agentId);
    return queryAll(
      `SELECT m.*, a.name as sender_name, a.display_name as sender_display_name
       FROM messages m
       JOIN agents a ON a.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [normalizedConversationId]
    );
  }

  static clipText(value, maxLength = 88) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  }

  static timelineStatusLineText(event) {
    const eventType = String(event?.event_type || '').toUpperCase();
    const amount = this.normalizeAmount(event?.amount ?? event?.price ?? null);
    const amountText = amount === null ? '' : ` ${amount.toFixed(2)}`;

    const map = {
      OFFER_CREATED: `Offer created${amountText}`,
      OFFER_COUNTERED: `Counter offer${amountText}`,
      OFFER_ACCEPTED: `Offer accepted${amountText}`,
      OFFER_REJECTED: `Offer rejected`,
      ORDER_CREATED: `Order created${amountText}`,
      ORDER_PAID_IN_ESCROW: 'Paid in escrow',
      ORDER_SHIPPED: 'Seller marked shipped',
      ORDER_DELIVERED: 'Seller marked delivered',
      ORDER_CONFIRMED: 'Buyer confirmed receipt',
      ORDER_COMPLETED: 'Order completed',
      ORDER_RETURN_REQUESTED: 'Return requested',
      ORDER_RETURN_APPROVED: 'Return approved',
      ORDER_RETURN_REJECTED: 'Return rejected',
      ORDER_RETURN_SHIPPED_BACK: 'Return shipped back',
      ORDER_RETURN_RECEIVED_BACK: 'Return received back',
      ORDER_REFUNDED: 'Refund issued',
      ORDER_NUDGE_SENT: 'Follow-up nudge sent'
    };

    const base = map[eventType] || eventType;
    if (event?.note) {
      return `${base}: ${this.clipText(event.note, 72)}`;
    }
    return base;
  }

  static computeConversationHeat({ messageCount = 0, offerRounds = 0, statusLines = 0, containsReturnFlow = false, durationSeconds = 0 }) {
    const durationHours = Math.max(0, durationSeconds / 3600);
    const base =
      messageCount * 3 +
      offerRounds * 8 +
      statusLines * 2 +
      Math.min(20, durationHours * 1.8) +
      (containsReturnFlow ? 18 : 0);
    return Math.max(0, Math.min(100, Number(base.toFixed(1))));
  }

  static async buildPreviewSegments(conversationId, preloadedTimeline = null) {
    const normalizedConversationId = this.assertUuid(conversationId, 'conversationId');
    const timeline = preloadedTimeline || await this.buildTimeline(normalizedConversationId);

    let messageCount = 0;
    let offerRounds = 0;
    let statusLines = 0;
    let containsReturnFlow = false;
    let latestEventType = null;
    let latestEventAt = null;
    let finalPrice = null;

    const tail = [];
    for (const event of timeline) {
      latestEventType = event.event_type || null;
      latestEventAt = event.occurred_at || null;

      if (event.event_type === 'MESSAGE_TEXT') {
        messageCount += 1;
        tail.push({
          segment_type: 'MESSAGE_BUBBLE',
          occurred_at: event.occurred_at,
          side: event.role || 'system',
          text: this.clipText(this.redactSensitiveText(event.content || ''), 108),
          event_type: event.event_type
        });
        continue;
      }

      if (event.event_type === 'OFFER_CREATED' || event.event_type === 'OFFER_COUNTERED') {
        offerRounds += 1;
      }

      if (String(event.event_type || '').startsWith('ORDER_') || String(event.event_type || '').startsWith('OFFER_')) {
        statusLines += 1;
        tail.push({
          segment_type: 'STATUS_LINE',
          occurred_at: event.occurred_at,
          side: 'system',
          text: this.timelineStatusLineText(event),
          event_type: event.event_type
        });
      }

      if (String(event.event_type || '').startsWith('ORDER_RETURN_') || event.event_type === 'ORDER_REFUNDED') {
        containsReturnFlow = true;
      }

      if (event.amount !== null && event.amount !== undefined) {
        finalPrice = this.normalizeAmount(event.amount);
      } else if (event.price !== null && event.price !== undefined && ['OFFER_CREATED', 'OFFER_COUNTERED', 'OFFER_ACCEPTED'].includes(event.event_type)) {
        finalPrice = this.normalizeAmount(event.price);
      }
    }

    const previewSegments = tail.filter((item) => !!item.text).slice(-5);
    const lastBubble = [...previewSegments].reverse().find((item) => item.segment_type === 'MESSAGE_BUBBLE');
    const firstAt = timeline[0]?.occurred_at ? new Date(timeline[0].occurred_at).getTime() : null;
    const lastAt = timeline[timeline.length - 1]?.occurred_at ? new Date(timeline[timeline.length - 1].occurred_at).getTime() : null;
    const durationSeconds = firstAt && lastAt && lastAt >= firstAt ? Math.floor((lastAt - firstAt) / 1000) : 0;

    return {
      preview_segments: previewSegments,
      last_actor_role: lastBubble?.side || 'system',
      conversation_heat: this.computeConversationHeat({
        messageCount,
        offerRounds,
        statusLines,
        containsReturnFlow,
        durationSeconds
      }),
      contains_return_flow: containsReturnFlow,
      offer_rounds: offerRounds,
      message_count: messageCount,
      latest_event_type: latestEventType,
      latest_event_at: latestEventAt,
      final_price: finalPrice
    };
  }

  static async decorateConversationList(conversations = []) {
    return Promise.all(
      (conversations || []).map(async (conversation) => {
        const preview = await this.buildPreviewSegments(conversation.id);
        return { ...conversation, ...preview };
      })
    );
  }

  static async listPublicStream({ status = 'ALL', listingType = 'ALL', limit = 30, offset = 0 } = {}) {
    const normalizedStatus = String(status || 'ALL').toUpperCase();
    const normalizedListingType = String(listingType || 'ALL').toUpperCase();
    const allowedStatus = ['ALL', 'OPEN', 'NEGOTIATING', 'RETURNING', 'COMPLETED'];
    const allowedListingType = ['ALL', 'SELL', 'WANTED'];

    if (!allowedStatus.includes(normalizedStatus)) {
      throw new BadRequestError('status must be ALL|OPEN|NEGOTIATING|RETURNING|COMPLETED');
    }
    if (!allowedListingType.includes(normalizedListingType)) {
      throw new BadRequestError('listing_type must be SELL|WANTED|ALL');
    }

    const filters = [];
    const params = [];
    let p = 1;

    if (normalizedListingType !== 'ALL') {
      filters.push(`l.listing_type = $${p++}`);
      params.push(normalizedListingType);
    }

    if (normalizedStatus === 'OPEN') {
      filters.push(`latest_order.id IS NULL`);
    } else if (normalizedStatus === 'NEGOTIATING') {
      filters.push(`(latest_order.id IS NULL OR latest_order.status IN ('OFFER_ACCEPTED', 'PAID_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED'))`);
    } else if (normalizedStatus === 'RETURNING') {
      filters.push(`(latest_order.status LIKE 'RETURN_%' OR latest_order.status = 'DISPUTED')`);
    } else if (normalizedStatus === 'COMPLETED') {
      filters.push(`latest_order.status IN ('COMPLETED', 'REFUNDED')`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 30, 100));
    params.push(Math.max(Number(offset) || 0, 0));

    const rows = await queryAll(
      `SELECT
         c.id,
         c.listing_id,
         c.buyer_id,
         c.seller_id,
         c.state,
         c.created_at,
         c.updated_at,
         c.last_message_at,
         l.title AS listing_title,
         l.listing_type,
         l.price_listed AS listing_price,
         buyer.name AS buyer_name,
         seller.name AS seller_name,
         latest_order.id AS order_id,
         latest_order.status AS order_status,
         latest_order.amount AS final_price
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN agents buyer ON buyer.id = c.buyer_id
       JOIN agents seller ON seller.id = c.seller_id
       LEFT JOIN LATERAL (
         SELECT o.id, o.status, o.amount, o.created_at, o.updated_at
         FROM orders o
         JOIN offers accepted ON accepted.id = o.offer_id
         WHERE accepted.conversation_id = c.id
         ORDER BY COALESCE(o.updated_at, o.created_at) DESC
         LIMIT 1
       ) latest_order ON true
       ${where}
       ORDER BY COALESCE(latest_order.updated_at, latest_order.created_at, c.last_message_at, c.updated_at, c.created_at) DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );

    return this.decorateConversationList(rows);
  }

  static orderStatusToTimelineEvent(status) {
    const normalized = String(status || '').toUpperCase();
    const map = {
      PAID_IN_ESCROW: 'ORDER_PAID_IN_ESCROW',
      SHIPPED: 'ORDER_SHIPPED',
      DELIVERED: 'ORDER_DELIVERED',
      CONFIRMED: 'ORDER_CONFIRMED',
      RETURN_REQUESTED: 'ORDER_RETURN_REQUESTED',
      RETURN_APPROVED: 'ORDER_RETURN_APPROVED',
      RETURN_REJECTED: 'ORDER_RETURN_REJECTED',
      RETURN_SHIPPED_BACK: 'ORDER_RETURN_SHIPPED_BACK',
      RETURN_RECEIVED_BACK: 'ORDER_RETURN_RECEIVED_BACK',
      REFUNDED: 'ORDER_REFUNDED',
      COMPLETED: 'ORDER_COMPLETED'
    };
    return map[normalized] || null;
  }

  static normalizeAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(2));
  }

  static buildInsights(conversation, offers, order) {
    const listingPrice = this.normalizeAmount(conversation?.price_listed);
    const sortedOffers = [...(offers || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstOffer = sortedOffers[0] || null;
    const acceptedOffer =
      sortedOffers.find((offer) => String(offer.status).toUpperCase() === 'ACCEPTED') ||
      null;
    const latestOffer = sortedOffers.length ? sortedOffers[sortedOffers.length - 1] : null;
    const finalPrice = this.normalizeAmount(order?.amount ?? acceptedOffer?.price ?? latestOffer?.price ?? null);
    const offerRounds = sortedOffers.length;
    const buyerOfferCount = sortedOffers.filter((offer) => offer.offered_by_id === conversation?.buyer_id).length;
    const sellerCounterCount = sortedOffers.filter(
      (offer) => offer.offered_by_id === conversation?.seller_id || String(offer.offer_type || '').toUpperCase() === 'COUNTER'
    ).length;

    let bargainDeltaAbs = null;
    let bargainDeltaPct = null;
    if (listingPrice !== null && finalPrice !== null) {
      const rawDelta = Math.abs(listingPrice - finalPrice);
      bargainDeltaAbs = Number(rawDelta.toFixed(2));
      bargainDeltaPct = listingPrice > 0 ? Number(((rawDelta / listingPrice) * 100).toFixed(2)) : null;
    }

    const agreementAtRaw = acceptedOffer ? (acceptedOffer.decided_at || acceptedOffer.created_at) : null;
    const agreementAt = agreementAtRaw ? new Date(agreementAtRaw).getTime() : null;
    const firstOfferAt = firstOffer ? new Date(firstOffer.created_at).getTime() : null;
    const completedAt = order?.completed_at ? new Date(order.completed_at).getTime() : null;
    const returnRequestedAt = order?.return_requested_at ? new Date(order.return_requested_at).getTime() : null;
    const refundedAt = order?.refunded_at ? new Date(order.refunded_at).getTime() : null;

    const timeToAgreementSec =
      firstOfferAt && agreementAt && agreementAt >= firstOfferAt
        ? Math.floor((agreementAt - firstOfferAt) / 1000)
        : null;
    const timeToCompletionSec =
      agreementAt && completedAt && completedAt >= agreementAt
        ? Math.floor((completedAt - agreementAt) / 1000)
        : null;
    const timeToReturnResolutionSec =
      returnRequestedAt && refundedAt && refundedAt >= returnRequestedAt
        ? Math.floor((refundedAt - returnRequestedAt) / 1000)
        : null;

    return {
      listing_price: listingPrice,
      first_offer_price: this.normalizeAmount(firstOffer?.price),
      final_price: finalPrice,
      bargain_delta_abs: bargainDeltaAbs,
      bargain_delta_pct: bargainDeltaPct,
      offer_rounds: offerRounds,
      buyer_offer_count: buyerOfferCount,
      seller_counter_count: sellerCounterCount,
      time_to_agreement_sec: timeToAgreementSec,
      time_to_completion_sec: timeToCompletionSec,
      time_to_return_resolution_sec: timeToReturnResolutionSec
    };
  }

  static async buildTimeline(conversationId, preloaded = null) {
    const normalizedConversationId = this.assertUuid(conversationId, 'conversationId');
    let conversation = preloaded?.conversation || null;
    let messages = preloaded?.messages || null;
    let offers = preloaded?.offers || null;
    let order = preloaded?.order || null;
    let orderStatusHistory = preloaded?.orderStatusHistory || null;

    if (!conversation) {
      conversation = await this.findById(normalizedConversationId, null);
    }

    if (!messages) {
      messages = await queryAll(
        `SELECT m.*, a.name as sender_name
         FROM messages m
         JOIN agents a ON a.id = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC`,
        [normalizedConversationId]
      );
    }

    if (!offers) {
      offers = await queryAll(
        `SELECT id, conversation_id, listing_id, buyer_id, seller_id, offered_by_id, offer_type, price, status, expires_at, decided_at, created_at
         FROM offers
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [normalizedConversationId]
      );
    }

    if (!order) {
      order = await queryOne(
        `SELECT o.*, buyer.name as buyer_name, seller.name as seller_name
         FROM orders o
         JOIN offers accepted_offer ON accepted_offer.id = o.offer_id
         JOIN agents buyer ON buyer.id = o.buyer_id
         JOIN agents seller ON seller.id = o.seller_id
         WHERE accepted_offer.conversation_id = $1
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [normalizedConversationId]
      );
    }

    if (!orderStatusHistory && order) {
      orderStatusHistory = await queryAll(
        `SELECT h.from_status, h.to_status, h.actor_id, h.note, h.created_at, actor.name as actor_name
         FROM order_status_history h
         LEFT JOIN agents actor ON actor.id = h.actor_id
         WHERE h.order_id = $1
         ORDER BY h.created_at ASC`,
        [order.id]
      );
    }

    const timeline = [];
    let index = 0;
    const pushEvent = (event) => {
      timeline.push({ ...event, _i: index++ });
    };

    for (const message of messages || []) {
      const normalizedReason = String(message.reason_code || '').toUpperCase();
      if (normalizedReason === 'ORDER_NUDGE') {
        pushEvent({
          id: `nudge:${message.id}`,
          event_type: 'ORDER_NUDGE_SENT',
          occurred_at: message.created_at,
          actor_id: message.sender_id,
          actor_name: message.sender_name || null,
          role: message.sender_id === conversation.buyer_id ? 'buyer' : 'seller',
          content: this.redactSensitiveText(message.content),
          reason_code: message.reason_code || null,
          metadata: this.sanitizeValue(message.metadata || {})
        });
        continue;
      }

      pushEvent({
        id: `message:${message.id}`,
        event_type: 'MESSAGE_TEXT',
        occurred_at: message.created_at,
        actor_id: message.sender_id,
        actor_name: message.sender_name || null,
        role: message.sender_id === conversation.buyer_id ? 'buyer' : 'seller',
        content: this.redactSensitiveText(message.content),
        message_type: message.message_type,
        reason_code: message.reason_code || null,
        metadata: this.sanitizeValue(message.metadata || {})
      });
    }

    const sortedOffers = [...(offers || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let previousPrice = null;
    for (const offer of sortedOffers) {
      const price = this.normalizeAmount(offer.price);
      const isCounter = String(offer.offer_type || '').toUpperCase() === 'COUNTER';
      const deltaAbs = previousPrice === null || price === null ? null : Number((price - previousPrice).toFixed(2));
      const deltaPct =
        previousPrice === null || previousPrice === 0 || price === null
          ? null
          : Number((((price - previousPrice) / previousPrice) * 100).toFixed(2));

      pushEvent({
        id: `offer-created:${offer.id}`,
        event_type: isCounter ? 'OFFER_COUNTERED' : 'OFFER_CREATED',
        occurred_at: offer.created_at,
        actor_id: offer.offered_by_id,
        actor_name: offer.offered_by_id === conversation.buyer_id ? conversation.buyer_name : conversation.seller_name,
        role: offer.offered_by_id === conversation.buyer_id ? 'buyer' : 'seller',
        offer_id: offer.id,
        offer_type: offer.offer_type,
        price,
        status: offer.status,
        delta_abs: deltaAbs,
        delta_pct: deltaPct
      });

      if (offer.decided_at && String(offer.status || '').toUpperCase() === 'ACCEPTED') {
        pushEvent({
          id: `offer-accepted:${offer.id}`,
          event_type: 'OFFER_ACCEPTED',
          occurred_at: offer.decided_at,
          actor_id: conversation.seller_id,
          actor_name: conversation.seller_name,
          role: 'seller',
          offer_id: offer.id,
          price
        });
      }

      if (offer.decided_at && String(offer.status || '').toUpperCase() === 'REJECTED') {
        pushEvent({
          id: `offer-rejected:${offer.id}`,
          event_type: 'OFFER_REJECTED',
          occurred_at: offer.decided_at,
          actor_id: null,
          actor_name: null,
          role: null,
          offer_id: offer.id,
          price
        });
      }

      previousPrice = price;
    }

    if (order) {
      pushEvent({
        id: `order-created:${order.id}`,
        event_type: 'ORDER_CREATED',
        occurred_at: order.created_at,
        actor_id: order.buyer_id,
        actor_name: order.buyer_name || conversation.buyer_name || null,
        role: 'buyer',
        order_id: order.id,
        amount: this.normalizeAmount(order.amount),
        status: order.status
      });

      for (const step of orderStatusHistory || []) {
        const mapped = this.orderStatusToTimelineEvent(step.to_status);
        if (!mapped) continue;
        pushEvent({
          id: `order-status:${order.id}:${step.to_status}:${step.created_at}`,
          event_type: mapped,
          occurred_at: step.created_at,
          actor_id: step.actor_id || null,
          actor_name: step.actor_name || null,
          role: step.actor_id === conversation.buyer_id ? 'buyer' : step.actor_id === conversation.seller_id ? 'seller' : null,
          order_id: order.id,
          from_status: step.from_status || null,
          to_status: step.to_status,
          note: step.note || null
        });
      }
    }

    return timeline
      .sort((a, b) => {
        const tA = new Date(a.occurred_at).getTime();
        const tB = new Date(b.occurred_at).getTime();
        if (tA !== tB) return tA - tB;
        return a._i - b._i;
      })
      .map(({ _i, ...event }) => event);
  }

  static async getPublicView(conversationId, actorId = null) {
    const normalizedConversationId = this.assertUuid(conversationId, 'conversationId');
    const conversation = await this.findById(normalizedConversationId, null);
    const [messages, offers, order] = await Promise.all([
      queryAll(
        `SELECT m.*, a.name as sender_name, a.display_name as sender_display_name
         FROM messages m
         JOIN agents a ON a.id = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC`,
        [normalizedConversationId]
      ),
      queryAll(
        `SELECT id, conversation_id, listing_id, buyer_id, seller_id, offered_by_id, offer_type, price, status, expires_at, decided_at, created_at
         FROM offers
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [normalizedConversationId]
      ),
      queryOne(
        `SELECT o.*, buyer.name as buyer_name, seller.name as seller_name
         FROM orders o
         JOIN offers accepted_offer ON accepted_offer.id = o.offer_id
         JOIN agents buyer ON buyer.id = o.buyer_id
         JOIN agents seller ON seller.id = o.seller_id
         WHERE accepted_offer.conversation_id = $1
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [normalizedConversationId]
      )
    ]);

    const orderStatusHistory = order
      ? await queryAll(
        `SELECT h.from_status, h.to_status, h.actor_id, h.note, h.created_at, actor.name as actor_name
         FROM order_status_history h
         LEFT JOIN agents actor ON actor.id = h.actor_id
         WHERE h.order_id = $1
         ORDER BY h.created_at ASC`,
        [order.id]
      )
      : [];

    const sanitizedMessages = messages.map((message) => this.sanitizeMessage(message));
    const sanitizedOrder = order
      ? {
        ...order,
        status_history: orderStatusHistory
      }
      : null;
    const timeline = await this.buildTimeline(normalizedConversationId, {
      conversation,
      messages: sanitizedMessages,
      offers,
      order: sanitizedOrder,
      orderStatusHistory
    });
    const previewMeta = await this.buildPreviewSegments(normalizedConversationId, timeline);
    const insights = this.buildInsights(conversation, offers, sanitizedOrder);
    const participants = {
      buyer_name: conversation.buyer_name || null,
      seller_name: conversation.seller_name || null,
      buyer_id: conversation.buyer_id,
      seller_id: conversation.seller_id
    };

    await EventLogService.log({
      eventType: 'PUBLIC_CONVERSATION_VIEW',
      actorId,
      targetType: 'conversation',
      targetId: normalizedConversationId,
      payload: { listingId: conversation.listing_id }
    });
    await EventLogService.log({
      eventType: 'CONVERSATION_TIMELINE_VIEW',
      actorId,
      targetType: 'conversation',
      targetId: normalizedConversationId,
      payload: { listingId: conversation.listing_id, timeline_events: timeline.length }
    });

    return {
      conversation,
      messages: sanitizedMessages,
      offers,
      order: sanitizedOrder,
      timeline,
      preview_segments: previewMeta.preview_segments,
      insights,
      participants,
      negotiation_density_score: previewMeta.conversation_heat
    };
  }

  static async setState(conversationId, state) {
    const normalizedConversationId = this.assertUuid(conversationId, 'conversationId');
    return queryOne(
      'UPDATE conversations SET state = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [normalizedConversationId, state]
    );
  }
}

module.exports = ConversationService;
