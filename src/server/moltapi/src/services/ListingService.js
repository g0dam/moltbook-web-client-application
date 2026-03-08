const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const { ListingStatus } = require('../domain/marketStates');
const { hasValue, parseNumber, parseEnum } = require('../utils/validators');
const EventLogService = require('./EventLogService');
const WalletService = require('./WalletService');
const CategoryTemplateService = require('./CategoryTemplateService');

class ListingService {
  static assertUuid(value, fieldName) {
    const normalized = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestError(`${fieldName} must be a valid UUID`);
    }
    return normalized;
  }

  static defaultRankingWeights() {
    return {
      recency: 0.3,
      trust: 0.2,
      conversion: 0.2,
      quality: 0.15,
      risk: -0.1,
      exploration: 0.05
    };
  }

  static sanitizeRankingWeights(rawWeights = {}) {
    const defaults = this.defaultRankingWeights();
    const normalized = { ...defaults };

    for (const key of Object.keys(defaults)) {
      if (rawWeights[key] === undefined) continue;
      const parsed = Number(rawWeights[key]);
      if (!Number.isFinite(parsed)) continue;
      normalized[key] = parsed;
    }

    return normalized;
  }

  static async rankingWeights() {
    try {
      const scenario = await queryOne(
        `SELECT config
         FROM experiment_configs
         WHERE is_active = true
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`
      );

      if (!scenario?.config || typeof scenario.config !== 'object') {
        return this.defaultRankingWeights();
      }

      const rankingWeights = scenario.config.ranking_weights || scenario.config.rankingWeights;
      if (!rankingWeights || typeof rankingWeights !== 'object') {
        return this.defaultRankingWeights();
      }

      return this.sanitizeRankingWeights(rankingWeights);
    } catch {
      return this.defaultRankingWeights();
    }
  }

  static normalizeScore(value, divisor = 100) {
    return Math.max(0, Math.min(1, Number(value || 0) / divisor));
  }

  static seededExplorationValue(seedText) {
    const seed = String(seedText || '');
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 1000) / 1000;
  }

  static computeQualityScore(item) {
    const images = Array.isArray(item.images) ? item.images.length : 0;
    const descLength = String(item.description || item.content || '').trim().length;
    const baseFields = [item.category, item.condition, item.location].filter(Boolean).length;
    const attrCount = item.attributes && typeof item.attributes === 'object' ? Object.keys(item.attributes).length : 0;
    const qualityFromDb = Number(item.description_quality_score || 0);

    const imagesScore = Math.min(1, images / 4);
    const descScore = Math.min(1, descLength / 260);
    const fieldsScore = Math.min(1, (baseFields + attrCount) / 8);
    const blended = (imagesScore + descScore + fieldsScore) / 3;

    if (qualityFromDb > 0) {
      return Number((((qualityFromDb / 100) * 0.6) + blended * 0.4).toFixed(4));
    }

    return Number(blended.toFixed(4));
  }

  static calculateDescriptionQualityScore({ description, images = [], attributes = {}, template = null }) {
    const textLength = String(description || '').trim().length;
    const imageCount = Array.isArray(images) ? images.length : 0;
    const attrCount = attributes && typeof attributes === 'object' ? Object.keys(attributes).length : 0;
    const expectedFields = Array.isArray(template?.template?.form_fields) ? template.template.form_fields.length : 0;
    const minDescLength = Number(template?.template?.description_min_length || 24);

    const textScore = Math.min(1, textLength / Math.max(minDescLength * 4, 120));
    const imageScore = Math.min(1, imageCount / 4);
    const attrScore = expectedFields > 0 ? Math.min(1, attrCount / expectedFields) : Math.min(1, attrCount / 3);

    const score = textScore * 0.5 + imageScore * 0.2 + attrScore * 0.3;
    return Number((score * 100).toFixed(2));
  }

  static buildHealthInputs({
    impressions = 0,
    detail_views = 0,
    conversation_starts = 0,
    offers = 0,
    completed_orders = 0,
    quality_score = 0,
  } = {}) {
    const safeDivide = (numerator, denominator) => {
      if (!denominator || denominator <= 0) return 0;
      return numerator / denominator;
    };

    return {
      impressions: Number(impressions || 0),
      detail_views: Number(detail_views || 0),
      ctr: Number(safeDivide(detail_views, impressions).toFixed(4)),
      conversation_starts: Number(conversation_starts || 0),
      offer_rate: Number(safeDivide(offers, Math.max(conversation_starts, 1)).toFixed(4)),
      conversion_rate: Number(safeDivide(completed_orders, Math.max(detail_views, impressions, 1)).toFixed(4)),
      quality_score: Number(quality_score || 0),
    };
  }

  static rankFeed(items, { sort = 'hot', weights = null } = {}) {
    const resolvedWeights = weights || this.defaultRankingWeights();
    const now = Date.now();
    const daySeed = new Date().toISOString().slice(0, 10);

    return items
      .map((item) => {
        const createdAt = new Date(item.created_at || now).getTime();
        const ageHours = Math.max(1, (now - createdAt) / (1000 * 60 * 60));
        const recencyScore = Number(Math.exp(-ageHours / 72).toFixed(4));
        const trustScore = this.normalizeScore(item.seller_trust_score || 0);
        const impressions = Number(item.impressions_7d || 0);
        const completed = Number(item.completed_orders_7d || 0);
        const conversations = Number(item.conversations_7d || 0);
        const conversionRaw = impressions > 0 ? completed / impressions : conversations / 20;
        const conversionScore = Math.max(0, Math.min(1, Number(conversionRaw.toFixed(4))));
        const qualityScore = this.computeQualityScore(item);
        const riskPenalty = Math.max(
          0,
          Math.min(1, Number(item.risk_score || 0) / 100 + Number(item.seller_dispute_rate || 0) / 100)
        );
        const explorationRandom = this.seededExplorationValue(`${item.listing_id}:${daySeed}`);
        const explorationScore = explorationRandom > 0.95 ? 1 : 0;

        let feedScore =
          resolvedWeights.recency * recencyScore +
          resolvedWeights.trust * trustScore +
          resolvedWeights.conversion * conversionScore +
          resolvedWeights.quality * qualityScore +
          resolvedWeights.risk * riskPenalty +
          resolvedWeights.exploration * explorationScore;

        if (sort === 'deals') {
          const priceFactor = Number(item.price_listed || 0) > 0 ? 1 / Math.log10(Number(item.price_listed || 0) + 10) : 0;
          feedScore += priceFactor * 0.1;
        }

        return {
          ...item,
          feed_score: Number(feedScore.toFixed(6)),
          feed_rank_reason: {
            recency: recencyScore,
            trust: trustScore,
            conversion: conversionScore,
            quality: qualityScore,
            risk: riskPenalty,
            exploration: explorationScore
          }
        };
      })
      .sort((a, b) => b.feed_score - a.feed_score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  static async captureRankingSnapshots(rows, modelVersion = 'rules_v1') {
    const topRows = rows.slice(0, 20);
    try {
      await Promise.all(
        topRows.map((row) =>
          queryOne(
            `INSERT INTO ranking_feature_snapshots (listing_id, feature_json, score, model_version)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [row.listing_id, row.feed_rank_reason || {}, Number(row.feed_score || 0), modelVersion]
          )
        )
      );
    } catch {
      // table may not be migrated yet; keep feed path resilient
    }
  }

  static async createMarketPost({ authorId, submolt, title, content, url, listing }) {
    if (!title || !title.trim()) {
      throw new BadRequestError('Title is required');
    }

    const { normalized: validatedListing, template } = await CategoryTemplateService.normalizeListingPayload({
      ...listing,
      description: listing?.description || content || '',
    });
    const descriptionQualityScore = this.calculateDescriptionQualityScore({
      description: validatedListing.description,
      images: validatedListing.images,
      attributes: validatedListing.attributes,
      template,
    });

    const submoltRecord = await queryOne('SELECT id FROM submolts WHERE name = $1', [String(submolt || 'general').toLowerCase()]);
    if (!submoltRecord) {
      throw new NotFoundError('Submolt');
    }

    const result = await transaction(async (client) => {
      await WalletService.ensureWallet(authorId, client);

      const postInsert = await client.query(
        `INSERT INTO posts (author_id, submolt_id, submolt, title, content, url, post_type, market_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id, author_id, submolt, title, content, url, post_type, score, comment_count, created_at`,
        [
          authorId,
          submoltRecord.id,
          String(submolt || 'general').toLowerCase(),
          title.trim(),
          validatedListing.description || content || null,
          url || null,
          url ? 'link' : 'text'
        ]
      );

      const post = postInsert.rows[0];
      const listingInsert = await client.query(
        `INSERT INTO listings (
          post_id, seller_id, listing_type, title, description, category, condition, location,
          images, price_listed, min_acceptable_price, allow_bargain, inventory_qty, status,
          attributes, spec_version, description_quality_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, 'ACTIVE', $14::jsonb, $15, $16)
        RETURNING *`,
        [
          post.id,
          authorId,
          validatedListing.listing_type,
          title.trim(),
          validatedListing.description,
          validatedListing.category,
          validatedListing.condition,
          validatedListing.location,
          JSON.stringify(validatedListing.images),
          validatedListing.price_listed,
          validatedListing.min_acceptable_price,
          validatedListing.allow_bargain,
          validatedListing.inventory_qty,
          JSON.stringify(validatedListing.attributes || {}),
          validatedListing.spec_version,
          descriptionQualityScore,
        ]
      );

      return { post, listing: listingInsert.rows[0] };
    });

    await EventLogService.log({
      eventType: 'LISTING_CREATED',
      actorId: authorId,
      targetType: 'listing',
      targetId: result.listing.id,
      payload: {
        price: result.listing.price_listed,
        category: result.listing.category,
        listing_type: result.listing.listing_type,
        spec_version: result.listing.spec_version,
      }
    });

    return result;
  }

  static buildFilter({ category, price_min, price_max, condition, allow_bargain, has_images, location, status, q, listing_type }) {
    const filters = ['1=1'];
    const params = [];
    let p = 1;
    const hasPriceMin = hasValue(price_min);
    const hasPriceMax = hasValue(price_max);
    const normalizedPriceMin = hasPriceMin ? parseNumber(price_min, { field: 'price_min', min: 0 }) : null;
    const normalizedPriceMax = hasPriceMax ? parseNumber(price_max, { field: 'price_max', min: 0 }) : null;
    if (hasPriceMin && hasPriceMax && normalizedPriceMin > normalizedPriceMax) {
      throw new BadRequestError('price_min cannot be greater than price_max');
    }

    if (status) {
      filters.push(`l.status = $${p++}`);
      params.push(status);
    } else {
      filters.push(`l.status IN ('ACTIVE', 'RESERVED')`);
    }

    if (category) {
      filters.push(`l.category = $${p++}`);
      params.push(String(category).toLowerCase());
    }
    if (listing_type) {
      const normalizedListingType = parseEnum(listing_type, ['SELL', 'WANTED'], {
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
    if (allow_bargain !== undefined) {
      filters.push(`l.allow_bargain = $${p++}`);
      params.push(String(allow_bargain) === 'true');
    }
    if (has_images !== undefined) {
      if (String(has_images) === 'true') {
        filters.push(`jsonb_array_length(l.images) > 0`);
      }
    }
    if (location) {
      filters.push(`l.location ILIKE $${p++}`);
      params.push(`%${location}%`);
    }
    if (q) {
      filters.push(`(p.title ILIKE $${p} OR p.content ILIKE $${p} OR l.description ILIKE $${p})`);
      params.push(`%${q}%`);
      p++;
    }

    return { where: filters.join(' AND '), params };
  }

  static sortClause(sort = 'hot') {
    switch (sort) {
      case 'new':
        return 'l.created_at DESC';
      case 'price_asc':
        return 'l.price_listed ASC, l.created_at DESC';
      case 'price_desc':
        return 'l.price_listed DESC, l.created_at DESC';
      case 'deals':
        return '(100 - l.risk_score) DESC, l.price_listed ASC, l.created_at DESC';
      case 'hot':
      default:
        return `LOG(GREATEST(ABS(p.score), 1)) * SIGN(p.score) + EXTRACT(EPOCH FROM p.created_at) / 45000 DESC`;
    }
  }

  static async getFeed({ sort = 'hot', limit = 25, offset = 0, ...filters }) {
    const { where, params } = this.buildFilter(filters);
    const normalizedSort = String(sort || 'hot');
    const shouldRank = ['hot', 'deals'].includes(normalizedSort);
    const effectiveLimit = Math.min(Number(limit) || 25, 100);
    const effectiveOffset = Math.max(Number(offset) || 0, 0);
    const orderBy = shouldRank ? 'l.created_at DESC' : this.sortClause(normalizedSort);
    const candidateLimit = shouldRank ? Math.min((effectiveOffset + effectiveLimit) * 5, 400) : effectiveLimit;
    const candidateOffset = shouldRank ? 0 : effectiveOffset;

    const rows = await queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.submolt, p.post_type,
              p.score, p.comment_count, p.created_at,
              a.name as author_name, a.display_name as author_display_name,
              a.trust_score as seller_trust_score, a.dispute_rate as seller_dispute_rate, a.avg_rating as seller_avg_rating,
              l.id as listing_id, l.listing_type, l.category, l.condition, l.location,
              l.images, l.price_listed, l.min_acceptable_price, l.allow_bargain,
              l.inventory_qty, l.status as listing_status, l.risk_score,
              l.attributes, l.spec_version, l.description_quality_score, l.last_optimized_at,
              (SELECT COUNT(*)::int FROM event_logs e
                 WHERE e.event_type = 'LISTING_IMPRESSION'
                   AND e.target_id = l.id
                   AND e.created_at >= NOW() - INTERVAL '7 days') as impressions_7d,
              (SELECT COUNT(DISTINCT COALESCE(e.actor_id::text, NULLIF(e.payload->>'session_id', '')))::int FROM event_logs e
                 WHERE e.event_type = 'LISTING_IMPRESSION'
                   AND e.target_id = l.id
                   AND (e.actor_id IS NOT NULL OR NULLIF(e.payload->>'session_id', '') IS NOT NULL)
                   AND e.created_at >= NOW() - INTERVAL '7 days') as unique_agent_views_7d,
              (SELECT COUNT(*)::int FROM event_logs e
                 WHERE e.event_type = 'LISTING_DETAIL_VIEW'
                   AND e.target_id = l.id
                   AND e.created_at >= NOW() - INTERVAL '7 days') as detail_agent_views_7d,
              (SELECT COUNT(*)::int FROM conversations c
                 WHERE c.listing_id = l.id
                   AND c.created_at >= NOW() - INTERVAL '7 days') as conversations_7d,
              (SELECT COUNT(*)::int FROM orders o
                 WHERE o.listing_id = l.id
                   AND o.status = 'COMPLETED'
                   AND o.created_at >= NOW() - INTERVAL '7 days') as completed_orders_7d,
              (SELECT COUNT(*)::int FROM conversations c
                 WHERE c.seller_id = l.seller_id
                   AND c.created_at >= NOW() - INTERVAL '7 days') as seller_conversations_7d,
              (SELECT COUNT(*)::int FROM orders o
                 WHERE o.seller_id = l.seller_id
                   AND o.status = 'COMPLETED'
                   AND o.created_at >= NOW() - INTERVAL '7 days') as seller_completed_orders_7d,
              (SELECT COUNT(*)::int FROM conversations c
                 WHERE c.created_at >= NOW() - INTERVAL '7 days') as platform_conversations_7d,
              (SELECT COUNT(*)::int FROM orders o
                 WHERE o.status = 'COMPLETED'
                   AND o.created_at >= NOW() - INTERVAL '7 days') as platform_completed_orders_7d
       FROM posts p
       JOIN listings l ON l.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, candidateLimit, candidateOffset]
    );

    if (!shouldRank) {
      return rows;
    }

    const weights = await this.rankingWeights();
    const ranked = this.rankFeed(rows, { sort: normalizedSort, weights });
    if (effectiveOffset === 0) {
      await this.captureRankingSnapshots(ranked, 'rules_v1');
    }
    return ranked.slice(effectiveOffset, effectiveOffset + effectiveLimit);
  }

  static async getById(id, { viewerId = null, source = 'listing_detail' } = {}) {
    const lookupId = this.assertUuid(id, 'listingId');
    const row = await queryOne(
      `SELECT p.*, a.name as author_name, a.display_name as author_display_name,
              a.trust_score as seller_trust_score, a.dispute_rate as seller_dispute_rate, a.avg_rating as seller_avg_rating,
              l.id as listing_id, l.seller_id, l.listing_type, l.category, l.condition, l.location,
              l.images, l.price_listed, l.min_acceptable_price, l.allow_bargain,
              l.inventory_qty, l.status as listing_status, l.risk_score,
              l.attributes, l.spec_version, l.description_quality_score, l.last_optimized_at
       FROM posts p
       JOIN listings l ON l.post_id = p.id
       JOIN agents a ON a.id = p.author_id
       WHERE p.id = $1 OR l.id = $1`,
      [lookupId]
    );

    if (!row) {
      throw new NotFoundError('Listing');
    }

    await EventLogService.log({
      eventType: 'LISTING_IMPRESSION',
      actorId: viewerId,
      targetType: 'listing',
      targetId: row.listing_id,
      payload: { postId: row.id, source }
    });

    await EventLogService.log({
      eventType: 'LISTING_DETAIL_VIEW',
      actorId: viewerId,
      targetType: 'listing',
      targetId: row.listing_id,
      payload: { postId: row.id, source }
    });

    return row;
  }

  static async updateListing(listingId, agentId, updates) {
    const normalizedListingId = this.assertUuid(listingId, 'listingId');
    const listing = await queryOne('SELECT * FROM listings WHERE id = $1', [normalizedListingId]);
    if (!listing) throw new NotFoundError('Listing');
    if (listing.seller_id !== agentId) {
      throw new ForbiddenError('Only seller can update listing');
    }

    const allowed = [
      'title',
      'description',
      'category',
      'listing_type',
      'condition',
      'location',
      'images',
      'price_listed',
      'min_acceptable_price',
      'allow_bargain',
      'inventory_qty',
      'attributes',
      'status',
      'spec_version',
    ];
    const updateKeys = Object.keys(updates || {}).filter((key) => allowed.includes(key));

    if (!updateKeys.length) {
      throw new BadRequestError('No valid listing fields provided');
    }

    if (updates.title !== undefined && !String(updates.title).trim()) {
      throw new BadRequestError('title cannot be empty');
    }

    const candidate = {
      ...listing,
      ...updates,
      description: updates.description ?? listing.description,
      category: updates.category ?? listing.category,
      listing_type: updates.listing_type ?? listing.listing_type,
      attributes: updates.attributes ?? listing.attributes,
      images: updates.images ?? listing.images,
    };
    const { normalized: validatedListing, template } = await CategoryTemplateService.normalizeListingPayload(candidate, {
      existingListing: listing,
    });
    const descriptionQualityScore = this.calculateDescriptionQualityScore({
      description: validatedListing.description,
      images: validatedListing.images,
      attributes: validatedListing.attributes,
      template,
    });

    const listingFieldMap = {
      title: updates.title !== undefined ? String(updates.title).trim() : undefined,
      description: updates.description !== undefined ? validatedListing.description : undefined,
      category: updates.category !== undefined ? validatedListing.category : undefined,
      listing_type: updates.listing_type !== undefined ? validatedListing.listing_type : undefined,
      condition: updates.condition !== undefined ? validatedListing.condition : undefined,
      location: updates.location !== undefined ? validatedListing.location : undefined,
      images: updates.images !== undefined ? JSON.stringify(validatedListing.images || []) : undefined,
      price_listed: updates.price_listed !== undefined ? validatedListing.price_listed : undefined,
      min_acceptable_price: updates.min_acceptable_price !== undefined ? validatedListing.min_acceptable_price : undefined,
      allow_bargain: updates.allow_bargain !== undefined ? validatedListing.allow_bargain : undefined,
      inventory_qty: updates.inventory_qty !== undefined ? validatedListing.inventory_qty : undefined,
      attributes: updates.attributes !== undefined ? JSON.stringify(validatedListing.attributes || {}) : undefined,
      status: updates.status !== undefined ? String(updates.status).toUpperCase() : undefined,
      spec_version:
        updates.spec_version !== undefined ||
        updates.category !== undefined ||
        updates.listing_type !== undefined ||
        updates.attributes !== undefined
          ? validatedListing.spec_version
          : undefined,
    };

    if (updates.status !== undefined && !['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF'].includes(listingFieldMap.status)) {
      throw new BadRequestError('listing.status must be ACTIVE|RESERVED|SOLD|OFF_SHELF');
    }

    const set = [];
    const values = [];
    let p = 1;

    Object.entries(listingFieldMap).forEach(([key, value]) => {
      if (value !== undefined) {
        set.push(`${key} = $${p++}`);
        values.push(value);
      }
    });

    set.push(`description_quality_score = $${p++}`);
    values.push(descriptionQualityScore);
    set.push(`last_optimized_at = NOW()`);

    const updated = await transaction(async (client) => {
      values.push(normalizedListingId);
      const listingUpdate = await client.query(
        `UPDATE listings SET ${set.join(', ')}, updated_at = NOW()
         WHERE id = $${p}
         RETURNING *`,
        values
      );
      const currentListing = listingUpdate.rows[0];

      const postUpdates = [];
      const postValues = [];
      let postParam = 1;
      if (updates.title !== undefined) {
        postUpdates.push(`title = $${postParam++}`);
        postValues.push(String(updates.title).trim());
      }
      if (updates.description !== undefined) {
        postUpdates.push(`content = $${postParam++}`);
        postValues.push(validatedListing.description);
      }

      if (postUpdates.length) {
        postValues.push(currentListing.post_id);
        await client.query(
          `UPDATE posts
           SET ${postUpdates.join(', ')}, updated_at = NOW()
           WHERE id = $${postParam}`,
          postValues
        );
      }

      try {
        await client.query(
          `INSERT INTO listing_revisions (listing_id, revision_no, actor_id, change_summary, before_data, after_data)
           VALUES (
             $1,
             COALESCE((SELECT MAX(revision_no) + 1 FROM listing_revisions WHERE listing_id = $1), 1),
             $2,
             $3,
             $4::jsonb,
             $5::jsonb
           )`,
          [
            normalizedListingId,
            agentId,
            updateKeys.join(', '),
            JSON.stringify(listing),
            JSON.stringify(currentListing),
          ]
        );
      } catch {
        // Keep update path resilient when migration has not run yet.
      }

      return currentListing;
    });

    await EventLogService.log({
      eventType: 'LISTING_UPDATED',
      actorId: agentId,
      targetType: 'listing',
      targetId: normalizedListingId,
      payload: { fields: updateKeys, description_quality_score: descriptionQualityScore },
    });

    await EventLogService.log({
      eventType: 'LISTING_EDITED',
      actorId: agentId,
      targetType: 'listing',
      targetId: normalizedListingId,
      payload: { fields: updateKeys, spec_version: updated.spec_version },
    });

    return updated;
  }

  static async offShelf(listingId, agentId) {
    return this.updateListing(listingId, agentId, { status: ListingStatus.OFF_SHELF });
  }

  static async getPublicActivity(listingId, { limit = 20 } = {}) {
    const normalizedListingId = this.assertUuid(listingId, 'listingId');
    const listing = await queryOne(
      `SELECT
         l.id as listing_id,
         l.title,
         l.status as listing_status,
         l.listing_type,
         l.category,
         l.attributes,
         l.price_listed,
         l.description_quality_score,
         (
           SELECT COUNT(DISTINCT e.actor_id)::int
           FROM event_logs e
           WHERE e.event_type = 'LISTING_IMPRESSION'
             AND e.target_id = l.id
             AND e.actor_id IS NOT NULL
         ) AS unique_agent_views,
         (
           SELECT COUNT(*)::int
           FROM event_logs e
           WHERE e.event_type = 'LISTING_DETAIL_VIEW'
             AND e.target_id = l.id
             AND e.actor_id IS NOT NULL
         ) AS detail_agent_views,
         l.seller_id,
         a.name as seller_name
       FROM listings l
       JOIN agents a ON a.id = l.seller_id
       WHERE l.id = $1 OR l.post_id = $1`,
      [normalizedListingId]
    );

    if (!listing) {
      throw new NotFoundError('Listing');
    }

    const [conversations, latestOrder, reviews] = await Promise.all([
      queryAll(
        `SELECT
           c.id, c.state, c.created_at, c.updated_at,
           buyer.name as buyer_name,
           seller.name as seller_name,
           COALESCE(offer_stats.offer_rounds, 0) AS offer_rounds,
           offer_stats.latest_offer_price,
           offer_stats.final_price,
           latest_event.latest_event_type,
           latest_event.latest_event_at
         FROM conversations c
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
         WHERE c.listing_id = $1
         ORDER BY COALESCE(latest_event.latest_event_at, c.updated_at, c.created_at) DESC
         LIMIT $2`,
        [listing.listing_id, Math.min(Number(limit) || 20, 100)]
      ),
      queryOne(
        `SELECT id, status, amount, created_at, completed_at, refunded_at
         FROM orders
         WHERE listing_id = $1
         ORDER BY COALESCE(updated_at, completed_at, refunded_at, created_at) DESC
         LIMIT 1`,
        [listing.listing_id]
      ),
      queryAll(
        `SELECT r.id, r.rating, r.content, r.created_at,
                reviewer.name as reviewer_name
         FROM reviews r
         JOIN orders o ON o.id = r.order_id
         JOIN agents reviewer ON reviewer.id = r.reviewer_id
         WHERE o.listing_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2`,
        [listing.listing_id, Math.min(Number(limit) || 20, 100)]
      )
    ]);

    return {
      listing,
      conversations,
      latestOrder,
      reviews
    };
  }
}

module.exports = ListingService;
