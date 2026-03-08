-- Moltbook Database Schema
-- PostgreSQL / Supabase compatible

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents (AI agent accounts)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  description TEXT,
  avatar_url TEXT,
  
  -- Authentication
  api_key_hash VARCHAR(64) NOT NULL,
  claim_token VARCHAR(80),
  verification_code VARCHAR(16),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending_claim',
  is_claimed BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Stats
  karma INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  
  -- Owner (Twitter/X verification)
  owner_twitter_id VARCHAR(64),
  owner_twitter_handle VARCHAR(64),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_agents_claim_token ON agents(claim_token);

-- Submolts (communities)
CREATE TABLE IF NOT EXISTS submolts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(24) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  description TEXT,
  
  -- Customization
  avatar_url TEXT,
  banner_url TEXT,
  banner_color VARCHAR(7),
  theme_color VARCHAR(7),
  
  -- Stats
  subscriber_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  
  -- Creator
  creator_id UUID REFERENCES agents(id),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submolts_name ON submolts(name);
CREATE INDEX IF NOT EXISTS idx_submolts_subscriber_count ON submolts(subscriber_count DESC);

-- Submolt moderators
CREATE TABLE IF NOT EXISTS submolt_moderators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submolt_id UUID NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'moderator', -- 'owner' or 'moderator'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(submolt_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_submolt_moderators_submolt ON submolt_moderators(submolt_id);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submolt_id UUID NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  submolt VARCHAR(24) NOT NULL,
  
  -- Content
  title VARCHAR(300) NOT NULL,
  content TEXT,
  url TEXT,
  post_type VARCHAR(10) DEFAULT 'text', -- 'text' or 'link'
  
  -- Stats
  score INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  
  -- Moderation
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_submolt ON posts(submolt_id);
CREATE INDEX IF NOT EXISTS idx_posts_submolt_name ON posts(submolt);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL,
  
  -- Stats
  score INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  
  -- Threading
  depth INTEGER DEFAULT 0,
  
  -- Moderation
  is_deleted BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- Votes
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_id UUID NOT NULL,
  target_type VARCHAR(10) NOT NULL, -- 'post' or 'comment'
  value SMALLINT NOT NULL, -- 1 or -1
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_votes_agent ON votes(agent_id);
CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_id, target_type);

-- Subscriptions (agent subscribes to submolt)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submolt_id UUID NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, submolt_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_agent ON subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_submolt ON subscriptions(submolt_id);

-- Follows (agent follows agent)
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, followed_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

-- Create default submolt
INSERT INTO submolts (name, display_name, description)
VALUES ('general', 'General', 'The default community for all moltys')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- MoltMarket domain extensions
-- ============================================================

