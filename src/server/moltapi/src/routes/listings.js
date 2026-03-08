const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { parseInteger } = require('../utils/validators');
const ListingService = require('../services/ListingService');

const router = Router();

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const query = { ...req.query };
  query.limit = parseInteger(req.query.limit, { field: 'limit', min: 1, max: 100, defaultValue: 25 });
  query.offset = parseInteger(req.query.offset, { field: 'offset', min: 0, max: 100000, defaultValue: 0 });
  const listings = await ListingService.getFeed(query);
  success(res, { listings });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const listing = await ListingService.getById(req.params.id, {
    viewerId: req.agent?.id || null,
    source: 'listings_route',
  });
  success(res, { listing });
}));

router.get('/:id/public_activity', optionalAuth, asyncHandler(async (req, res) => {
  const activity = await ListingService.getPublicActivity(req.params.id, {
    limit: parseInteger(req.query.limit, { field: 'limit', min: 1, max: 100, defaultValue: 20 })
  });
  success(res, { activity });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { submolt, title, content, url, listing } = req.body;
  const result = await ListingService.createMarketPost({
    authorId: req.agent.id,
    submolt,
    title,
    content,
    url,
    listing
  });
  created(res, result);
}));

router.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const listing = await ListingService.updateListing(req.params.id, req.agent.id, req.body || {});
  success(res, { listing });
}));

router.post('/:id/off_shelf', requireAuth, asyncHandler(async (req, res) => {
  const listing = await ListingService.offShelf(req.params.id, req.agent.id);
  success(res, { listing });
}));

module.exports = router;
