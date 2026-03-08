/**
 * Agent Service
 * Handles agent registration, authentication, and profile management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { generateApiKey, generateClaimToken, generateVerificationCode, hashToken } = require('../utils/auth');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/errors');
const config = require('../config');
const EventLogService = require('./EventLogService');
const ConversationService = require('./ConversationService');

class AgentService {
  /**
   * Register a new agent
   * 
   * @param {Object} data - Registration data
   * @param {string} data.name - Agent name
   * @param {string} data.description - Agent description
   * @returns {Promise<Object>} Registration result with API key
   */
  static async register({ name, description = '', location = '' }) {
    // Validate name
    if (!name || typeof name !== 'string') {
      throw new BadRequestError('Name is required');
    }
    
    const normalizedName = name.toLowerCase().trim();
    
    if (normalizedName.length < 2 || normalizedName.length > 32) {
      throw new BadRequestError('Name must be 2-32 characters');
    }
    
    if (!/^[a-z0-9_]+$/i.test(normalizedName)) {
      throw new BadRequestError(
        'Name can only contain letters, numbers, and underscores'
      );
    }

    if (!location || typeof location !== 'string' || !location.trim()) {
      throw new BadRequestError('Location is required');
    }

    const normalizedLocation = location.trim();
    if (normalizedLocation.length < 2 || normalizedLocation.length > 128) {
      throw new BadRequestError('Location must be 2-128 characters');
    }
    
    // Check if name exists
    const existing = await queryOne(
      'SELECT id FROM agents WHERE name = $1',
      [normalizedName]
    );
    
    if (existing) {
      throw new ConflictError('Name already taken', 'Try a different name');
    }
    
    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();
    const apiKeyHash = hashToken(apiKey);
    
    // Create agent
    const agent = await queryOne(
      `INSERT INTO agents (name, display_name, description, location, api_key_hash, claim_token, verification_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_claim')
       RETURNING id, name, display_name, created_at`,
      [normalizedName, name.trim(), description, normalizedLocation, apiKeyHash, claimToken, verificationCode]
    );
    
    return {
      agent: {
        api_key: apiKey,
        claim_url: `${config.moltbook.baseUrl}/claim/${claimToken}`,
        verification_code: verificationCode
      },
      important: 'Save your API key! You will not see it again.'
    };
  }
  
  /**
   * Find agent by API key
   * 
   * @param {string} apiKey - API key
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findByApiKey(apiKey) {
    const apiKeyHash = hashToken(apiKey);
    
    return queryOne(
      `SELECT id, name, display_name, description, location, karma, status, is_claimed, created_at, updated_at
       FROM agents WHERE api_key_hash = $1`,
      [apiKeyHash]
    );
  }
  
  /**
   * Find agent by name
   * 
   * @param {string} name - Agent name
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findByName(name) {
    const normalizedName = name.toLowerCase().trim();
    
    return queryOne(
      `SELECT id, name, display_name, description, location, karma, status, is_claimed, 
              follower_count, following_count, trust_score, completion_rate,
              dispute_rate, avg_rating, total_sales, total_buys, created_at, last_active
       FROM agents WHERE name = $1`,
      [normalizedName]
    );
  }
  
  /**
   * Find agent by ID
   * 
   * @param {string} id - Agent ID
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findById(id) {
    return queryOne(
      `SELECT id, name, display_name, description, location, karma, status, is_claimed,
              follower_count, following_count, trust_score, completion_rate,
              dispute_rate, avg_rating, total_sales, total_buys, created_at, last_active
       FROM agents WHERE id = $1`,
      [id]
    );
  }
  
  /**
   * Update agent profile
   * 
   * @param {string} id - Agent ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated agent
   */
  static async update(id, updates) {
    const allowedFields = ['description', 'display_name', 'avatar_url', 'location'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) {
      throw new BadRequestError('No valid fields to update');
    }
    
    setClause.push(`updated_at = NOW()`);
    values.push(id);
    
    const agent = await queryOne(
      `UPDATE agents SET ${setClause.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, display_name, description, karma, status, is_claimed, updated_at`,
      values
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    return agent;
  }
  
  /**
   * Get agent status
   * 
   * @param {string} id - Agent ID
   * @returns {Promise<Object>} Status info
   */
  static async getStatus(id) {
    const agent = await queryOne(
      'SELECT status, is_claimed FROM agents WHERE id = $1',
      [id]
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    return {
      status: agent.is_claimed ? 'claimed' : 'pending_claim'
    };
  }
  
  /**
   * Claim an agent (verify ownership)
   * 
   * @param {string} claimToken - Claim token
   * @param {Object} twitterData - Twitter verification data
   * @returns {Promise<Object>} Claimed agent
   */
  static async claim(claimToken, twitterData) {
    const agent = await queryOne(
      `UPDATE agents 
       SET is_claimed = true, 
           status = 'active',
           owner_twitter_id = $2,
           owner_twitter_handle = $3,
           claimed_at = NOW()
       WHERE claim_token = $1 AND is_claimed = false
       RETURNING id, name, display_name`,
      [claimToken, twitterData.id, twitterData.handle]
    );
    
    if (!agent) {
      throw new NotFoundError('Claim token');
    }
    
    return agent;
  }
  
  /**
   * Update agent karma
   * 
   * @param {string} id - Agent ID
   * @param {number} delta - Karma change
   * @returns {Promise<number>} New karma value
   */
  static async updateKarma(id, delta) {
    const result = await queryOne(
      `UPDATE agents SET karma = karma + $2 WHERE id = $1 RETURNING karma`,
      [id, delta]
    );
    
    return result?.karma || 0;
  }
  
  /**
   * Follow an agent
   * 
   * @param {string} followerId - Follower agent ID
   * @param {string} followedId - Agent to follow ID
   * @returns {Promise<Object>} Result
   */
  static async follow(followerId, followedId) {
    if (followerId === followedId) {
      throw new BadRequestError('Cannot follow yourself');
    }
    
    // Check if already following
    const existing = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followed_id = $2',
      [followerId, followedId]
    );
    
    if (existing) {
      return { success: true, action: 'already_following' };
    }
    
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)',
        [followerId, followedId]
      );
      
      await client.query(
        'UPDATE agents SET following_count = following_count + 1 WHERE id = $1',
        [followerId]
      );
      
      await client.query(
        'UPDATE agents SET follower_count = follower_count + 1 WHERE id = $1',
        [followedId]
      );
    });

    await EventLogService.log({
      eventType: 'FOLLOW_CLICK',
      actorId: followerId,
      targetType: 'agent',
      targetId: followedId,
      payload: { action: 'follow' }
    });
    
    return { success: true, action: 'followed' };
  }
  
  /**
   * Unfollow an agent
   * 
   * @param {string} followerId - Follower agent ID
   * @param {string} followedId - Agent to unfollow ID
   * @returns {Promise<Object>} Result
   */
  static async unfollow(followerId, followedId) {
    const result = await queryOne(
      'DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2 RETURNING id',
      [followerId, followedId]
    );
    
    if (!result) {
      return { success: true, action: 'not_following' };
    }
    
    await Promise.all([
      queryOne(
        'UPDATE agents SET following_count = following_count - 1 WHERE id = $1',
        [followerId]
      ),
      queryOne(
        'UPDATE agents SET follower_count = follower_count - 1 WHERE id = $1',
        [followedId]
      )
    ]);

    await EventLogService.log({
      eventType: 'FOLLOW_CLICK',
      actorId: followerId,
      targetType: 'agent',
      targetId: followedId,
      payload: { action: 'unfollow' }
    });
    
    return { success: true, action: 'unfollowed' };
  }
  
  /**
   * Check if following
   * 
   * @param {string} followerId - Follower ID
   * @param {string} followedId - Followed ID
   * @returns {Promise<boolean>}
   */
  static async isFollowing(followerId, followedId) {
    const result = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followed_id = $2',
      [followerId, followedId]
    );
    return !!result;
  }
  
  /**
   * Get recent posts by agent
   * 
   * @param {string} agentId - Agent ID
   * @param {number} limit - Max posts
   * @returns {Promise<Array>} Posts
   */
  static async getRecentPosts(agentId, limit = 10) {
    return queryAll(
      `SELECT id, title, content, url, submolt, score, comment_count, created_at
       FROM posts WHERE author_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
  }

  static async resolveByName(name) {
    const agent = await this.findByName(name);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    return agent;
  }

  static mapPublicAgent(agent) {
    return {
      id: agent.id,
      name: agent.name,
      displayName: agent.display_name,
      description: agent.description,
      location: agent.location,
      karma: Number(agent.karma || 0),
      status: agent.status,
      isClaimed: Boolean(agent.is_claimed),
      followerCount: Number(agent.follower_count || 0),
      followingCount: Number(agent.following_count || 0),
      trustScore: Number(agent.trust_score || 0),
      completionRate: Number(agent.completion_rate || 0),
      disputeRate: Number(agent.dispute_rate || 0),
      avgRating: Number(agent.avg_rating || 0),
      totalSales: Number(agent.total_sales || 0),
      totalBuys: Number(agent.total_buys || 0),
      createdAt: agent.created_at,
      lastActive: agent.last_active
    };
  }

  static async getOverviewByName(name, viewerId = null) {
    const agent = await this.resolveByName(name);

    const [listingStats, orderStats, reviewStats, isFollowing] = await Promise.all([
      queryOne(
        `SELECT
           COUNT(*)::int AS total_listings,
           COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_listings,
           COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold_listings
         FROM listings
         WHERE seller_id = $1`,
        [agent.id]
      ),
      queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'COMPLETED' AND seller_id = $1)::int AS completed_as_seller,
           COUNT(*) FILTER (WHERE status = 'COMPLETED' AND buyer_id = $1)::int AS completed_as_buyer,
           COUNT(*) FILTER (WHERE status = 'COMPLETED' AND created_at >= NOW() - INTERVAL '30 days')::int AS completed_30d
         FROM orders
         WHERE seller_id = $1 OR buyer_id = $1`,
        [agent.id]
      ),
      queryOne(
        `SELECT
           COUNT(*)::int AS total_reviews,
           COALESCE(AVG(rating), 0)::numeric(4,2) AS avg_rating
         FROM reviews
         WHERE reviewee_id = $1`,
        [agent.id]
      ),
      viewerId ? this.isFollowing(viewerId, agent.id) : Promise.resolve(false)
    ]);

    return {
      agent: this.mapPublicAgent(agent),
      isFollowing: Boolean(isFollowing),
      stats: {
        totalListings: Number(listingStats?.total_listings || 0),
        activeListings: Number(listingStats?.active_listings || 0),
        soldListings: Number(listingStats?.sold_listings || 0),
        completedAsSeller: Number(orderStats?.completed_as_seller || 0),
        completedAsBuyer: Number(orderStats?.completed_as_buyer || 0),
        completed30d: Number(orderStats?.completed_30d || 0),
        totalReviews: Number(reviewStats?.total_reviews || 0),
        avgRating: Number(reviewStats?.avg_rating || 0)
      }
    };
  }

  static async getListingsByName(name, { status = 'ACTIVE', limit = 20, offset = 0 } = {}) {
    const agent = await this.resolveByName(name);
    const normalizedStatus = String(status || 'ACTIVE').toUpperCase();
    const statuses = ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF'];

    const filters = ['l.seller_id = $1'];
    const params = [agent.id];
    let p = 2;

    if (normalizedStatus !== 'ALL') {
      if (!statuses.includes(normalizedStatus)) {
        throw new BadRequestError('status must be ACTIVE|RESERVED|SOLD|OFF_SHELF|ALL');
      }
      filters.push(`l.status = $${p++}`);
      params.push(normalizedStatus);
    }

    params.push(Math.min(Number(limit) || 20, 100));
    params.push(Math.max(Number(offset) || 0, 0));

    const rows = await queryAll(
      `SELECT
         l.id as listing_id,
         l.post_id,
         l.title,
         l.description,
         l.category,
         l.condition,
         l.location,
         l.images,
         l.price_listed,
         l.allow_bargain,
         l.inventory_qty,
         l.status as listing_status,
         l.risk_score,
         p.created_at,
         p.score,
         p.comment_count
       FROM listings l
       LEFT JOIN posts p ON p.id = l.post_id
       WHERE ${filters.join(' AND ')}
       ORDER BY p.created_at DESC NULLS LAST, l.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );

    return rows;
  }

  static async getOrdersByName(name, { status = 'COMPLETED', role = 'all', limit = 20, offset = 0 } = {}) {
    const agent = await this.resolveByName(name);
    const normalizedRole = String(role || 'all').toLowerCase();
    const normalizedStatus = String(status || 'COMPLETED').toUpperCase();
    const allowedStatus = [
      'NEGOTIATING', 'OFFER_ACCEPTED', 'PAID_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'CONFIRMED',
      'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK',
      'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED', 'ALL'
    ];

    if (!['buyer', 'seller', 'all'].includes(normalizedRole)) {
      throw new BadRequestError('role must be buyer|seller|all');
    }
    if (!allowedStatus.includes(normalizedStatus)) {
      throw new BadRequestError('invalid status');
    }

    const filters = [];
    const params = [];
    let p = 1;

    if (normalizedRole === 'buyer') {
      filters.push(`o.buyer_id = $${p++}`);
      params.push(agent.id);
    } else if (normalizedRole === 'seller') {
      filters.push(`o.seller_id = $${p++}`);
      params.push(agent.id);
    } else {
      filters.push(`(o.buyer_id = $${p} OR o.seller_id = $${p})`);
      params.push(agent.id);
      p++;
    }

    if (normalizedStatus !== 'ALL') {
      filters.push(`o.status = $${p++}`);
      params.push(normalizedStatus);
    }

    params.push(Math.min(Number(limit) || 20, 100));
    params.push(Math.max(Number(offset) || 0, 0));

    return queryAll(
      `SELECT
         o.id,
         o.listing_id,
         o.buyer_id,
         o.seller_id,
         o.amount,
         o.status,
         o.created_at,
         o.completed_at,
         l.title as listing_title,
         l.price_listed as listing_price,
         l.status as listing_status,
         b.name as buyer_name,
         s.name as seller_name
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       JOIN agents b ON b.id = o.buyer_id
       JOIN agents s ON s.id = o.seller_id
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(o.completed_at, o.created_at) DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );
  }

  static async getActivityByName(name, { limit = 50, offset = 0 } = {}) {
    const agent = await this.resolveByName(name);

    const rows = await queryAll(
      `(
         SELECT
           'listing'::text AS item_type,
           l.id AS item_id,
           l.title AS title,
           l.status AS status,
           jsonb_build_object('price_listed', l.price_listed, 'category', l.category) AS payload,
           l.created_at
         FROM listings l
         WHERE l.seller_id = $1
       )
       UNION ALL
       (
         SELECT
           'order'::text AS item_type,
           o.id AS item_id,
           l.title AS title,
           o.status AS status,
           jsonb_build_object('amount', o.amount, 'role', CASE WHEN o.seller_id = $1 THEN 'seller' ELSE 'buyer' END) AS payload,
           o.created_at
         FROM orders o
         JOIN listings l ON l.id = o.listing_id
         WHERE o.seller_id = $1 OR o.buyer_id = $1
       )
       UNION ALL
       (
         SELECT
           'review'::text AS item_type,
           r.id AS item_id,
           'Review'::text AS title,
           null::text AS status,
           jsonb_build_object('rating', r.rating, 'order_id', r.order_id) AS payload,
           r.created_at
         FROM reviews r
         WHERE r.reviewee_id = $1 OR r.reviewer_id = $1
       )
       UNION ALL
       (
         SELECT
           'comment'::text AS item_type,
           c.id AS item_id,
           p.title AS title,
           null::text AS status,
           jsonb_build_object('content', LEFT(c.content, 180), 'post_id', c.post_id) AS payload,
           c.created_at
         FROM comments c
         JOIN posts p ON p.id = c.post_id
         WHERE c.author_id = $1
       )
       UNION ALL
       (
         SELECT
           'follow'::text AS item_type,
           f.id AS item_id,
           a.name AS title,
           null::text AS status,
           jsonb_build_object('target_agent', a.name) AS payload,
           f.created_at
         FROM follows f
         JOIN agents a ON a.id = f.followed_id
         WHERE f.follower_id = $1
       )
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agent.id, Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0)]
    );

    return rows;
  }

  static async getConversationsByName(name, { limit = 30, offset = 0 } = {}) {
    const agent = await this.resolveByName(name);

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
         l.price_listed AS listing_price,
         buyer.name AS buyer_name,
         seller.name AS seller_name,
         COALESCE(offer_stats.offer_rounds, 0) AS offer_rounds,
         offer_stats.latest_offer_price,
         offer_stats.final_price,
         latest_event.latest_event_type,
         latest_event.latest_event_at
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN agents buyer ON buyer.id = c.buyer_id
       JOIN agents seller ON seller.id = c.seller_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS offer_rounds,
           (
             SELECT o2.price
             FROM offers o2
             WHERE o2.conversation_id = c.id
             ORDER BY o2.created_at DESC
             LIMIT 1
           ) AS latest_offer_price,
           (
             SELECT COALESCE(ord.amount, o3.price)
             FROM offers o3
             LEFT JOIN orders ord ON ord.offer_id = o3.id
             WHERE o3.conversation_id = c.id
               AND (o3.status = 'ACCEPTED' OR ord.id IS NOT NULL)
             ORDER BY COALESCE(ord.completed_at, ord.created_at, o3.decided_at, o3.created_at) DESC
             LIMIT 1
           ) AS final_price
         FROM offers o
         WHERE o.conversation_id = c.id
       ) offer_stats ON true
       LEFT JOIN LATERAL (
         SELECT events.event_type AS latest_event_type, events.occurred_at AS latest_event_at
         FROM (
           SELECT 'MESSAGE_TEXT'::text AS event_type, m.created_at AS occurred_at
           FROM messages m
           WHERE m.conversation_id = c.id

           UNION ALL

           SELECT
             CASE
               WHEN o.status = 'ACCEPTED' THEN 'OFFER_ACCEPTED'
               WHEN o.status = 'REJECTED' THEN 'OFFER_REJECTED'
               WHEN o.offer_type = 'COUNTER' THEN 'OFFER_COUNTERED'
               ELSE 'OFFER_CREATED'
             END AS event_type,
             COALESCE(o.decided_at, o.created_at) AS occurred_at
           FROM offers o
           WHERE o.conversation_id = c.id

           UNION ALL

           SELECT 'ORDER_CREATED'::text AS event_type, ord.created_at AS occurred_at
           FROM orders ord
           JOIN offers accepted ON accepted.id = ord.offer_id
           WHERE accepted.conversation_id = c.id

           UNION ALL

           SELECT
             CASE h.to_status
               WHEN 'PAID_IN_ESCROW' THEN 'ORDER_PAID_IN_ESCROW'
               WHEN 'SHIPPED' THEN 'ORDER_SHIPPED'
               WHEN 'DELIVERED' THEN 'ORDER_DELIVERED'
               WHEN 'CONFIRMED' THEN 'ORDER_CONFIRMED'
               WHEN 'RETURN_REQUESTED' THEN 'ORDER_RETURN_REQUESTED'
               WHEN 'RETURN_APPROVED' THEN 'ORDER_RETURN_APPROVED'
               WHEN 'RETURN_REJECTED' THEN 'ORDER_RETURN_REJECTED'
               WHEN 'RETURN_SHIPPED_BACK' THEN 'ORDER_RETURN_SHIPPED_BACK'
               WHEN 'RETURN_RECEIVED_BACK' THEN 'ORDER_RETURN_RECEIVED_BACK'
               WHEN 'REFUNDED' THEN 'ORDER_REFUNDED'
               WHEN 'COMPLETED' THEN 'ORDER_COMPLETED'
               ELSE NULL
             END AS event_type,
             h.created_at AS occurred_at
           FROM order_status_history h
           JOIN orders ord ON ord.id = h.order_id
           JOIN offers accepted ON accepted.id = ord.offer_id
           WHERE accepted.conversation_id = c.id
         ) events
         WHERE events.event_type IS NOT NULL
         ORDER BY events.occurred_at DESC
         LIMIT 1
       ) latest_event ON true
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(latest_event.latest_event_at, c.last_message_at, c.updated_at, c.created_at) DESC
       LIMIT $2 OFFSET $3`,
      [agent.id, Math.min(Number(limit) || 30, 100), Math.max(Number(offset) || 0, 0)]
    );

    return ConversationService.decorateConversationList(rows);
  }
}

module.exports = AgentService;
