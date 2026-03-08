const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { OrderStatus, ListingStatus, ConversationState, canTransitionOrder } = require('../domain/marketStates');
const WalletService = require('./WalletService');
const EventLogService = require('./EventLogService');
const ConversationService = require('./ConversationService');

class OrderService {
  static assertUuid(value, fieldName) {
    const normalized = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestError(`${fieldName} must be a valid UUID`);
    }
    return normalized;
  }

  static normalizeActionOptions(options = {}) {
    return {
      conversationMessage: typeof options.conversationMessage === 'string' ? options.conversationMessage.trim() : '',
      conversationReasonCode: options.conversationReasonCode ? String(options.conversationReasonCode).trim() : null
    };
  }

  static softGateHint(toStatus) {
    const action = {
      [OrderStatus.CONFIRMED]: 'confirm receipt',
      [OrderStatus.COMPLETED]: 'complete order',
      [OrderStatus.RETURN_REQUESTED]: 'request return',
      [OrderStatus.RETURN_APPROVED]: 'approve return',
      [OrderStatus.RETURN_REJECTED]: 'reject return',
      [OrderStatus.RETURN_SHIPPED_BACK]: 'mark return shipment',
      [OrderStatus.RETURN_RECEIVED_BACK]: 'mark returned item received',
      [OrderStatus.REFUNDED]: 'issue refund',
      [OrderStatus.DISPUTED]: 'open dispute'
    }[toStatus];

    if (!action) return null;
    return `Suggestion: send a negotiation message before you ${action}.`;
  }

  static async createFromAcceptedOffer({ offerId, buyerId }) {
    const normalizedOfferId = this.assertUuid(offerId, 'offerId');
    const offer = await queryOne('SELECT * FROM offers WHERE id = $1', [normalizedOfferId]);
    if (!offer) throw new NotFoundError('Offer');
    if (offer.status !== 'ACCEPTED') throw new BadRequestError('Only accepted offer can create order');
    if (offer.buyer_id !== buyerId) throw new ForbiddenError('Only buyer can create order');

    const existing = await queryOne('SELECT * FROM orders WHERE offer_id = $1', [normalizedOfferId]);
    if (existing) return existing;

    const order = await queryOne(
      `INSERT INTO orders (offer_id, listing_id, buyer_id, seller_id, amount, status, lock_expires_at)
       VALUES ($1, $2, $3, $4, $5, 'OFFER_ACCEPTED', NOW() + INTERVAL '30 minutes')
       RETURNING *`,
      [offer.id, offer.listing_id, offer.buyer_id, offer.seller_id, offer.price]
    );

    await this.recordStatus(order.id, null, OrderStatus.OFFER_ACCEPTED, buyerId, 'Order created from accepted offer');

    await EventLogService.log({
      eventType: 'ORDER_CREATED',
      actorId: buyerId,
      targetType: 'order',
      targetId: order.id,
      payload: { offerId: normalizedOfferId, listingId: offer.listing_id, amount: offer.price }
    });

    return order;
  }

  static async findById(orderId, agentId = null) {
    const normalizedOrderId = this.assertUuid(orderId, 'orderId');
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [normalizedOrderId]);
    if (!order) throw new NotFoundError('Order');

    if (agentId && order.buyer_id !== agentId && order.seller_id !== agentId) {
      throw new ForbiddenError('Not a participant in this order');
    }

    return order;
  }

  static async listMine(agentId) {
    return queryAll(
      `SELECT * FROM orders
       WHERE buyer_id = $1 OR seller_id = $1
       ORDER BY created_at DESC`,
      [agentId]
    );
  }

  static async listPublic({ status = OrderStatus.COMPLETED, role = 'all', agentId = null, limit = 20, offset = 0 } = {}) {
    const normalizedRole = String(role || 'all').toLowerCase();
    const normalizedStatus = String(status || OrderStatus.COMPLETED).toUpperCase();
    const normalizedAgentId = agentId ? this.assertUuid(agentId, 'agentId') : null;
    const allowedStatus = [
      OrderStatus.NEGOTIATING,
      OrderStatus.OFFER_ACCEPTED,
      OrderStatus.PAID_IN_ESCROW,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CONFIRMED,
      OrderStatus.RETURN_REQUESTED,
      OrderStatus.RETURN_APPROVED,
      OrderStatus.RETURN_REJECTED,
      OrderStatus.RETURN_SHIPPED_BACK,
      OrderStatus.RETURN_RECEIVED_BACK,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.DISPUTED,
      OrderStatus.REFUNDED,
      'ALL'
    ];

    if (!['buyer', 'seller', 'all'].includes(normalizedRole)) {
      throw new BadRequestError('role must be buyer|seller|all');
    }
    if (!allowedStatus.includes(normalizedStatus)) {
      throw new BadRequestError('invalid status');
    }
    if ((normalizedRole === 'buyer' || normalizedRole === 'seller') && !normalizedAgentId) {
      throw new BadRequestError('agent_id is required when role is buyer or seller');
    }

    const filters = [];
    const params = [];
    let p = 1;

    if (normalizedRole === 'buyer') {
      filters.push(`o.buyer_id = $${p++}`);
      params.push(normalizedAgentId);
    } else if (normalizedRole === 'seller') {
      filters.push(`o.seller_id = $${p++}`);
      params.push(normalizedAgentId);
    } else if (normalizedAgentId) {
      filters.push(`(o.buyer_id = $${p} OR o.seller_id = $${p})`);
      params.push(normalizedAgentId);
      p++;
    }

    if (normalizedStatus !== 'ALL') {
      filters.push(`o.status = $${p++}`);
      params.push(normalizedStatus);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 20, 100));
    params.push(Math.max(Number(offset) || 0, 0));

    return queryAll(
      `SELECT
         o.*,
         l.title AS listing_title,
         l.price_listed AS listing_price,
         l.status AS listing_status,
         b.name AS buyer_name,
         s.name AS seller_name
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       JOIN agents b ON b.id = o.buyer_id
       JOIN agents s ON s.id = o.seller_id
       ${where}
       ORDER BY COALESCE(o.completed_at, o.created_at) DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );
  }

  static async findReadable(orderId, viewerId = null) {
    const normalizedOrderId = this.assertUuid(orderId, 'orderId');
    const order = await queryOne(
      `SELECT
         o.*,
         offer.conversation_id,
         l.title AS listing_title,
         l.description AS listing_description,
         l.price_listed AS listing_price,
         l.status AS listing_status,
         l.category AS listing_category,
         l.images AS listing_images,
         b.name AS buyer_name,
         s.name AS seller_name
       FROM orders o
       JOIN offers offer ON offer.id = o.offer_id
       JOIN listings l ON l.id = o.listing_id
       JOIN agents b ON b.id = o.buyer_id
       JOIN agents s ON s.id = o.seller_id
       WHERE o.id = $1`,
      [normalizedOrderId]
    );

    if (!order) {
      throw new NotFoundError('Order');
    }

    // MoltMarket god-view mode: order detail is publicly readable for observation.
    // Write actions are still protected by role checks in transition endpoints.

    const [history, reviews] = await Promise.all([
      queryAll(
        `SELECT from_status, to_status, actor_id, note, created_at
         FROM order_status_history
         WHERE order_id = $1
         ORDER BY created_at ASC`,
        [normalizedOrderId]
      ),
      queryAll(
        `SELECT r.id, r.rating, r.content, r.created_at,
                reviewer.name AS reviewer_name
         FROM reviews r
         JOIN agents reviewer ON reviewer.id = r.reviewer_id
         WHERE r.order_id = $1
         ORDER BY r.created_at ASC`,
        [normalizedOrderId]
      )
    ]);

    return {
      ...order,
      status_history: history,
      reviews
    };
  }

  static async recordStatus(orderId, fromStatus, toStatus, actorId, note = null, client = null) {
    if (client) {
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, fromStatus, toStatus, actorId, note]
      );
      return;
    }

    await queryOne(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, fromStatus, toStatus, actorId, note]
    );
  }

  static async transition(orderId, actorId, toStatus, note = null, options = {}) {
    const order = await this.findById(orderId, actorId);
    const normalizedOptions = this.normalizeActionOptions(options);

    if (!canTransitionOrder(order.status, toStatus)) {
      throw new BadRequestError(`Invalid status transition: ${order.status} -> ${toStatus}`);
    }

    const role = order.buyer_id === actorId ? 'buyer' : 'seller';

    if (toStatus === OrderStatus.PAID_IN_ESCROW && role !== 'buyer') {
      throw new ForbiddenError('Only buyer can pay');
    }
    if (toStatus === OrderStatus.SHIPPED && role !== 'seller') {
      throw new ForbiddenError('Only seller can ship');
    }
    if (toStatus === OrderStatus.DELIVERED && role !== 'seller') {
      throw new ForbiddenError('Only seller can mark delivered');
    }
    if (toStatus === OrderStatus.CONFIRMED && role !== 'buyer') {
      throw new ForbiddenError('Only buyer can confirm');
    }
    if (toStatus === OrderStatus.COMPLETED && role !== 'buyer') {
      throw new ForbiddenError('Only buyer can complete');
    }
    if (toStatus === OrderStatus.RETURN_REQUESTED && role !== 'buyer') {
      throw new ForbiddenError('Only buyer can request return');
    }
    if (toStatus === OrderStatus.RETURN_APPROVED && role !== 'seller') {
      throw new ForbiddenError('Only seller can approve return');
    }
    if (toStatus === OrderStatus.RETURN_REJECTED && role !== 'seller') {
      throw new ForbiddenError('Only seller can reject return');
    }
    if (toStatus === OrderStatus.RETURN_SHIPPED_BACK && role !== 'buyer') {
      throw new ForbiddenError('Only buyer can mark return shipment');
    }
    if (toStatus === OrderStatus.RETURN_RECEIVED_BACK && role !== 'seller') {
      throw new ForbiddenError('Only seller can mark returned item received');
    }
    if (toStatus === OrderStatus.REFUNDED && role !== 'seller') {
      throw new ForbiddenError('Only seller can refund');
    }

    if (normalizedOptions.conversationMessage) {
      const conversationLink = await queryOne(
        `SELECT accepted_offer.conversation_id
         FROM orders o
         JOIN offers accepted_offer ON accepted_offer.id = o.offer_id
         WHERE o.id = $1`,
        [order.id]
      );
      if (conversationLink?.conversation_id) {
        await ConversationService.addMessage({
          conversationId: conversationLink.conversation_id,
          senderId: actorId,
          content: normalizedOptions.conversationMessage,
          messageType: 'TEXT',
          reasonCode: normalizedOptions.conversationReasonCode || null,
          metadata: {
            source: 'ORDER_ACTION',
            target_status: toStatus
          }
        });
      }
    }

    const updated = await transaction(async (client) => {
      if (toStatus === OrderStatus.PAID_IN_ESCROW) {
        await WalletService.assertSpendable(order.buyer_id, order.amount, client);
        await WalletService.adjust(order.buyer_id, {
          balanceDelta: -Number(order.amount),
          reservedDelta: Number(order.amount),
          entryType: 'ESCROW_LOCK',
          referenceType: 'order',
          referenceId: order.id,
          metadata: { action: 'pay' }
        }, client);
      }

      if (toStatus === OrderStatus.COMPLETED) {
        await WalletService.adjust(order.buyer_id, {
          balanceDelta: 0,
          reservedDelta: -Number(order.amount),
          entryType: 'ESCROW_RELEASE',
          referenceType: 'order',
          referenceId: order.id,
          metadata: { action: 'release_to_seller' }
        }, client);

        await WalletService.adjust(order.seller_id, {
          balanceDelta: Number(order.amount),
          reservedDelta: 0,
          entryType: 'TRADE_SETTLEMENT',
          referenceType: 'order',
          referenceId: order.id,
          metadata: { action: 'receive_settlement' }
        }, client);
      }

      if (toStatus === OrderStatus.REFUNDED) {
        await WalletService.adjust(order.buyer_id, {
          balanceDelta: Number(order.amount),
          reservedDelta: -Number(order.amount),
          entryType: 'REFUND',
          referenceType: 'order',
          referenceId: order.id,
          metadata: { action: 'refund' }
        }, client);
      }

      const stampMap = {
        [OrderStatus.PAID_IN_ESCROW]: 'paid_at',
        [OrderStatus.SHIPPED]: 'shipped_at',
        [OrderStatus.DELIVERED]: 'delivered_at',
        [OrderStatus.CONFIRMED]: 'confirmed_at',
        [OrderStatus.RETURN_REQUESTED]: 'return_requested_at',
        [OrderStatus.RETURN_APPROVED]: 'return_approved_at',
        [OrderStatus.RETURN_REJECTED]: 'return_rejected_at',
        [OrderStatus.RETURN_SHIPPED_BACK]: 'return_shipped_back_at',
        [OrderStatus.RETURN_RECEIVED_BACK]: 'return_received_back_at',
        [OrderStatus.COMPLETED]: 'completed_at',
        [OrderStatus.CANCELLED]: 'cancelled_at',
        [OrderStatus.DISPUTED]: 'disputed_at',
        [OrderStatus.REFUNDED]: 'refunded_at'
      };

      const stampField = stampMap[toStatus];
      const updates = [`status = $2`, 'updated_at = NOW()'];
      if (stampField) {
        updates.push(`${stampField} = NOW()`);
      }
      if (toStatus === OrderStatus.CONFIRMED) {
        updates.push(`after_sale_until = NOW() + INTERVAL '72 hours'`);
      }
      const updatedOrder = await client.query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        [order.id, toStatus]
      );

      if (toStatus === OrderStatus.COMPLETED) {
        await client.query('UPDATE listings SET status = $2, updated_at = NOW() WHERE id = $1', [order.listing_id, ListingStatus.SOLD]);
        await client.query('UPDATE conversations SET state = $2, updated_at = NOW() WHERE listing_id = $1', [order.listing_id, ConversationState.CLOSED]);
      }
      if (toStatus === OrderStatus.REFUNDED) {
        await client.query('UPDATE listings SET status = $2, updated_at = NOW() WHERE id = $1', [order.listing_id, ListingStatus.ACTIVE]);
        await client.query('UPDATE conversations SET state = $2, updated_at = NOW() WHERE listing_id = $1', [order.listing_id, ConversationState.CLOSED]);
      }

      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, order.status, toStatus, actorId, note]
      );

      return updatedOrder.rows[0];
    });

    await EventLogService.log({
      eventType: `ORDER_${toStatus}`,
      actorId,
      targetType: 'order',
      targetId: order.id,
      payload: { from: order.status, to: toStatus }
    });

    await EventLogService.log({
      eventType: normalizedOptions.conversationMessage ? 'ORDER_ACTION_WITH_MESSAGE' : 'ORDER_ACTION_WITHOUT_MESSAGE',
      actorId,
      targetType: 'order',
      targetId: order.id,
      payload: {
        from: order.status,
        to: toStatus,
        has_conversation_message: Boolean(normalizedOptions.conversationMessage),
        conversation_reason_code: normalizedOptions.conversationReasonCode || null
      }
    });

    return {
      ...updated,
      soft_hint: !normalizedOptions.conversationMessage ? this.softGateHint(toStatus) : null
    };
  }

  static async complete(orderId, buyerId, options = {}) {
    return this.transition(orderId, buyerId, OrderStatus.COMPLETED, 'buyer_completed', options);
  }

  static async requestReturn(orderId, buyerId, { reasonCode = null, detail = null, conversationMessage = null, conversationReasonCode = null } = {}) {
    const note = [reasonCode ? `reason=${reasonCode}` : null, detail ? `detail=${detail}` : null].filter(Boolean).join(' | ');
    return this.transition(orderId, buyerId, OrderStatus.RETURN_REQUESTED, note || 'return_requested', {
      conversationMessage,
      conversationReasonCode
    });
  }

  static async approveReturn(orderId, sellerId, { reason = null, conversationMessage = null, conversationReasonCode = null } = {}) {
    return this.transition(orderId, sellerId, OrderStatus.RETURN_APPROVED, reason || 'return_approved', {
      conversationMessage,
      conversationReasonCode
    });
  }

  static async rejectReturn(orderId, sellerId, { reason = null, conversationMessage = null, conversationReasonCode = null } = {}) {
    return this.transition(orderId, sellerId, OrderStatus.RETURN_REJECTED, reason || 'return_rejected', {
      conversationMessage,
      conversationReasonCode
    });
  }

  static async shipBackReturn(orderId, buyerId, { detail = null, conversationMessage = null, conversationReasonCode = null } = {}) {
    return this.transition(orderId, buyerId, OrderStatus.RETURN_SHIPPED_BACK, detail || 'return_shipped_back', {
      conversationMessage,
      conversationReasonCode
    });
  }

  static async receiveReturnedItem(orderId, sellerId, { detail = null, conversationMessage = null, conversationReasonCode = null } = {}) {
    return this.transition(orderId, sellerId, OrderStatus.RETURN_RECEIVED_BACK, detail || 'return_received_back', {
      conversationMessage,
      conversationReasonCode
    });
  }
}

module.exports = OrderService;
