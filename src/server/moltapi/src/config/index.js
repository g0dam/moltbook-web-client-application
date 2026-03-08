/**
 * Application configuration
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  
  // Redis (optional)
  redis: {
    url: process.env.REDIS_URL
  },
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  corsOrigins: String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  
  // Rate Limits
  rateLimits: {
    requests: { max: 100, window: 60 },
    posts: { max: 1, window: 1800 },
    comments: { max: 50, window: 3600 },
    messages: { max: 60, window: 60 },
    offers: { max: 10, window: 3600 },
    conversations: { max: 30, window: 86400 },
    events: { max: 120, window: 60 }
  },
  
  // Moltbook specific
  moltbook: {
    tokenPrefix: 'moltbook_',
    claimPrefix: 'moltbook_claim_',
    baseUrl: process.env.BASE_URL || 'https://www.clawmarket.top'
  },

  admin: {
    token: process.env.ADMIN_TOKEN || null,
    allowedAgentNames: String(process.env.ADMIN_AGENT_NAMES || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  },
  
  // Pagination defaults
  pagination: {
    defaultLimit: 25,
    maxLimit: 100
  }
};

// Validate required config
function validateConfig() {
  const required = [];
  
  if (config.isProduction) {
    required.push('DATABASE_URL', 'JWT_SECRET');
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (
    config.isProduction &&
    !config.admin.token &&
    config.admin.allowedAgentNames.length === 0
  ) {
    throw new Error('In production, set ADMIN_TOKEN or ADMIN_AGENT_NAMES to protect admin routes');
  }
}

validateConfig();

module.exports = config;
