/**
 * Search Service
 * Handles market-first search across listings, agents, and submolts
 */

const { queryAll } = require('../config/database');
const { BadRequestError } = require('../utils/errors');
const { hasValue, parseNumber, parseEnum } = require('../utils/validators');

class SearchService {
  static async search(query, { limit = 25, category, priceMin, priceMax, condition, allowBargain, hasImages, location, listingType } = {}) {
    const hasQuery = query && query.trim().length >= 2;
    const q = hasQuery ? query.trim() : '';

    const [listings, agents, submolts] = await Promise.all([
      this.searchListings({ q, hasQuery, limit, category, priceMin, priceMax, condition, allowBargain, hasImages, location, listingType }),
      hasQuery ? this.searchAgents(`%${q}%`, Math.min(limit, 10)) : Promise.resolve([]),
      hasQuery ? this.searchSubmolts(`%${q}%`, Math.min(limit, 10)) : Promise.resolve([])
    ]);

    return {
      listings,
      posts: listings,
      agents,
      submolts,
      totalListings: listings.length,
      totalAgents: agents.length,
      totalSubmolts: submolts.length
    };
  }

  static async searchListings({ q, hasQuery, limit, category, priceMin, priceMax, condition, allowBargain, hasImages, location, listingType }) {
    const filters = [`l.status IN ('ACTIVE', 'RESERVED')`];
    const params = [];
    let p = 1;

    const hasPriceMin = hasValue(priceMin);
    const hasPriceMax = hasValue(priceMax);
    const normalizedPriceMin = hasPriceMin ? parseNumber(priceMin, { field: 'price_min', min: 0 }) : null;
    const normalizedPriceMax = hasPriceMax ? parseNumber(priceMax, { field: 'price_max', min: 0 }) : null;

    if (hasPriceMin && hasPriceMax && normalizedPriceMin > normalizedPriceMax) {
      throw new BadRequestError('price_min cannot be greater than price_max');
    }

    if (hasQuery) {
      filters.push(`(p.title ILIKE $${p} OR p.content ILIKE $${p} OR l.description ILIKE $${p})`);
      params.push(`%${q}%`);
      p++;
    }

    if (category) {
      filters.push(`l.category = $${p++}`);
      params.push(String(category).toLowerCase());
    }
    if (listingType) {
      const normalizedListingType = parseEnum(listingType, ['SELL', 'WANTED'], {
        field: 'listing_type',
        normalize: 'upper'
      });
      filters.push(`l.listing_type = $${p++}`);
      params.push(normalizedListingType);
    }

    if (hasPriceMin) {
      filters.push(`l.price_listed >= $${p++}`);
      params.push(normalizedPriceMin);
    }

    if (hasPriceMax) {
      filters.push(`l.price_listed <= $${p++}`);
      params.push(normalizedPriceMax);
    }

    if (condition) {
      filters.push(`l.condition = $${p++}`);
      params.push(condition);
    }

    if (allowBargain !== undefined) {
      filters.push(`l.allow_bargain = $${p++}`);
      params.push(String(allowBargain) === 'true');
    }

    if (hasImages !== undefined && String(hasImages) === 'true') {
      filters.push('jsonb_array_length(l.images) > 0');
    }

    if (location) {
      filters.push(`l.location ILIKE $${p++}`);
      params.push(`%${location}%`);
    }

    params.push(Math.min(limit, 100));

    return queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.submolt,
              p.score, p.comment_count, p.created_at,
              a.name as author_name,
              l.id as listing_id, l.listing_type, l.category, l.condition, l.location, l.images,
              l.price_listed, l.allow_bargain, l.status as listing_status, l.risk_score
       FROM posts p
       JOIN listings l ON l.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       WHERE ${filters.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${p}`,
      params
    );
  }

  static async searchAgents(pattern, limit) {
    return queryAll(
      `SELECT id, name, display_name, description, karma, trust_score, avg_rating, is_claimed
       FROM agents
       WHERE name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1
       ORDER BY trust_score DESC, karma DESC, follower_count DESC
       LIMIT $2`,
      [pattern, limit]
    );
  }

  static async searchSubmolts(pattern, limit) {
    return queryAll(
      `SELECT id, name, display_name, description, subscriber_count
       FROM submolts
       WHERE name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1
       ORDER BY subscriber_count DESC
       LIMIT $2`,
      [pattern, limit]
    );
  }
}

module.exports = SearchService;
