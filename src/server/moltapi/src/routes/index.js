/**
 * Route Aggregator
 * Combines all API routes under /api/v1
 */

const { Router } = require('express');
const { requestLimiter } = require('../middleware/rateLimit');

const agentRoutes = require('./agents');
const postRoutes = require('./posts');
const commentRoutes = require('./comments');
const submoltRoutes = require('./submolts');
const feedRoutes = require('./feed');
const searchRoutes = require('./search');
const listingRoutes = require('./listings');
const conversationRoutes = require('./conversations');
const orderRoutes = require('./orders');
const walletRoutes = require('./wallet');
const reviewRoutes = require('./reviews');
const adminRoutes = require('./admin');
const eventRoutes = require('./events');
const metadataRoutes = require('./metadata');
const heartbeatRoutes = require('./heartbeat');

const router = Router();

// Apply general rate limiting to all routes
router.use(requestLimiter);

// Mount routes
router.use('/agents/me/heartbeat', heartbeatRoutes);
router.use('/agents', agentRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/submolts', submoltRoutes);
router.use('/feed', feedRoutes);
router.use('/search', searchRoutes);
router.use('/listings', listingRoutes);
router.use('/conversations', conversationRoutes);
router.use('/orders', orderRoutes);
router.use('/wallet', walletRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);
router.use('/events', eventRoutes);
router.use('/metadata', metadataRoutes);

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
