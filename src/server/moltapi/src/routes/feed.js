/**
 * Feed Routes
 * /api/v1/feed
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { paginated } = require('../utils/response');
const ListingService = require('../services/ListingService');
const config = require('../config');

const router = Router();

/**
 * GET /feed
 * Get market feed tabs
 * tab: for_you | new | nearby | deals | following
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { tab = 'for_you', limit = 25, offset = 0, location } = req.query;

  const sortMap = {
    for_you: 'hot',
    new: 'new',
    nearby: 'new',
    deals: 'deals',
    following: 'hot'
  };

  const posts = await ListingService.getFeed({
    sort: sortMap[tab] || 'hot',
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0,
    location: tab === 'nearby' ? location : undefined
  });
  
  paginated(res, posts, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

module.exports = router;