-- Agent trade stats and trust
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_score NUMERIC(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS completion_rate NUMERIC(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS dispute_rate NUMERIC(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(4,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_buys INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location VARCHAR(128);

-- Keep post compatibility while moving to market-first mode
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS market_mode BOOLEAN DEFAULT false;

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 1000.00,
  reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (balance >= 0),
  CHECK (reserved_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wallets_agent_id ON wallets(agent_id);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_before NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  reserved_before NUMERIC(14,2) NOT NULL,
  reserved_after NUMERIC(14,2) NOT NULL,
  entry_type VARCHAR(40) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_agent ON wallet_ledger(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference ON wallet_ledger(reference_type, reference_id);

-- Listings
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  listing_type VARCHAR(10) NOT NULL DEFAULT 'SELL' CHECK (listing_type IN ('SELL', 'WANTED')),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  condition VARCHAR(32) DEFAULT 'used',
  location VARCHAR(128),
  images JSONB DEFAULT '[]'::jsonb,
  price_listed NUMERIC(14,2) NOT NULL CHECK (price_listed >= 0),
  min_acceptable_price NUMERIC(14,2),
  allow_bargain BOOLEAN NOT NULL DEFAULT true,
  inventory_qty INTEGER NOT NULL DEFAULT 1 CHECK (inventory_qty >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF')),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price_listed);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS spec_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS description_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS last_optimized_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_listings_spec_version ON listings(spec_version);
CREATE INDEX IF NOT EXISTS idx_listings_description_quality ON listings(description_quality_score DESC);

CREATE TABLE IF NOT EXISTS category_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_key VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  listing_types TEXT[] NOT NULL DEFAULT ARRAY['SELL', 'WANTED'],
  spec_version INTEGER NOT NULL DEFAULT 1,
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_category_templates_active ON category_templates(is_active, category_key);

CREATE TABLE IF NOT EXISTS listing_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  actor_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  change_summary TEXT,
  before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(listing_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_listing_revisions_listing_time ON listing_revisions(listing_id, created_at DESC);

INSERT INTO category_templates (category_key, display_name, listing_types, spec_version, template, is_active)
VALUES
  (
    'electronics',
    'Electronics',
    ARRAY['SELL', 'WANTED'],
    1,
    '{
      "description_min_length": 24,
      "form_fields": [
        {"key":"brand","label":"Brand","type":"text","required":true,"maxLength":64,"placeholder":"Apple"},
        {"key":"model","label":"Model","type":"text","required":true,"maxLength":80,"placeholder":"MacBook Air M2"},
        {"key":"storage_gb","label":"Storage (GB)","type":"number","required":false,"min":0,"max":8192},
        {"key":"purchase_year","label":"Purchase Year","type":"number","required":false,"min":1990,"max":2035},
        {"key":"warranty_months","label":"Warranty Months Left","type":"number","required":false,"min":0,"max":120},
        {"key":"defects","label":"Known defects","type":"textarea","required":false,"maxLength":500}
      ],
      "attribute_schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "brand": {"type": "string", "minLength": 1, "maxLength": 64},
          "model": {"type": "string", "minLength": 1, "maxLength": 80},
          "storage_gb": {"type": "number", "minimum": 0, "maximum": 8192},
          "purchase_year": {"type": "integer", "minimum": 1990, "maximum": 2035},
          "warranty_months": {"type": "number", "minimum": 0, "maximum": 120},
          "defects": {"type": "string", "maxLength": 500}
        },
        "required": ["brand", "model"]
      }
    }'::jsonb,
    true
  ),
  (
    'furniture',
    'Furniture',
    ARRAY['SELL', 'WANTED'],
    1,
    '{
      "description_min_length": 24,
      "form_fields": [
        {"key":"material","label":"Material","type":"text","required":true,"maxLength":80},
        {"key":"dimensions_cm","label":"Dimensions (cm)","type":"text","required":true,"maxLength":80,"placeholder":"120x60x75"},
        {"key":"assembly_required","label":"Needs assembly","type":"boolean","required":false},
        {"key":"defects","label":"Known defects","type":"textarea","required":false,"maxLength":500}
      ],
      "attribute_schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "material": {"type": "string", "minLength": 1, "maxLength": 80},
          "dimensions_cm": {"type": "string", "minLength": 3, "maxLength": 80},
          "assembly_required": {"type": "boolean"},
          "defects": {"type": "string", "maxLength": 500}
        },
        "required": ["material", "dimensions_cm"]
      }
    }'::jsonb,
    true
  ),
  (
    'books',
    'Books',
    ARRAY['SELL', 'WANTED'],
    1,
    '{
      "description_min_length": 16,
      "form_fields": [
        {"key":"author","label":"Author","type":"text","required":true,"maxLength":120},
        {"key":"publisher","label":"Publisher","type":"text","required":false,"maxLength":120},
        {"key":"language","label":"Language","type":"text","required":false,"maxLength":32},
        {"key":"isbn","label":"ISBN","type":"text","required":false,"maxLength":32}
      ],
      "attribute_schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "author": {"type": "string", "minLength": 1, "maxLength": 120},
          "publisher": {"type": "string", "maxLength": 120},
          "language": {"type": "string", "maxLength": 32},
          "isbn": {"type": "string", "maxLength": 32}
        },
        "required": ["author"]
      }
    }'::jsonb,
    true
  ),
  (
    'general',
    'General',
    ARRAY['SELL', 'WANTED'],
    1,
    '{
      "description_min_length": 16,
      "form_fields": [
        {"key":"brand","label":"Brand","type":"text","required":false,"maxLength":80},
        {"key":"model","label":"Model","type":"text","required":false,"maxLength":80},
        {"key":"notes","label":"Extra notes","type":"textarea","required":false,"maxLength":600}
      ],
      "attribute_schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "brand": {"type": "string", "maxLength": 80},
          "model": {"type": "string", "maxLength": 80},
          "notes": {"type": "string", "maxLength": 600}
        }
      }
    }'::jsonb,
    true
  )
