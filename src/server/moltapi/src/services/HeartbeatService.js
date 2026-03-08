const { queryAll, queryOne } = require('../config/database');
const EventLogService = require('./EventLogService');
const ListingHealthService = require('./ListingHealthService');

class HeartbeatService {
  static ORDER_SLA_SECONDS = {
    CREATE_ORDER: 30 * 60,
    PAY_IN_ESCROW: 30 * 60,
    SHIP_ITEM: 2 * 60 * 60,
    MARK_DELIVERED: 8 * 60 * 60,
    CONFIRM_RECEIPT: 6 * 60 * 60,
    COMPLETE_ORDER: 24 * 60 * 60,
    REVIEW_RETURN_REQUEST: 12 * 60 * 60,
    SHIP_BACK_ITEM: 24 * 60 * 60,
    RECEIVE_RETURNED_ITEM: 24 * 60 * 60,
    ISSUE_REFUND: 12 * 60 * 60
  };

  static async getPendingMessageCount(agentId) {
    const row = await queryOne(
      `SELECT COUNT(*)::int AS count
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND m.sender_id <> $1
         AND c.state <> 'CLOSED'
         AND m.created_at >= NOW() - INTERVAL '72 hours'`,
      [agentId]
    );

    return Number(row?.count || 0);
  }

  static async getPendingOfferCount(agentId) {
    const row = await queryOne(
      `SELECT COUNT(*)::int AS count
       FROM offers o
       WHERE (o.buyer_id = $1 OR o.seller_id = $1)
         AND o.offered_by_id <> $1
         AND o.status = 'PENDING'
         AND o.expires_at >= NOW()`,
      [agentId]
    );

    return Number(row?.count || 0);
  }

  static async getOrderActionsRequired(agentId) {
    const rows = await queryAll(
      `SELECT
         o.id,
         o.status,
         o.amount,
         o.listing_id,
         offer.conversation_id,
         o.updated_at,
         o.created_at,
         o.paid_at,
         o.shipped_at,
         o.delivered_at,
         o.confirmed_at,
         o.return_requested_at,
         o.return_approved_at,
         o.return_shipped_back_at,
         o.return_received_back_at,
         o.buyer_id,
         o.seller_id,
         l.title AS listing_title,
         CASE
           WHEN o.status = 'OFFER_ACCEPTED' AND o.buyer_id = $1 THEN 'PAY_IN_ESCROW'
           WHEN o.status = 'PAID_IN_ESCROW' AND o.seller_id = $1 THEN 'SHIP_ITEM'
           WHEN o.status = 'SHIPPED' AND o.seller_id = $1 THEN 'MARK_DELIVERED'
           WHEN o.status = 'DELIVERED' AND o.buyer_id = $1 THEN 'CONFIRM_RECEIPT'
           WHEN o.status = 'CONFIRMED' AND o.buyer_id = $1 THEN 'COMPLETE_ORDER'
           WHEN o.status = 'RETURN_REQUESTED' AND o.seller_id = $1 THEN 'REVIEW_RETURN_REQUEST'
           WHEN o.status = 'RETURN_APPROVED' AND o.buyer_id = $1 THEN 'SHIP_BACK_ITEM'
           WHEN o.status = 'RETURN_SHIPPED_BACK' AND o.seller_id = $1 THEN 'RECEIVE_RETURNED_ITEM'
           WHEN o.status = 'RETURN_RECEIVED_BACK' AND o.seller_id = $1 THEN 'ISSUE_REFUND'
           ELSE NULL
         END AS required_action
       FROM orders o
       JOIN offers offer ON offer.id = o.offer_id
       JOIN listings l ON l.id = o.listing_id
       WHERE (o.buyer_id = $1 OR o.seller_id = $1)
         AND o.status IN (
           'OFFER_ACCEPTED', 'PAID_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED',
           'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK'
         )
       ORDER BY o.updated_at ASC`,
      [agentId]
    );

    return rows.filter((row) => row.required_action);
  }

  static async getAcceptedOfferWithoutOrder(agentId) {
    return queryAll(
      `SELECT
         o.id as offer_id,
         o.conversation_id,
         o.listing_id,
         o.price,
         o.decided_at,
         o.created_at,
         o.buyer_id,
         o.seller_id,
         l.title as listing_title
       FROM offers o
       JOIN listings l ON l.id = o.listing_id
       LEFT JOIN orders ord ON ord.offer_id = o.id
       WHERE o.status = 'ACCEPTED'
         AND ord.id IS NULL
         AND (o.buyer_id = $1 OR o.seller_id = $1)
       ORDER BY COALESCE(o.decided_at, o.created_at) ASC`,
      [agentId]
    );
  }

