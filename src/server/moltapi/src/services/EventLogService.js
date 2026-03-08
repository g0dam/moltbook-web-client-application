const { queryAll, queryOne } = require('../config/database');
const { BadRequestError } = require('../utils/errors');

class EventLogService {
  static TOKEN_PATTERN = /moltbook_[a-f0-9]{64}/gi;
  static SECRET_KEY_PATTERN = /(token|authorization|api[_-]?key|secret|password)/i;

  static sanitizeText(value, maxLength = 1000) {
    const clipped = String(value ?? '').slice(0, maxLength);
    return clipped.replace(this.TOKEN_PATTERN, '[REDACTED_TOKEN]');
  }

  static sanitizePayloadValue(value, depth = 0) {
    if (depth > 4) return '[TRUNCATED_DEPTH]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return this.sanitizeText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => this.sanitizePayloadValue(item, depth + 1));
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).slice(0, 80);
      return Object.fromEntries(
        entries.map(([key, nestedValue]) => {
          if (this.SECRET_KEY_PATTERN.test(key)) {
            return [key, '[REDACTED]'];
          }
          return [key, this.sanitizePayloadValue(nestedValue, depth + 1)];
        })
      );
    }
    return String(value);
  }

  static normalizeTrackPayload(payload = {}) {
    if (payload === null || payload === undefined) return {};
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestError('payload must be an object');
    }
    const normalized = this.sanitizePayloadValue(payload, 0);
    const serialized = JSON.stringify(normalized);
    if (serialized.length > 12000) {
      throw new BadRequestError('payload is too large (max 12000 chars)');
    }
    return JSON.parse(serialized);
  }

  static async log({ eventType, actorId = null, targetType = null, targetId = null, payload = {} }) {
    return queryOne(
      `INSERT INTO event_logs (event_type, actor_id, target_type, target_id, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, event_type, actor_id, target_type, target_id, payload, created_at`,
      [eventType, actorId, targetType, targetId, payload]
    );
  }

  static async trackEvent({
    eventType,
    actorId = null,
    targetType = null,
    targetId = null,
    sessionId = null,
    locale = null,
    page = null,
    source = null,
    payload = {}
  }) {
    const normalizedPayload = this.normalizeTrackPayload(payload);
    const mergedPayload = this.normalizeTrackPayload({
      ...normalizedPayload,
      session_id: sessionId ? this.sanitizeText(sessionId, 120) : null,
      locale: locale ? this.sanitizeText(locale, 20) : null,
      page: page ? this.sanitizeText(page, 256) : null,
      source: source ? this.sanitizeText(source, 120) : null
    });

    const event = await this.log({
      eventType,
      actorId,
      targetType,
      targetId,
      payload: mergedPayload
    });

    const listingId = targetType === 'listing' ? targetId : payload.listing_id || payload.listingId || null;

    if (listingId && eventType === 'LISTING_IMPRESSION') {
      try {
        await queryOne(
          `INSERT INTO listing_impressions (listing_id, viewer_id, session_id, position, tab)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [listingId, actorId, sessionId, payload.position || null, payload.tab || null]
        );
      } catch {
        // table may not exist yet; keep event ingestion resilient
      }
    }

    if (listingId && eventType === 'LISTING_CLICK') {
      try {
        await queryOne(
          `INSERT INTO listing_clicks (listing_id, viewer_id, session_id, source)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [listingId, actorId, sessionId, source || payload.source || null]
        );
      } catch {
        // table may not exist yet; keep event ingestion resilient
      }
    }

    return event;
  }

  static async logOrderNudge({
    actorId = null,
    entityType = 'order',
    entityId = null,
    conversationId = null,
    waitingForRole,
    suggestedMessage,
    payload = {}
  }) {
    return this.log({
      eventType: 'ORDER_NUDGE_SENT',
      actorId,
      targetType: entityType,
      targetId: entityId,
      payload: {
        conversation_id: conversationId,
        waiting_for_role: waitingForRole,
        suggested_message: suggestedMessage,
        ...payload
      }
    });
  }

  static async logOrderOverdue({
    actorId = null,
    entityType = 'order',
    entityId = null,
    conversationId = null,
    taskType,
    ageSec,
    slaSec,
    payload = {}
  }) {
    return this.log({
      eventType: 'ORDER_ACTION_OVERDUE',
      actorId,
      targetType: entityType,
      targetId: entityId,
      payload: {
        conversation_id: conversationId,
        task_type: taskType,
        age_sec: ageSec,
        sla_sec: slaSec,
        ...payload
      }
    });
  }

  static async exportEvents({ eventType, eventTypes, from, to, limit = 1000, agentName = null, listingId = null }) {
    const filters = [];
    const params = [];
    let p = 1;

    if (eventType) {
      filters.push(`e.event_type = $${p++}`);
      params.push(eventType);
    }

    if (eventTypes) {
      const values = Array.isArray(eventTypes) ? eventTypes : String(eventTypes).split(',').map((item) => item.trim()).filter(Boolean);
      if (values.length) {
        filters.push(`e.event_type = ANY($${p++})`);
        params.push(values);
      }
    }

    if (from) {
      filters.push(`e.created_at >= $${p++}`);
      params.push(from);
    }

    if (to) {
      filters.push(`e.created_at <= $${p++}`);
      params.push(to);
    }

    if (agentName) {
      filters.push(`a.name = $${p++}`);
      params.push(String(agentName).toLowerCase());
    }

    if (listingId) {
      const normalizedListingId = String(listingId);
      filters.push(`(e.target_id::text = $${p} OR e.payload->>'listing_id' = $${p} OR e.payload->>'listingId' = $${p})`);
      params.push(normalizedListingId);
      p++;
    }

    params.push(Math.min(limit, 5000));

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return queryAll(
      `SELECT
         e.id,
         e.event_type,
         e.actor_id,
         e.target_type,
         e.target_id,
         e.payload,
         e.created_at,
         a.name as actor_name
       FROM event_logs e
       LEFT JOIN agents a ON a.id = e.actor_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${p}`,
      params
    );
  }
}

module.exports = EventLogService;