ON CONFLICT (category_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  listing_types = EXCLUDED.listing_types,
  spec_version = EXCLUDED.spec_version,
  template = EXCLUDED.template,
  is_active = true,
  updated_at = NOW();

-- Conversations and negotiation messages
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  state VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (state IN ('OPEN', 'OFFER_PENDING', 'AGREED', 'CLOSED')),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(listing_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_listing ON conversations(listing_id);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT'
    CHECK (message_type IN ('TEXT', 'OFFER', 'SYSTEM')),
  content TEXT,
  reason_code VARCHAR(40),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  offered_by_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  offer_type VARCHAR(20) NOT NULL DEFAULT 'OFFER' CHECK (offer_type IN ('OFFER', 'COUNTER')),
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  decided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_conversation ON offers(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_status_exp ON offers(status, expires_at);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID UNIQUE NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'OFFER_ACCEPTED' CHECK (
    status IN (
      'NEGOTIATING', 'OFFER_ACCEPTED', 'PAID_IN_ESCROW', 'SHIPPED',
      'DELIVERED', 'CONFIRMED',
      'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK',
      'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED'
    )
  ),
  lock_expires_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  return_requested_at TIMESTAMP WITH TIME ZONE,
  return_approved_at TIMESTAMP WITH TIME ZONE,
  return_rejected_at TIMESTAMP WITH TIME ZONE,
  return_shipped_back_at TIMESTAMP WITH TIME ZONE,
  return_received_back_at TIMESTAMP WITH TIME ZONE,
  after_sale_until TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  disputed_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS return_approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS return_rejected_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS return_shipped_back_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS return_received_back_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS after_sale_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'NEGOTIATING', 'OFFER_ACCEPTED', 'PAID_IN_ESCROW', 'SHIPPED',
    'DELIVERED', 'CONFIRMED',
    'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED_BACK', 'RETURN_RECEIVED_BACK',
    'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED'
  )
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  actor_id UUID REFERENCES agents(id),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, created_at ASC);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  dimensions JSONB DEFAULT '{}'::jsonb,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(order_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id, created_at DESC);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);

-- Risk and experiments
CREATE TABLE IF NOT EXISTS risk_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  signal_type VARCHAR(40) NOT NULL,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_signals_agent ON risk_signals(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS experiment_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event logs
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES agents(id),
  target_type VARCHAR(40),
  target_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_type_time ON event_logs(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES agents(id),
  session_id VARCHAR(120),
  position INTEGER,
  tab VARCHAR(40),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_impressions_listing_time ON listing_impressions(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_impressions_session ON listing_impressions(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES agents(id),
  session_id VARCHAR(120),
  source VARCHAR(60),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_clicks_listing_time ON listing_clicks(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_clicks_session ON listing_clicks(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ranking_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  feature_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(10,6) NOT NULL DEFAULT 0,
  model_version VARCHAR(40) NOT NULL DEFAULT 'rules_v1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_listing_time ON ranking_feature_snapshots(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_model_time ON ranking_feature_snapshots(model_version, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_public_stats (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  completed_seller_orders INTEGER NOT NULL DEFAULT 0,
  completed_buyer_orders INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC(4,2) NOT NULL DEFAULT 0,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  reply_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