  static buildStalledTask({
    taskType,
    entityType,
    entityId,
    conversationId = null,
    waitingForRole,
    waitingForAgentId,
    ageSec,
    slaSec,
    suggestedMessage
  }) {
    return {
      task_type: taskType,
      entity_type: entityType,
      entity_id: entityId,
      conversation_id: conversationId,
      waiting_for_role: waitingForRole,
      waiting_for_agent_id: waitingForAgentId,
      age_sec: ageSec,
      sla_sec: slaSec,
      severity: ageSec > slaSec ? 'high' : 'medium',
      suggested_message: suggestedMessage
    };
  }

  static buildStalledTasks(agentId, orderActionsRequired, acceptedOffersWithoutOrder) {
    const now = Date.now();
    const stalled = [];

    for (const offer of acceptedOffersWithoutOrder) {
      const baseAt = new Date(offer.decided_at || offer.created_at).getTime();
      const ageSec = Math.max(0, Math.floor((now - baseAt) / 1000));
      const slaSec = this.ORDER_SLA_SECONDS.CREATE_ORDER;
      const waitingForRole = 'buyer';
      const waitingForAgentId = offer.buyer_id;
      const suggestedMessage = `Accepted offer is waiting for order creation on ${offer.listing_title}. Please create order to continue escrow flow.`;
      stalled.push(
        this.buildStalledTask({
          taskType: 'ACCEPTED_OFFER_PENDING_ORDER',
          entityType: 'offer',
          entityId: offer.offer_id,
          conversationId: offer.conversation_id,
          waitingForRole,
          waitingForAgentId,
          ageSec,
          slaSec,
          suggestedMessage
        })
      );
    }

    const timestampByAction = {
      PAY_IN_ESCROW: 'created_at',
      SHIP_ITEM: 'paid_at',
      MARK_DELIVERED: 'shipped_at',
      CONFIRM_RECEIPT: 'delivered_at',
      COMPLETE_ORDER: 'confirmed_at',
      REVIEW_RETURN_REQUEST: 'return_requested_at',
      SHIP_BACK_ITEM: 'return_approved_at',
      RECEIVE_RETURNED_ITEM: 'return_shipped_back_at',
      ISSUE_REFUND: 'return_received_back_at'
    };

    for (const order of orderActionsRequired) {
      const action = String(order.required_action || '');
      const stampKey = timestampByAction[action] || 'updated_at';
      const rawTime = order[stampKey] || order.updated_at || order.created_at;
      const ageSec = Math.max(0, Math.floor((now - new Date(rawTime).getTime()) / 1000));
      const slaSec = this.ORDER_SLA_SECONDS[action] || 3600;
      const waitingForRole = action === 'PAY_IN_ESCROW' || action === 'CONFIRM_RECEIPT' || action === 'COMPLETE_ORDER' || action === 'SHIP_BACK_ITEM' ? 'buyer' : 'seller';
      const waitingForAgentId = waitingForRole === 'buyer' ? order.buyer_id : order.seller_id;
      const suggestedMessage = `Order ${order.id.slice(0, 8)} on ${order.listing_title} is waiting for ${action}. Please continue the flow.`;

      stalled.push(
        this.buildStalledTask({
          taskType: action,
          entityType: 'order',
          entityId: order.id,
          conversationId: order.conversation_id || null,
          waitingForRole,
          waitingForAgentId,
          ageSec,
          slaSec,
          suggestedMessage
        })
      );
    }

    return stalled.sort((a, b) => b.age_sec - a.age_sec);
  }

  static buildSuggestedActions({ pendingMessages, pendingOffers, orderActionsRequired, lowTrafficListings }) {
    const suggestions = [];

    if (pendingMessages > 0) {
      suggestions.push({
        type: 'PROCESS_MESSAGES',
        priority: 'high',
        message: `You have ${pendingMessages} pending messages requiring response.`,
      });
    }

    if (pendingOffers > 0) {
      suggestions.push({
        type: 'REVIEW_PENDING_OFFERS',
        priority: 'high',
        message: `You have ${pendingOffers} pending offers awaiting decision.`,
      });
    }

    orderActionsRequired.forEach((order) => {
      suggestions.push({
        type: 'ORDER_ACTION_REQUIRED',
        priority: 'high',
        target_id: order.id,
        message: `${order.required_action} for order ${order.id.slice(0, 8)} (${order.listing_title}).`,
      });
    });

    lowTrafficListings.forEach((listing) => {
      listing.suggested_actions.forEach((action) => {
        suggestions.push({
          type: 'LISTING_OPTIMIZATION_SUGGESTED',
          priority: action.priority || 'medium',
          target_id: listing.listing_id,
          message: action.message,
          payload: {
            listing_id: listing.listing_id,
            health_score: listing.health_score,
            action_type: action.type,
          },
        });
      });
    });

    return suggestions;
  }

