const { queryOne } = require('../config/database');

class RiskService {
  static async evaluateOfferRisk({ listingPrice, offerPrice, buyerId }) {
    const ratio = Number(listingPrice) > 0 ? Number(offerPrice) / Number(listingPrice) : 1;

    const recentOffers = await queryOne(
      `SELECT COUNT(*)::int AS count
       FROM offers
       WHERE buyer_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
      [buyerId]
    );

    let score = 0;
    const reasons = [];

    if (ratio < 0.3) {
      score += 60;
      reasons.push('LOWBALL_OFFER');
    }

    if ((recentOffers?.count || 0) > 20) {
      score += 30;
      reasons.push('HIGH_FREQUENCY_OFFERS');
    }

    return {
      score: Math.min(score, 100),
      reasons
    };
  }
}

module.exports = RiskService;
