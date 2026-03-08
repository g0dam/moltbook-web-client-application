/**
 * Post Routes (Market-first)
 * /api/v1/posts/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { postLimiter, commentLimiter } = require('../middleware/rateLimit');
const { success, created, noContent, paginated } = require('../utils/response');
const { parseInteger } = require('../utils/validators');
const ListingService = require('../services/ListingService');
const CommentService = require('../services/CommentService');
const VoteService = require('../services/VoteService');
const config = require('../config');
const { queryOne } = require('../config/database');

const router = Router();

/**
 * GET /posts
 * Market feed (listings)
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const {
    sort = 'hot',
    limit = 25,
    offset = 0,
    category,
    price_min,
    price_max,
    condition,
    allow_bargain,
    has_images,
    location,
    status,
    listing_type,
    q
  } = req.query;

  const parsedLimit = parseInteger(limit, {
    field: 'limit',
    min: 1,
    max: config.pagination.maxLimit,
    defaultValue: config.pagination.defaultLimit
  });
  const parsedOffset = parseInteger(offset, {
    field: 'offset',
    min: 0,
    max: 100000,
    defaultValue: 0
  });

  const posts = await ListingService.getFeed({
    sort,
    limit: parsedLimit,
    offset: parsedOffset,
    category,
    price_min,
    price_max,
    condition,
    allow_bargain,
    has_images,
    location,
    status,
    listing_type,
    q
  });

  paginated(res, posts, { limit: parsedLimit, offset: parsedOffset });
}));

/**
 * POST /posts
 * Create market listing post
 */
router.post('/', requireAuth, postLimiter, asyncHandler(async (req, res) => {
  const { submolt, title, content, url, listing } = req.body;

  const result = await ListingService.createMarketPost({
    authorId: req.agent.id,
    submolt,
    title,
    content,
    url,
    listing: listing || {}
  });

  created(res, result);
}));

/**
 * GET /posts/:id
 * Get a listing post with listing fields
 */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const post = await ListingService.getById(req.params.id, {
    viewerId: req.agent?.id || null,
    source: 'posts_route',
  });

  const userVote = req.agent ? await VoteService.getVote(req.agent.id, post.id, 'post') : null;

  success(res, {
    post: {
      ...post,
      userVote
    }
  });
}));

/**
 * DELETE /posts/:id
 * Delete market post (seller only)
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const listing = await queryOne(
    `SELECT l.id as listing_id, l.seller_id, p.id as post_id
     FROM listings l
     JOIN posts p ON p.id = l.post_id
     WHERE p.id = $1 OR l.id = $1`,
    [req.params.id]
  );

  if (!listing || listing.seller_id !== req.agent.id) {
    return noContent(res);
  }

  await queryOne('DELETE FROM posts WHERE id = $1', [listing.post_id]);
  noContent(res);
}));

/**
 * POST /posts/:id/upvote
 */
router.post('/:id/upvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.upvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * POST /posts/:id/downvote
 */
router.post('/:id/downvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.downvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * GET /posts/:id/comments
 */
router.get('/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'top', limit = 100 } = req.query;
  const parsedLimit = parseInteger(limit, { field: 'limit', min: 1, max: 500, defaultValue: 100 });

  const comments = await CommentService.getByPost(req.params.id, {
    sort,
    limit: parsedLimit
  });

  success(res, { comments });
}));

/**
 * POST /posts/:id/comments
 */
router.post('/:id/comments', requireAuth, commentLimiter, asyncHandler(async (req, res) => {
  const { content, parent_id, parentId } = req.body;

  const comment = await CommentService.create({
    postId: req.params.id,
    authorId: req.agent.id,
    content,
    parentId: parent_id || parentId
  });

  created(res, { comment });
}));

module.exports = router;
