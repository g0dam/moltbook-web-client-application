/**
 * Moltbook API Test Suite
 * 
 * Run: npm test
 */

const { 
  generateApiKey, 
  generateClaimToken, 
  generateVerificationCode,
  validateApiKey,
  extractToken,
  hashToken
} = require('../../src/server/moltapi/src/utils/auth');
const fs = require('fs');
const path = require('path');

const {
  ApiError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError
} = require('../../src/server/moltapi/src/utils/errors');

const { OrderStatus, canTransitionOrder } = require('../../src/server/moltapi/src/domain/marketStates');
const {
  parseInteger,
  parseNumber,
  parseEnum,
  parseText
} = require('../../src/server/moltapi/src/utils/validators');

// Test framework
let passed = 0;
let failed = 0;
const tests = [];

function describe(name, fn) {
  tests.push({ type: 'describe', name });
  fn();
}

function test(name, fn) {
  tests.push({ type: 'test', name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('\nMoltbook API Test Suite\n');
  console.log('='.repeat(50));

  for (const item of tests) {
    if (item.type === 'describe') {
      console.log(`\n[${item.name}]\n`);
    } else {
      try {
        await item.fn();
        console.log(`  + ${item.name}`);
        passed++;
      } catch (error) {
        console.log(`  - ${item.name}`);
        console.log(`    Error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Tests

describe('Auth Utils', () => {
  test('generateApiKey creates valid key', () => {
    const key = generateApiKey();
    assert(key.startsWith('moltbook_'), 'Should have correct prefix');
    assertEqual(key.length, 73, 'Should have correct length');
  });

  test('generateClaimToken creates valid token', () => {
    const token = generateClaimToken();
    assert(token.startsWith('moltbook_claim_'), 'Should have correct prefix');
  });

  test('generateVerificationCode has correct format', () => {
    const code = generateVerificationCode();
    assert(/^[a-z]+-[A-F0-9]{4}$/.test(code), 'Should match pattern');
  });

  test('validateApiKey accepts valid key', () => {
    const key = generateApiKey();
    assert(validateApiKey(key), 'Should validate generated key');
  });

  test('validateApiKey rejects invalid key', () => {
    assert(!validateApiKey('invalid'), 'Should reject invalid');
    assert(!validateApiKey(null), 'Should reject null');
    assert(!validateApiKey('moltbook_short'), 'Should reject short key');
  });

  test('extractToken extracts from Bearer header', () => {
    const token = extractToken('Bearer moltbook_test123');
    assertEqual(token, 'moltbook_test123');
  });

  test('extractToken returns null for invalid header', () => {
    assertEqual(extractToken('Basic abc'), null);
    assertEqual(extractToken('Bearer'), null);
    assertEqual(extractToken(null), null);
  });

  test('hashToken creates consistent hash', () => {
    const hash1 = hashToken('test');
    const hash2 = hashToken('test');
    assertEqual(hash1, hash2, 'Same input should produce same hash');
  });
});

describe('Error Classes', () => {
  test('ApiError creates with status code', () => {
    const error = new ApiError('Test', 400);
    assertEqual(error.statusCode, 400);
    assertEqual(error.message, 'Test');
  });

  test('BadRequestError has status 400', () => {
    const error = new BadRequestError('Bad input');
    assertEqual(error.statusCode, 400);
  });

  test('NotFoundError has status 404', () => {
    const error = new NotFoundError('User');
    assertEqual(error.statusCode, 404);
    assert(error.message.includes('not found'));
  });

  test('UnauthorizedError has status 401', () => {
    const error = new UnauthorizedError();
    assertEqual(error.statusCode, 401);
  });

  test('ApiError toJSON returns correct format', () => {
    const error = new ApiError('Test', 400, 'TEST_CODE', 'Fix it');
    const json = error.toJSON();
    assertEqual(json.success, false);
    assertEqual(json.error, 'Test');
    assertEqual(json.code, 'TEST_CODE');
    assertEqual(json.hint, 'Fix it');
  });
});

describe('Config', () => {
  test('config loads without error', () => {
    const config = require('../../src/server/moltapi/src/config');
    assert(config.port, 'Should have port');
    assert(config.moltbook.tokenPrefix, 'Should have token prefix');
  });
});

describe('Validation Utils', () => {
  test('parseInteger enforces numeric range', () => {
    assertEqual(parseInteger('20', { field: 'limit', min: 1, max: 50 }), 20);
    let failed = false;
    try {
      parseInteger('0', { field: 'limit', min: 1, max: 50 });
    } catch (error) {
      failed = true;
      assert(error.message.includes('between 1 and 50'), 'Should report range requirement');
    }
    assert(failed, 'parseInteger should reject out-of-range value');
  });

  test('parseNumber rejects non-numeric values', () => {
    assertEqual(parseNumber('19.8', { field: 'price', min: 0 }), 19.8);
    let failed = false;
    try {
      parseNumber('abc', { field: 'price', min: 0 });
    } catch (error) {
      failed = true;
      assert(error.message.includes('valid number'), 'Should report invalid number');
    }
    assert(failed, 'parseNumber should reject non-numeric input');
  });

  test('parseEnum normalizes and validates options', () => {
    assertEqual(
      parseEnum('completed', ['COMPLETED', 'ALL'], { field: 'status', normalize: 'upper' }),
      'COMPLETED'
    );
    let failed = false;
    try {
      parseEnum('unknown', ['COMPLETED', 'ALL'], { field: 'status', normalize: 'upper' });
    } catch (error) {
      failed = true;
      assert(error.message.includes('must be one of'), 'Should report valid enum set');
    }
    assert(failed, 'parseEnum should reject unsupported value');
  });

  test('parseText trims and clips by max length', () => {
    assertEqual(parseText('  hello  ', { field: 'msg', maxLength: 10 }), 'hello');
    let failed = false;
    try {
      parseText('x'.repeat(11), { field: 'msg', maxLength: 10 });
    } catch (error) {
      failed = true;
      assert(error.message.includes('at most 10'), 'Should enforce max length');
    }
    assert(failed, 'parseText should reject overly long text');
  });
});

describe('Market State Machine', () => {
  test('allows valid order transitions', () => {
    assert(canTransitionOrder(OrderStatus.OFFER_ACCEPTED, OrderStatus.PAID_IN_ESCROW), 'should allow pay after offer accepted');
    assert(canTransitionOrder(OrderStatus.PAID_IN_ESCROW, OrderStatus.SHIPPED), 'should allow ship after payment');
    assert(canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.CONFIRMED), 'should allow buyer confirm after delivery');
    assert(canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.COMPLETED), 'should allow complete after confirm');
    assert(canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.RETURN_REQUESTED), 'should allow return request after confirm');
    assert(canTransitionOrder(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURN_APPROVED), 'should allow seller approve return');
    assert(canTransitionOrder(OrderStatus.RETURN_APPROVED, OrderStatus.RETURN_SHIPPED_BACK), 'should allow buyer ship return');
    assert(canTransitionOrder(OrderStatus.RETURN_SHIPPED_BACK, OrderStatus.RETURN_RECEIVED_BACK), 'should allow seller receive return');
    assert(canTransitionOrder(OrderStatus.RETURN_RECEIVED_BACK, OrderStatus.REFUNDED), 'should allow refund after return received');
  });

  test('rejects invalid order transitions', () => {
    assert(!canTransitionOrder(OrderStatus.OFFER_ACCEPTED, OrderStatus.COMPLETED), 'should not skip to completed');
    assert(!canTransitionOrder(OrderStatus.SHIPPED, OrderStatus.PAID_IN_ESCROW), 'should not rollback to paid');
    assert(!canTransitionOrder(OrderStatus.REFUNDED, OrderStatus.COMPLETED), 'refunded is terminal');
    assert(!canTransitionOrder(OrderStatus.RETURN_APPROVED, OrderStatus.COMPLETED), 'should not jump from return approved to completed');
  });
});

describe('Market Route Contract', () => {
  test('core market routes are mounted under /api/v1', () => {
    const routesIndexPath = path.join(__dirname, '../../src/server/moltapi/src/routes/index.js');
    const content = fs.readFileSync(routesIndexPath, 'utf8');

    [
      "router.use('/posts', postRoutes)",
      "router.use('/conversations', conversationRoutes)",
      "router.use('/orders', orderRoutes)",
      "router.use('/wallet', walletRoutes)",
      "router.use('/reviews', reviewRoutes)",
      "router.use('/admin', adminRoutes)",
      "router.use('/events', eventRoutes)",
      "router.use('/metadata', metadataRoutes)",
      "router.use('/agents/me/heartbeat', heartbeatRoutes)"
    ].forEach((entry) => {
      assert(content.includes(entry), `Missing route mount: ${entry}`);
    });
  });

  test('agents route exposes public overview and timeline endpoints', () => {
    const agentsRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/agents.js');
    const content = fs.readFileSync(agentsRoutePath, 'utf8');

    [
      "router.get('/:name/overview'",
      "router.get('/:name/listings'",
      "router.get('/:name/orders'",
      "router.get('/:name/activity'",
      "router.get('/:name/conversations'"
    ].forEach((entry) => {
      assert(content.includes(entry), `Missing public agent endpoint: ${entry}`);
    });
  });

  test('agent registration requires location field', () => {
    const servicePath = path.join(__dirname, '../../src/server/moltapi/src/services/AgentService.js');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    assert(serviceContent.includes('Location is required'), 'AgentService should enforce location at registration');
  });

  test('app mounts API router at /api/v1 and /api compatibility path', () => {
    const appPath = path.join(__dirname, '../../src/server/moltapi/src/app.js');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert(appContent.includes("app.use('/api/v1', routes)"), 'API router should be mounted at /api/v1');
    assert(appContent.includes("app.use('/api', routes)"), 'API router should be mounted at /api for compatibility');
  });

  test('posts route supports listing_type filtering and camelCase comment reply compatibility', () => {
    const postsRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/posts.js');
    const content = fs.readFileSync(postsRoutePath, 'utf8');

    assert(content.includes('listing_type'), 'posts route should accept listing_type query filter');
    assert(content.includes('parentId'), 'posts route should accept parentId in comment payload');
  });

  test('feed metrics keep anonymous impressions/detail views and unique viewer fallback', () => {
    const servicePath = path.join(__dirname, '../../src/server/moltapi/src/services/ListingService.js');
    const content = fs.readFileSync(servicePath, 'utf8');

    const impressionSlice = content.match(/event_type = 'LISTING_IMPRESSION'[\s\S]*?as impressions_7d/);
    const detailSlice = content.match(/event_type = 'LISTING_DETAIL_VIEW'[\s\S]*?as detail_agent_views_7d/);
    const uniqueSlice = content.match(/event_type = 'LISTING_IMPRESSION'[\s\S]*?as unique_agent_views_7d/);

    assert(impressionSlice, 'should define impressions_7d query');
    assert(detailSlice, 'should define detail_agent_views_7d query');
    assert(uniqueSlice, 'should define unique_agent_views_7d query');

    assert(!impressionSlice[0].includes('AND e.actor_id IS NOT NULL'), 'impressions_7d should include anonymous traffic');
    assert(!detailSlice[0].includes('AND e.actor_id IS NOT NULL'), 'detail_agent_views_7d should include anonymous traffic');
    assert(uniqueSlice[0].includes("payload->>'session_id'"), 'unique_agent_views_7d should fallback to session_id when actor is absent');
    assert(content.includes('as seller_conversations_7d'), 'feed should expose seller_conversations_7d fallback metric');
    assert(content.includes('as seller_completed_orders_7d'), 'feed should expose seller_completed_orders_7d fallback metric');
    assert(content.includes('as platform_conversations_7d'), 'feed should expose platform_conversations_7d fallback metric');
    assert(content.includes('as platform_completed_orders_7d'), 'feed should expose platform_completed_orders_7d fallback metric');
  });

  test('search route forwards listing_type to service', () => {
    const searchRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/search.js');
    const content = fs.readFileSync(searchRoutePath, 'utf8');

    assert(content.includes('listing_type'), 'search route should accept listing_type query filter');
    assert(content.includes('listingType: listing_type'), 'search route should map listing_type to listingType');
  });

  test('public conversation contract includes timeline and insights payload', () => {
    const servicePath = path.join(__dirname, '../../src/server/moltapi/src/services/ConversationService.js');
    const routePath = path.join(__dirname, '../../src/server/moltapi/src/routes/conversations.js');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    const routeContent = fs.readFileSync(routePath, 'utf8');

    assert(routeContent.includes("router.get('/:id/public'"), 'conversations route should expose public detail endpoint');
    assert(routeContent.includes("router.get('/public-stream'"), 'conversations route should expose public stream endpoint');
    assert(serviceContent.includes('buildTimeline('), 'ConversationService should implement buildTimeline');
    assert(serviceContent.includes('buildInsights('), 'ConversationService should implement buildInsights');
    assert(serviceContent.includes('buildPreviewSegments('), 'ConversationService should implement buildPreviewSegments');
    assert(serviceContent.includes('timeline,'), 'public conversation should return timeline');
    assert(serviceContent.includes('insights,'), 'public conversation should return insights');
    assert(serviceContent.includes('participants'), 'public conversation should return participants');
  });

  test('metadata and heartbeat routes expose PRD endpoints', () => {
    const metadataRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/metadata.js');
    const heartbeatRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/heartbeat.js');
    const metadataContent = fs.readFileSync(metadataRoutePath, 'utf8');
    const heartbeatContent = fs.readFileSync(heartbeatRoutePath, 'utf8');

    assert(metadataContent.includes("router.get('/categories'"), 'metadata route should expose /categories');
    assert(heartbeatContent.includes('HeartbeatService.getHeartbeat'), 'heartbeat route should call HeartbeatService');
  });

  test('events route allows listing health and heartbeat event types', () => {
    const eventsRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/events.js');
    const content = fs.readFileSync(eventsRoutePath, 'utf8');

    [
      'LISTING_DETAIL_VIEW',
      'LISTING_EDITED',
      'LISTING_HEALTH_ALERT',
      'LISTING_OPTIMIZATION_SUGGESTED',
      'HEARTBEAT_PULL',
      'ORDER_RETURN_REQUESTED',
      'ORDER_RETURN_APPROVED',
      'ORDER_RETURN_REJECTED',
      'ORDER_RETURN_SHIPPED_BACK',
      'ORDER_RETURN_RECEIVED_BACK',
      'ORDER_NUDGE_SENT',
      'ORDER_ACTION_OVERDUE'
    ].forEach((entry) => {
      assert(content.includes(entry), `Missing event type in events route: ${entry}`);
    });
  });

  test('orders route exposes manual completion and return flow endpoints', () => {
    const ordersRoutePath = path.join(__dirname, '../../src/server/moltapi/src/routes/orders.js');
    const content = fs.readFileSync(ordersRoutePath, 'utf8');
    [
      "router.post('/:id/complete'",
      "router.post('/:id/return/request'",
      "router.post('/:id/return/approve'",
      "router.post('/:id/return/reject'",
      "router.post('/:id/return/ship_back'",
      "router.post('/:id/return/receive_back'"
    ].forEach((entry) => {
      assert(content.includes(entry), `Missing orders endpoint: ${entry}`);
    });
    assert(content.includes('conversation_message'), 'orders route should support conversation_message payload');
    assert(content.includes('conversation_reason_code'), 'orders route should support conversation_reason_code payload');
  });

  test('conversation and offer services forbid self-negotiation on own listing', () => {
    const conversationServicePath = path.join(__dirname, '../../src/server/moltapi/src/services/ConversationService.js');
    const offerServicePath = path.join(__dirname, '../../src/server/moltapi/src/services/OfferService.js');
    const conversationContent = fs.readFileSync(conversationServicePath, 'utf8');
    const offerContent = fs.readFileSync(offerServicePath, 'utf8');

    assert(
      conversationContent.includes('You cannot start conversation on your own listing'),
      'ConversationService should reject self-started negotiation'
    );
    assert(
      offerContent.includes('Self-negotiation is not allowed'),
      'OfferService should reject self-negotiation'
    );
    assert(
      offerContent.includes('You cannot bargain with your own listing'),
      'OfferService should reject own-listing bargaining'
    );
  });
});

// Run
runTests();
