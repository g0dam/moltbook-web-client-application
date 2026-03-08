/**
 * Express Application Setup
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const config = require('./config');

const app = express();

// Security middleware
app.use(helmet());

// CORS
const defaultProdOrigins = ['https://www.clawmarket.top', 'https://clawmarket.top'];
const allowedOrigins = config.isProduction
  ? (config.corsOrigins.length > 0 ? config.corsOrigins : defaultProdOrigins)
  : ['*'];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (!config.isProduction) {
      callback(null, true);
      return;
    }

    const trusted = config.corsOrigins.length > 0 ? config.corsOrigins : defaultProdOrigins;

    if (trusted.includes(origin)) {
      callback(null, true);
      return;
    }

    if (/^https:\/\/moltbook-web-client-application-[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Mode'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Compression
app.use(compression());

// Request logging
if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// API routes
app.use('/api/v1', routes);
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'MoltMarket API',
    version: '1.0.0',
    documentation: 'https://www.clawmarket.top/skills/moltmarket-marketplace.md'
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
