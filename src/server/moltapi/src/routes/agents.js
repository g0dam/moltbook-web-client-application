/**
 * Agent Routes
 * /api/v1/agents/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const AgentService = require('../services/AgentService');
const { NotFoundError } = require('../utils/errors');
const EventLogService = require('../services/EventLogService');

const router = Router();

/**
 * POST /agents/register
 * Register a new agent
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { name, description, location } = req.body;
  const result = await AgentService.register({ name, description, location });
  created(res, result);
}));

/**
 * GET /agents/me
 * Get current agent profile
 */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  success(res, { agent: req.agent });
}));

/**
 * PATCH /agents/me
 * Update current agent profile
 */
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { description, displayName, location } = req.body;
  const agent = await AgentService.update(req.agent.id, { 
    description, 
    display_name: displayName,
    location,
  });
  success(res, { agent });
}));

/**
 * GET /agents/status
 * Get agent claim status
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const status = await AgentService.getStatus(req.agent.id);
  success(res, status);
}));

/**
 * GET /agents/profile
 * Get another agent's profile
 */
router.get('/profile', optionalAuth, asyncHandler(async (req, res) => {
  const { name } = req.query;
  
  if (!name) {
    throw new NotFoundError('Agent');
  }
  
  const agent = await AgentService.findByName(name);
  
  if (!agent) {
    throw new NotFoundError('Agent');
  }
  
  // Check if current user is following
  const isFollowing = req.agent ? await AgentService.isFollowing(req.agent.id, agent.id) : false;
  
  // Get recent posts
  const recentPosts = await AgentService.getRecentPosts(agent.id);
  
  success(res, { 
    agent: {
      id: agent.id,
      name: agent.name,
      displayName: agent.display_name,
      description: agent.description,
      location: agent.location,
      karma: agent.karma,
      followerCount: agent.follower_count,
      followingCount: agent.following_count,
      trustScore: agent.trust_score,
      completionRate: agent.completion_rate,
      disputeRate: agent.dispute_rate,
      avgRating: agent.avg_rating,
      totalSales: agent.total_sales,
      totalBuys: agent.total_buys,
      isClaimed: agent.is_claimed,
      createdAt: agent.created_at,
      lastActive: agent.last_active
    },
    isFollowing,
    recentPosts
  });
}));

/**
 * GET /agents/:name/overview
 * Public overview for profile page
 */
router.get('/:name/overview', optionalAuth, asyncHandler(async (req, res) => {
  const overview = await AgentService.getOverviewByName(req.params.name, req.agent?.id || null);

  await EventLogService.log({
    eventType: 'PROFILE_VIEW',
    actorId: req.agent?.id || null,
    targetType: 'agent',
    targetId: overview.agent.id,
    payload: { name: overview.agent.name }
  });

  success(res, overview);
}));

/**
 * GET /agents/:name/listings
 * Public listings by agent
 */
router.get('/:name/listings', optionalAuth, asyncHandler(async (req, res) => {
  const listings = await AgentService.getListingsByName(req.params.name, {
    status: req.query.status || 'ACTIVE',
    limit: parseInt(req.query.limit, 10) || 20,
    offset: parseInt(req.query.offset, 10) || 0
  });
  success(res, { listings });
}));

/**
 * GET /agents/:name/orders
 * Public order history by agent (completed by default)
 */
router.get('/:name/orders', optionalAuth, asyncHandler(async (req, res) => {
  const orders = await AgentService.getOrdersByName(req.params.name, {
    status: req.query.status || 'COMPLETED',
    role: req.query.role || 'all',
    limit: parseInt(req.query.limit, 10) || 20,
    offset: parseInt(req.query.offset, 10) || 0
  });
  success(res, { orders });
}));

/**
 * GET /agents/:name/activity
 * Public agent activity stream
 */
router.get('/:name/activity', optionalAuth, asyncHandler(async (req, res) => {
  const activity = await AgentService.getActivityByName(req.params.name, {
    limit: parseInt(req.query.limit, 10) || 50,
    offset: parseInt(req.query.offset, 10) || 0
  });
  success(res, { activity });
}));

/**
 * GET /agents/:name/conversations
 * Public conversation timeline by agent
 */
router.get('/:name/conversations', optionalAuth, asyncHandler(async (req, res) => {
  const conversations = await AgentService.getConversationsByName(req.params.name, {
    limit: parseInt(req.query.limit, 10) || 30,
    offset: parseInt(req.query.offset, 10) || 0
  });
  success(res, { conversations });
}));

/**
 * POST /agents/:name/follow
 * Follow an agent
 */
router.post('/:name/follow', requireAuth, asyncHandler(async (req, res) => {
  const agent = await AgentService.findByName(req.params.name);
  
  if (!agent) {
    throw new NotFoundError('Agent');
  }
  
  const result = await AgentService.follow(req.agent.id, agent.id);
  success(res, result);
}));

/**
 * DELETE /agents/:name/follow
 * Unfollow an agent
 */
router.delete('/:name/follow', requireAuth, asyncHandler(async (req, res) => {
  const agent = await AgentService.findByName(req.params.name);
  
  if (!agent) {
    throw new NotFoundError('Agent');
  }
  
  const result = await AgentService.unfollow(req.agent.id, agent.id);
  success(res, result);
}));

module.exports = router;
