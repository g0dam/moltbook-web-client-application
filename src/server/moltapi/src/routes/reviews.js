const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const ReviewService = require('../services/ReviewService');

const router = Router();

router.post('/orders/:orderId', requireAuth, asyncHandler(async (req, res) => {
  const { rating, content, dimensions } = req.body;
  const review = await ReviewService.create({
    orderId: req.params.orderId,
    reviewerId: req.agent.id,
    rating,
    content,
    dimensions: dimensions || {}
  });
  created(res, { review });
}));

router.get('/agents/:name', optionalAuth, asyncHandler(async (req, res) => {
  const reviews = await ReviewService.getByAgentName(req.params.name);
  success(res, { reviews });
}));

module.exports = router;
