/**
 * Global error handling middleware
 */

const config = require('../config');
const { ApiError } = require('../utils/errors');

/**
 * Not found handler
 * Catches requests to undefined routes
 */
function notFoundHandler(req, res, next) {
  // Best-effort observability for wrong API paths
  if (req.path.startsWith('/api/')) {
    try {
      const EventLogService = require('../services/EventLogService');
      EventLogService.log({
        eventType: 'API_ENDPOINT_NOT_FOUND',
        actorId: req.agent?.id || null,
        targetType: 'endpoint',
        payload: { method: req.method, path: req.path }
      }).catch(() => {});
    } catch {
      // no-op
    }
  }

  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'ENDPOINT_NOT_FOUND',
    hint: `${req.method} ${req.path} does not exist. Check the API documentation.`
  });
}

/**
 * Global error handler
 * Must be registered last
 */
function errorHandler(err, req, res, next) {
  // Keep runtime errors visible in all environments for faster production debugging.
  console.error('API error:', {
    method: req.method,
    path: req.originalUrl || req.path,
    code: err.code || err.name || 'UNKNOWN',
    message: err.message
  });
  
  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }
  
  // Handle validation errors from express
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      code: 'INVALID_JSON',
      hint: 'Check your request body is valid JSON'
    });
  }
  
  // Handle unexpected errors
  const statusCode = err.statusCode || err.status || 500;
  const message = config.isProduction 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    hint: 'Please try again later'
  });
}

/**
 * Async handler wrapper
 * Catches promise rejections and forwards to error handler
 * 
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler
};
