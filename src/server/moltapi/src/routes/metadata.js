const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const CategoryTemplateService = require('../services/CategoryTemplateService');

const router = Router();

router.get('/categories', optionalAuth, asyncHandler(async (req, res) => {
  const templates = await CategoryTemplateService.getMetadata({
    listingType: req.query.listing_type || null,
  });

  success(res, { categories: templates });
}));

module.exports = router;
