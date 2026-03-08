const { queryOne, queryAll } = require('../config/database');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { ConversationState, OfferStatus, ListingStatus } = require('../domain/marketStates');
const { parseNumber, parseInteger, parseText } = require('../utils/validators');
const ConversationService = require('./ConversationService');
const EventLogService = require('./EventLogService');
const RiskService = require('./RiskService');

class OfferService {
  static async expirePending() {
    return queryAll(
      `UPDATE offers
       SET status = 'EXPIRED', decided_at = NOW(), updated_at = NOW()
       WHERE status = 'PENDING' AND expires_at < NOW()
       RETURNING id, conversation_id`
    );
  }

  static async create({ conversationId, actorId, price, expiresInMinutes = 30, reasonCode = null }) {
    const normalizedPrice = parseNumber(price, {
      field: 'price',
      min: 0.01,
      max: 100000000
    });
    const normalizedExpiresMinutes = parseInteger(expiresInMinutes, {
      field: 'expires_in_minutes',
      min: 1,
      max: 1440,
      defaultValue: 30
    });
    const normalizedReasonCode = parseText(reasonCode, {
      field: 'reason_code',
      maxLength: 40,
      required: false
    }) || null;

    await this.expirePending();

    const conversation = await ConversationService.findById(conversationId, actorId);
    const listing = await queryOne('SELECT * FROM listings WHERE id = $1', [conversation.listing_id]);
    if (!listing) throw new NotFoundError('Listing');

    if (conversation.buyer_id === conversation.seller_id) {
      throw new BadRequestError('Self-negotiation is not allowed');
    }

    if (listing.seller_id === actorId && conversation.buyer_id === actorId) {
      throw new BadRequestError('You cannot bargain with your own listing');
    }

    if (listing.status === ListingStatus.OFF_SHELF || listing.status === ListingStatus.SOLD) {
      throw new BadRequestError('Listing is not available for negotiation');
    }
    if (!listing.allow_bargain && normalizedPrice !== Number(listing.price_listed)) {
      throw new BadRequestError('This listing does not allow bargaining. Offer must equal listing price.');
    }

    const pending = await queryOne(
      `SELECT id FROM offers WHERE conversation_id = $1 AND status = 'PENDING'`,
      [conversationId]
    );
    if (pending) {
      throw new BadRequestError('A pending offer already exists in this conversation');
    }

    const risk = await RiskService.evaluateOfferRisk({
      listingPrice: listing.price_listed,
      offerPrice: normalizedPrice,
      buyerId: conversation.buyer_id
    });

    const offer = await queryOne(
      `INSERT INTO offers (
        conversation_id, listing_id, buyer_id, seller_id, offered_by_id,
        offer_type, price, status, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'PENDING', NOW() + ($8 || ' minutes')::interval
      ) RETURNING *`,
      [
        conversationId,
        conversation.listing_id,
        conversation.buyer_id,
        conversation.seller_id,
        actorId,
        actorId === conversation.seller_id ? 'COUNTER' : 'OFFER',
        Number(normalizedPrice.toFixed(2)),
        String(normalizedExpiresMinutes)
      ]
    );

    await ConversationService.setState(conversationId, ConversationState.OFFER_PENDING);
    await ConversationService.addMessage({
      conversationId,
      senderId: actorId,
      messageType: 'OFFER',
      content: `Offer: ${Number(normalizedPrice).toFixed(2)}`,
      reasonCode: normalizedReasonCode,
      metadata: { offerId: offer.id, price: Number(normalizedPrice), risk }
    });

    await EventLogService.log({
      eventType: offer.offer_type === 'COUNTER' ? 'OFFER_COUNTERED' : 'OFFER_SENT',
      actorId,
      targetType: 'offer',
      targetId: offer.id,
      payload: {
        conversationId,
        listingId: conversation.listing_id,
        price: Number(normalizedPrice),
        offerType: offer.offer_type,
        offerStatus: offer.status,
        risk
      }
    });

    return { offer, risk };
  }

  static async getById(offerId) {
    const offer = await queryOne('SELECT * FROM offers WHERE id = $1', [offerId]);
    if (!offer) throw new NotFoundError('Offer');
    return offer;
  }

  static async decide({ offerId, actorId, decision, counterPrice = null }) {
    await this.expirePending();

    const offer = await this.getById(offerId);
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestError(`Offer is already ${offer.status}`);
    }

    const conversation = await ConversationService.findById(offer.conversation_id, actorId);
    if (conversation.buyer_id === conversation.seller_id) {
      throw new BadRequestError('Self-negotiation is not allowed');
    }
    const isSeller = actorId === conversation.seller_id;
    const isBuyer = actorId === conversation.buyer_id;

    if (!isSeller && !isBuyer) {
      throw new ForbiddenError('Not a participant in this offer');
    }

    if (decision === 'accept' && !isSeller) {
      throw new ForbiddenError('Only seller can accept offer');
    }

    if (decision === 'reject' && !isSeller && !isBuyer) {
      throw new ForbiddenError('Only participants can reject offer');
    }

    if (decision === 'counter') {
      if (!counterPrice) throw new BadRequestError('counterPrice is required for counter');
      if (!isSeller) throw new ForbiddenError('Only seller can counter offer');

      const normalizedCounterPrice = parseNumber(counterPrice, {
        field: 'counterPrice',
        min: 0.01,
        max: 100000000
      });

      await queryOne(
        `UPDATE offers SET status = 'REJECTED', decided_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [offerId]
      );

      return this.create({
        conversationId: offer.conversation_id,
        actorId,
        price: normalizedCounterPrice,
        reasonCode: 'COUNTER_OFFER'
      });
    }

    const status = decision === 'accept' ? OfferStatus.ACCEPTED : OfferStatus.REJECTED;

    const updatedOffer = await queryOne(
      `UPDATE offers
       SET status = $2, decided_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [offerId, status]
    );

    if (status === OfferStatus.ACCEPTED) {
      await queryOne(
        `UPDATE offers
         SET status = 'CANCELLED', decided_at = NOW(), updated_at = NOW()
         WHERE conversation_id = $1 AND status = 'PENDING' AND id <> $2`,
        [offer.conversation_id, offerId]
      );

      await queryOne('UPDATE listings SET status = $2, updated_at = NOW() WHERE id = $1', [offer.listing_id, ListingStatus.RESERVED]);
      await ConversationService.setState(offer.conversation_id, ConversationState.AGREED);

      await EventLogService.log({
        eventType: 'OFFER_ACCEPTED',
        actorId,
        targetType: 'offer',
        targetId: offerId,
        payload: {
          conversationId: offer.conversation_id,
          listingId: offer.listing_id,
          price: offer.price,
          offerStatus: status,
          pending_order_expected: true,
          accepted_at: updatedOffer.decided_at || new Date().toISOString()
        }
      });
    } else {
      await ConversationService.setState(offer.conversation_id, ConversationState.OPEN);
      await EventLogService.log({
        eventType: 'OFFER_REJECTED',
        actorId,
        targetType: 'offer',
        targetId: offerId,
        payload: {
          conversationId: offer.conversation_id,
          listingId: offer.listing_id,
          offerStatus: status
        }
      });
    }

    return updatedOffer;
  }

  static async listByConversation(conversationId, agentId) {
    await ConversationService.findById(conversationId, agentId);
    await this.expirePending();
    return queryAll(
      `SELECT * FROM offers WHERE conversation_id = $1 ORDER BY created_at DESC`,
      [conversationId]
    );
  }
}

module.exports = OfferService;
