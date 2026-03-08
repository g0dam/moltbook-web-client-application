/**
 * MoltMarket lifecycle integration test (manual opt-in).
 *
 * Usage:
 *   RUN_LIFECYCLE_INTEGRATION=1 API_BASE=http://localhost:3000/api/v1 node test/api/lifecycle.integration.test.js
 */

/* eslint-disable no-console */

async function main() {
  if (process.env.RUN_LIFECYCLE_INTEGRATION !== '1') {
    console.log('SKIP lifecycle.integration.test.js (set RUN_LIFECYCLE_INTEGRATION=1 to run)');
    return;
  }

  const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
  const seed = Date.now();

  async function request(method, path, body, token) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(json)}`);
    }
    return json;
  }

  const sellerReg = await request('POST', '/agents/register', {
    name: `it_seller_${seed}`,
    description: 'seller',
    location: 'San Jose, US'
  });
  const buyerReg = await request('POST', '/agents/register', {
    name: `it_buyer_${seed}`,
    description: 'buyer',
    location: 'Austin, US'
  });
  const sellerKey = sellerReg.agent.api_key;
  const buyerKey = buyerReg.agent.api_key;

  const created = await request('POST', '/posts', {
    submolt: 'general',
    title: 'Integration listing',
    content: 'integration listing content',
    listing: {
      listing_type: 'SELL',
      category: 'electronics',
      price_listed: 199,
      allow_bargain: true,
      inventory_qty: 1,
      condition: 'used',
      location: 'San Jose',
      description: 'integration listing description',
      attributes: { brand: 'Test', model: 'T1', storage_gb: 128, purchase_year: 2024 },
      spec_version: 1
    }
  }, sellerKey);
  const listingId = created.listing.id;

  const conversation = await request('POST', `/conversations/listing/${listingId}`, null, buyerKey);
  const conversationId = conversation.conversation.id;

  const offer = await request('POST', `/conversations/${conversationId}/offers`, { price: 180, expires_in_minutes: 30 }, buyerKey);
  const offerId = offer.offer.id;
  await request('POST', `/conversations/offers/${offerId}/accept`, null, sellerKey);

  const order = await request('POST', '/orders', { offer_id: offerId }, buyerKey);
  const orderId = order.order.id;
  await request('POST', `/orders/${orderId}/pay`, null, buyerKey);
  await request('POST', `/orders/${orderId}/ship`, null, sellerKey);
  await request('POST', `/orders/${orderId}/deliver`, null, sellerKey);
  await request('POST', `/orders/${orderId}/confirm`, null, buyerKey);

  await request('POST', `/orders/${orderId}/return/request`, { reason_code: 'NOT_AS_DESCRIBED', detail: 'battery not stable' }, buyerKey);
  await request('POST', `/orders/${orderId}/return/approve`, { reason: 'accepted return' }, sellerKey);
  await request('POST', `/orders/${orderId}/return/ship_back`, { detail: 'return tracking virtual' }, buyerKey);
  await request('POST', `/orders/${orderId}/return/receive_back`, { detail: 'received back' }, sellerKey);
  const refunded = await request('POST', `/orders/${orderId}/refund`, null, sellerKey);

  if (refunded.order.status !== 'REFUNDED') {
    throw new Error(`expected REFUNDED, got ${refunded.order.status}`);
  }

  const publicConversation = await request('GET', `/conversations/${conversationId}/public`, null, null);
  if (!Array.isArray(publicConversation.timeline) || !publicConversation.timeline.length) {
    throw new Error('timeline should not be empty');
  }

  console.log('LIFECYCLE_INTEGRATION_OK');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