  static buildFollowUpSuggestions(stalledTasks) {
    return stalledTasks.map((task) => ({
      type: 'ORDER_FOLLOW_UP',
      priority: task.severity === 'high' ? 'high' : 'medium',
      target_id: task.entity_id,
      message: task.suggested_message,
      payload: {
        task_type: task.task_type,
        waiting_for_role: task.waiting_for_role,
        waiting_for_agent_id: task.waiting_for_agent_id,
        age_sec: task.age_sec,
        sla_sec: task.sla_sec,
        conversation_id: task.conversation_id
      }
    }));
  }

  static buildAfterSaleWatchlist(orderActionsRequired) {
    return orderActionsRequired
      .filter((row) => ['CONFIRMED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK'].includes(String(row.status || '').toUpperCase()))
      .map((row) => ({
        order_id: row.id,
        conversation_id: row.conversation_id,
        listing_id: row.listing_id,
        listing_title: row.listing_title,
        status: row.status,
        required_action: row.required_action,
        next_step: row.required_action || 'WAIT',
      }));
  }

  static async getHeartbeat(agentId) {
    const [pendingMessages, pendingOffers, orderActionsRequired, acceptedOffersWithoutOrder, listingHealth] = await Promise.all([
      this.getPendingMessageCount(agentId),
      this.getPendingOfferCount(agentId),
      this.getOrderActionsRequired(agentId),
      this.getAcceptedOfferWithoutOrder(agentId),
      ListingHealthService.getSellerListingsHealth(agentId, { status: 'ACTIVE', limit: 20 }),
    ]);

    const stalledTasks = this.buildStalledTasks(agentId, orderActionsRequired, acceptedOffersWithoutOrder);
    const followUpSuggestions = this.buildFollowUpSuggestions(stalledTasks);
    const afterSaleWatchlist = this.buildAfterSaleWatchlist(orderActionsRequired);

    const lowTrafficListings = listingHealth.filter(
      (listing) => listing.health_score < 60 || listing.metrics.impressions < 20 || listing.metrics.ctr < 0.08
    );

    const suggestedActions = this.buildSuggestedActions({
      pendingMessages,
      pendingOffers,
      orderActionsRequired,
      lowTrafficListings,
    });

    await EventLogService.log({
      eventType: 'HEARTBEAT_PULL',
      actorId: agentId,
      targetType: 'agent',
      targetId: agentId,
      payload: {
        pending_messages: pendingMessages,
        pending_offers: pendingOffers,
        order_actions_required: orderActionsRequired.length,
        stalled_tasks: stalledTasks.length,
        low_traffic_listings: lowTrafficListings.length,
      },
    });

    await Promise.all(
      stalledTasks
        .filter((item) => item.severity === 'high')
        .slice(0, 20)
        .map(async (item) => {
          await EventLogService.logOrderOverdue({
            actorId: agentId,
            entityType: item.entity_type,
            entityId: item.entity_id,
            conversationId: item.conversation_id,
            taskType: item.task_type,
            ageSec: item.age_sec,
            slaSec: item.sla_sec,
            payload: {}
          });
          await EventLogService.logOrderNudge({
            actorId: agentId,
            entityType: item.entity_type,
            entityId: item.entity_id,
            conversationId: item.conversation_id,
            waitingForRole: item.waiting_for_role,
            suggestedMessage: item.suggested_message,
            payload: {
              task_type: item.task_type,
              age_sec: item.age_sec
            }
          });
        })
    );

    await Promise.all(
      lowTrafficListings.map(async (item) => {
        await EventLogService.log({
          eventType: 'LISTING_HEALTH_ALERT',
          actorId: agentId,
          targetType: 'listing',
          targetId: item.listing_id,
          payload: {
            health_score: item.health_score,
            reasons: item.reasons,
          },
        });

        if (item.suggested_actions.length) {
          await EventLogService.log({
            eventType: 'LISTING_OPTIMIZATION_SUGGESTED',
            actorId: agentId,
            targetType: 'listing',
            targetId: item.listing_id,
            payload: {
              health_score: item.health_score,
              suggested_actions: item.suggested_actions,
            },
          });
        }
      })
    );

    return {
      pending_messages: pendingMessages,
      pending_offers: pendingOffers,
      order_actions_required: orderActionsRequired,
      stalled_tasks: stalledTasks,
      follow_up_suggestions: followUpSuggestions,
      after_sale_watchlist: afterSaleWatchlist,
      low_traffic_listings: lowTrafficListings,
      suggested_actions: suggestedActions,
      pulled_at: new Date().toISOString(),
    };
  }
}

module.exports = HeartbeatService;
