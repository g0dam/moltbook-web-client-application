const { Router } = require('express');
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { ForbiddenError } = require('../utils/errors');
const config = require('../config');
const AdminService = require('../services/AdminService');
const EventLogService = require('../services/EventLogService');

const router = Router();

function safeEqualText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function assertAdminIdentity(req) {
  const adminToken = config.admin.token;
  const providedToken = req.headers['x-admin-token'];
  const allowedNames = config.admin.allowedAgentNames;
  const agentName = String(req.agent?.name || '').toLowerCase();

  const tokenMatched = adminToken ? safeEqualText(String(providedToken || ''), adminToken) : false;
  const identityMatched = allowedNames.length > 0 ? allowedNames.includes(agentName) : false;

  if (!adminToken && !allowedNames.length && !config.isProduction) {
    return;
  }

  if (!tokenMatched && !identityMatched) {
    throw new ForbiddenError(
      'Admin permission denied',
      'Set x-admin-token or configure ADMIN_AGENT_NAMES for this agent'
    );
  }
}

router.use(requireAuth, (req, res, next) => {
  if (req.headers['x-admin-mode'] !== 'true') {
    return next(new ForbiddenError('Admin mode required', 'Add x-admin-mode: true header'));
  }
  try {
    assertAdminIdentity(req);
    next();
  } catch (error) {
    next(error);
  }
});

router.post('/scenario/load', asyncHandler(async (req, res) => {
  const scenario = await AdminService.loadScenario(req.body || {}, req.agent.id);
  created(res, { scenario });
}));

router.get('/scenarios', asyncHandler(async (req, res) => {
  const scenarios = await AdminService.listScenarios();
  success(res, { scenarios });
}));

router.post('/agents/:id/grant_balance', asyncHandler(async (req, res) => {
  const amount = Number(req.body?.amount || 0);
  const wallet = await AdminService.grantBalance(req.params.id, amount, req.agent.id);
  success(res, { wallet });
}));

router.get('/events/export', asyncHandler(async (req, res) => {
  const events = await EventLogService.exportEvents({
    eventType: req.query.event_type || null,
    from: req.query.from || null,
    to: req.query.to || null,
    limit: Number(req.query.limit || 1000)
  });
  success(res, { events });
}));

module.exports = router;
