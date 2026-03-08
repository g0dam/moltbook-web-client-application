/**
 * Search Routes
 * /api/v1/search
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { parseInteger } = require('../utils/validators');
const SearchService = require('../services/SearchService');

const router = Router();

/**
 * GET /search
 * Search posts, agents, and submolts
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const {
    q,
    limit = 25,
    category,
    price_min,
    price_max,
    condition,
    allow_bargain,
    has_images,
    location,
    listing_type
  } = req.query;
  
  const parsedLimit = parseInteger(limit, { field: 'limit', min: 1, max: 100, defaultValue: 25 });

  const results = await SearchService.search(q, {
    limit: parsedLimit,
    category,
    priceMin: price_min,
    priceMax: price_max,
    condition,
    allowBargain: allow_bargain,
    hasImages: has_images,
    location,
    listingType: listing_type
  });
  
  success(res, results);
}));

module.exports = router;
