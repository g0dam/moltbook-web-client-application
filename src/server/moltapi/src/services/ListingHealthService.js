const { queryAll, queryOne } = require('../config/database');
const ListingService = require('./ListingService');

class ListingHealthService {
  static clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  static safeDivide(numerator, denominator) {
    if (!denominator || denominator <= 0) return 0;
    return numerator / denominator;
  }

  static normalizeScore(value, cap) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return this.clamp(value / cap, 0, 1);
  }

  static buildSuggestions(metrics, listing) {
    const reasons = [];
    const suggested_actions = [];

    if (metrics.impressions < 20) {
      reasons.push('Low exposure in feed');
      suggested_actions.push({
        type: 'IMPROVE_TITLE_DESCRIPTION',
        priority: 'high',
        message: 'Rewrite title/description with clearer intent and richer keywords.',
      });
    }

    if (metrics.ctr < 0.08 && metrics.impressions >= 20) {
      reasons.push('Low click-through rate from feed to detail');
      suggested_actions.push({
        type: 'IMPROVE_COVER_AND_PRICE',
        priority: 'high',
        message: 'Improve cover image quality and consider a more competitive listed price.',
      });
    }

    if (metrics.detail_views >= 8 && metrics.conversation_starts === 0) {
      reasons.push('Detail views are not converting to conversations');
      suggested_actions.push({
        type: 'IMPROVE_NEGOTIATION_HOOK',
        priority: 'medium',
        message: 'Add explicit bargaining range and delivery terms to trigger buyer chats.',
      });
    }

    if (metrics.offer_rate < 0.3 && metrics.conversation_starts > 0) {
      reasons.push('Conversations rarely progress into offers');
      suggested_actions.push({
        type: 'RESPOND_WITH_PRICE_ANCHOR',
        priority: 'medium',
        message: 'Use concrete counter-offers and constraints early in conversation.',
      });
    }

    if (metrics.quality_score < 60) {
      reasons.push('Listing quality score is below healthy threshold');
      suggested_actions.push({
        type: 'ENRICH_ATTRIBUTES',
        priority: 'high',
        message: 'Complete category attributes and add condition details to improve ranking quality.',
      });
    }

    if (!listing.images || listing.images.length === 0) {
      suggested_actions.push({
        type: 'ADD_IMAGES',
        priority: 'medium',
        message: 'Add at least 3 clear product images to increase trust and CTR.',
      });
    }

    return { reasons, suggested_actions };
  }

  static buildHealthScore(metrics) {
    const recencyScore = this.normalizeScore(1 / Math.max(metrics.age_days, 1), 1);
    const ctrScore = this.normalizeScore(metrics.ctr, 0.25);
    const conversationScore = this.normalizeScore(metrics.conversation_rate, 0.35);
    const offerScore = this.normalizeScore(metrics.offer_rate, 0.6);
    const conversionScore = this.normalizeScore(metrics.conversion_rate, 0.15);
    const qualityScore = this.normalizeScore(metrics.quality_score, 100);

    const score =
      recencyScore * 0.1 +
      ctrScore * 0.2 +
      conversationScore * 0.2 +
      offerScore * 0.15 +
      conversionScore * 0.15 +
      qualityScore * 0.2;

    return Number((score * 100).toFixed(2));
  }

  static async computeListingHealth(listingId, { days = 7 } = {}) {
    const listing = await queryOne(
      `SELECT id, seller_id, title, status, images, description_quality_score, created_at
       FROM listings
       WHERE id = $1`,
      [listingId]
    );

    if (!listing) {
      return null;
    }

    const lookbackClause = `NOW() - INTERVAL '${Math.max(Number(days) || 7, 1)} days'`;
    const [impressionsRow, detailViewsRow, conversationsRow, offersRow, completedRow] = await Promise.all([
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM event_logs
         WHERE event_type = 'LISTING_IMPRESSION'
           AND target_id = $1
           AND actor_id IS NOT NULL
           AND created_at >= ${lookbackClause}`,
        [listing.id]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM event_logs
         WHERE event_type = 'LISTING_DETAIL_VIEW'
           AND target_id = $1
           AND actor_id IS NOT NULL
           AND created_at >= ${lookbackClause}`,
        [listing.id]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM conversations
         WHERE listing_id = $1
           AND created_at >= ${lookbackClause}`,
        [listing.id]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM offers
         WHERE listing_id = $1
           AND created_at >= ${lookbackClause}`,
        [listing.id]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS count
         FROM orders
         WHERE listing_id = $1
           AND status = 'COMPLETED'
           AND created_at >= ${lookbackClause}`,
        [listing.id]
      ),
    ]);

    const impressions = Number(impressionsRow?.count || 0);
    const detailViews = Number(detailViewsRow?.count || 0);
    const conversationStarts = Number(conversationsRow?.count || 0);
    const offers = Number(offersRow?.count || 0);
    const completedOrders = Number(completedRow?.count || 0);
    const qualityScore = Number(listing.description_quality_score || 0);
    const ageDays = Math.max(1, Math.floor((Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24)));

    const baseInputs = ListingService.buildHealthInputs({
      impressions,
      detail_views: detailViews,
      conversation_starts: conversationStarts,
      offers,
      completed_orders: completedOrders,
      quality_score: qualityScore,
    });

    const metrics = {
      ...baseInputs,
      conversation_rate: Number(this.safeDivide(conversationStarts, Math.max(detailViews, impressions)).toFixed(4)),
      age_days: ageDays,
      completed_orders: completedOrders,
    };

    const healthScore = this.buildHealthScore(metrics);
    const { reasons, suggested_actions } = this.buildSuggestions(metrics, listing);

    return {
      listing_id: listing.id,
      seller_id: listing.seller_id,
      title: listing.title,
      health_score: healthScore,
      status: healthScore >= 70 ? 'GOOD' : healthScore >= 50 ? 'WATCH' : 'LOW',
      metrics,
      reasons,
      suggested_actions,
    };
  }

  static async getSellerListingsHealth(sellerId, { status = 'ACTIVE', limit = 20 } = {}) {
    const listings = await queryAll(
      `SELECT id
       FROM listings
       WHERE seller_id = $1
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [sellerId, status || null, Math.min(Number(limit) || 20, 100)]
    );

    const result = await Promise.all(listings.map((item) => this.computeListingHealth(item.id)));
    return result.filter(Boolean);
  }
}

module.exports = ListingHealthService;
