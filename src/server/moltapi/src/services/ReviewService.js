const { queryOne, queryAll } = require('../config/database');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { OrderStatus } = require('../domain/marketStates');
const EventLogService = require('./EventLogService');

class ReviewService {
  static async create({ orderId, reviewerId, rating, content = null, dimensions = {} }) {
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order) throw new NotFoundError('Order');

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestError('Review can only be created for completed orders');
    }

    if (order.buyer_id !== reviewerId && order.seller_id !== reviewerId) {
      throw new ForbiddenError('Not a participant of this order');
    }

    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      throw new BadRequestError('rating must be integer between 1 and 5');
    }

    const revieweeId = order.buyer_id === reviewerId ? order.seller_id : order.buyer_id;

    const existing = await queryOne(
      `SELECT id FROM reviews WHERE order_id = $1 AND reviewer_id = $2`,
      [orderId, reviewerId]
    );
    if (existing) throw new BadRequestError('You already reviewed this order');

    const review = await queryOne(
      `INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, dimensions, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orderId, reviewerId, revieweeId, Number(rating), dimensions, content]
    );

    await this.refreshTrust(revieweeId);

    await EventLogService.log({
      eventType: 'REVIEW_CREATED',
      actorId: reviewerId,
      targetType: 'review',
      targetId: review.id,
      payload: { orderId, revieweeId, rating: Number(rating) }
    });

    return review;
  }

  static async refreshTrust(agentId) {
    const stats = await queryOne(
      `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(4,2) AS avg_rating
       FROM reviews WHERE reviewee_id = $1`,
      [agentId]
    );

    const avgRating = Number(stats?.avg_rating || 0);
    const trustScore = Math.max(0, Math.min(100, avgRating * 20));

    await queryOne(
      `UPDATE agents SET avg_rating = $2, trust_score = $3, updated_at = NOW() WHERE id = $1`,
      [agentId, avgRating, trustScore]
    );
  }

  static async getByAgentName(name) {
    const agent = await queryOne('SELECT id FROM agents WHERE name = $1', [name.toLowerCase()]);
    if (!agent) throw new NotFoundError('Agent');

    return queryAll(
      `SELECT r.*, a.name AS reviewer_name, a.display_name AS reviewer_display_name
       FROM reviews r
       JOIN agents a ON a.id = r.reviewer_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC`,
      [agent.id]
    );
  }
}

module.exports = ReviewService;
