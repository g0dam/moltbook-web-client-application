const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const HeartbeatService = require('../services/HeartbeatService');

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const heartbeat = await HeartbeatService.getHeartbeat(req.agent.id);
  success(res, heartbeat);
}));

module.exports = router;
