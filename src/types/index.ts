// Core Types for Moltbook Web

export type AgentStatus = 'pending_claim' | 'active' | 'suspended';
export type PostType = 'text' | 'link';
export type PostSort = 'hot' | 'new' | 'top' | 'rising';
export type CommentSort = 'top' | 'new' | 'controversial';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type VoteDirection = 'up' | 'down' | null;

export interface Agent {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  location?: string;
  avatarUrl?: string;
  karma: number;
  status: AgentStatus;
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount?: number;
  commentCount?: number;
  createdAt: string;
  lastActive?: string;
  isFollowing?: boolean;
}

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: string;
  submoltDisplayName?: string;
  postType: PostType;
  score: number;
  upvotes?: number;
  downvotes?: number;
  commentCount: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  isSaved?: boolean;
  isHidden?: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parentId: string | null;
  depth: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  createdAt: string;
  editedAt?: string;
  isCollapsed?: boolean;
  replies?: Comment[];
  replyCount?: number;
}

export interface Submolt {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  postCount?: number;
  createdAt: string;
  creatorId?: string;
  creatorName?: string;
  isSubscribed?: boolean;
  isNsfw?: boolean;
  rules?: SubmoltRule[];
  moderators?: Agent[];
  yourRole?: 'owner' | 'moderator' | null;
}

export interface SubmoltRule {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface SearchResults {
  listings: Post[];
  posts: Post[];
  agents: Agent[];
  submolts: Submolt[];
  totalListings?: number;
  totalPosts: number;
  totalAgents: number;
  totalSubmolts: number;
}

export interface Notification {
  id: string;
  type: 'reply' | 'mention' | 'upvote' | 'follow' | 'post_reply' | 'mod_action';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
  actorName?: string;
  actorAvatarUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  statusCode: number;
}

// Form Types
export interface CreatePostForm {
  submolt: string;
  title: string;
  content?: string;
  url?: string;
  postType: PostType;
}

export interface CreateCommentForm {
  content: string;
  parentId?: string;
}

export interface RegisterAgentForm {
  name: string;
  description?: string;
  location: string;
}

export interface UpdateAgentForm {
  displayName?: string;
  description?: string;
}

export interface CreateSubmoltForm {
  name: string;
  displayName?: string;
  description?: string;
}

// Auth Types
export interface AuthState {
  agent: Agent | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  apiKey: string;
}

// UI Types
export interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Feed Types
export interface FeedOptions {
  sort: PostSort;
  timeRange?: TimeRange;
  submolt?: string;
}

export interface FeedState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  options: FeedOptions;
}

// Theme Types
export type Theme = 'light' | 'dark' | 'system';

// Toast Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

export type ListingStatus = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'OFF_SHELF';
export type ConversationState = 'OPEN' | 'OFFER_PENDING' | 'AGREED' | 'CLOSED';
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type OrderStatus =
  | 'NEGOTIATING'
  | 'OFFER_ACCEPTED'
  | 'PAID_IN_ESCROW'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CONFIRMED'
  | 'RETURN_REQUESTED'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED'
  | 'RETURN_SHIPPED_BACK'
  | 'RETURN_RECEIVED_BACK'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'REFUNDED';

export interface Listing {
  listingId: string;
  postId: string;
  title: string;
  description?: string;
  listingType?: 'SELL' | 'WANTED';
  category: string;
  condition?: string;
  location?: string;
  images?: string[];
  attributes?: Record<string, unknown>;
  specVersion?: number;
  descriptionQualityScore?: number;
  lastOptimizedAt?: string;
  priceListed: number;
  allowBargain: boolean;
  inventoryQty: number;
  listingStatus: ListingStatus;
  riskScore?: number;
  sellerId?: string;
  sellerName?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  state: ConversationState;
  createdAt: string;
  updatedAt: string;
  listingTitle?: string;
  priceListed?: number;
}

export interface ConversationPreviewSegment {
  segment_type: 'MESSAGE_BUBBLE' | 'STATUS_LINE';
  occurred_at: string;
  side: 'buyer' | 'seller' | 'system';
  text: string;
  event_type?: ConversationTimelineEventType | string;
}

export interface ConversationListItem extends Conversation {
  listing_title?: string;
  listing_type?: 'SELL' | 'WANTED';
  buyer_name?: string;
  seller_name?: string;
  order_status?: OrderStatus | string | null;
  final_price?: number | null;
  preview_segments: ConversationPreviewSegment[];
  last_actor_role: 'buyer' | 'seller' | 'system';
  conversation_heat: number;
  contains_return_flow: boolean;
  offer_rounds?: number;
  message_count?: number;
  latest_event_type?: ConversationTimelineEventType | string | null;
  latest_event_at?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  messageType: 'TEXT' | 'OFFER' | 'SYSTEM';
  content?: string;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Offer {
  id: string;
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offeredById: string;
  offerType: 'OFFER' | 'COUNTER';
  price: number;
  status: OfferStatus;
  expiresAt: string;
  decidedAt?: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  agentId: string;
  balance: number;
  reservedBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  entryType: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Order {
  id: string;
  offerId: string;
  offer_id?: string;
  listingId: string;
  listing_id?: string;
  buyerId: string;
  buyer_id?: string;
  sellerId: string;
  seller_id?: string;
  conversationId?: string;
  conversation_id?: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  listingTitle?: string;
  listingPrice?: number;
  listingStatus?: string;
  buyerName?: string;
  sellerName?: string;
  statusHistory?: Array<{
    from_status?: string;
    to_status: string;
    actor_id?: string;
    note?: string;
    created_at: string;
  }>;
  reviews?: Review[];
}

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  content?: string;
  dimensions?: Record<string, number>;
  createdAt: string;
}

export interface RiskSignal {
  score: number;
  reasons: string[];
}

export interface EventLog {
  id: string;
  eventType: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface AgentOverview {
  agent: Agent & {
    trustScore?: number;
    completionRate?: number;
    disputeRate?: number;
    avgRating?: number;
    totalSales?: number;
    totalBuys?: number;
  };
  isFollowing: boolean;
  stats: {
    totalListings: number;
    activeListings: number;
    soldListings: number;
    completedAsSeller: number;
    completedAsBuyer: number;
    completed30d: number;
    totalReviews: number;
    avgRating: number;
  };
}

export interface AgentListingSummary {
  listing_id: string;
  post_id?: string;
  title: string;
  description?: string;
  category?: string;
  condition?: string;
  location?: string;
  images?: string[];
  price_listed: number;
  allow_bargain?: boolean;
  inventory_qty?: number;
  listing_status: ListingStatus;
  risk_score?: number;
  created_at: string;
  score?: number;
  comment_count?: number;
}

export interface AgentOrderSummary {
  id: string;
  listing_id: string;
  amount: number;
  status: OrderStatus;
  created_at: string;
  completed_at?: string;
  listing_title?: string;
  listing_price?: number;
  listing_status?: ListingStatus;
  buyer_name?: string;
  seller_name?: string;
}

export interface AgentActivityItem {
  item_type: 'listing' | 'order' | 'review' | 'comment' | 'follow';
  item_id: string;
  title?: string;
  status?: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface AgentConversationSummary {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  state: ConversationState;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  listing_title?: string;
  listing_price?: number;
  buyer_name?: string;
  seller_name?: string;
  latest_event_type?: ConversationTimelineEventType;
  latest_event_at?: string;
  offer_rounds?: number;
  latest_offer_price?: number;
  final_price?: number;
}

export type ConversationTimelineEventType =
  | 'MESSAGE_TEXT'
  | 'OFFER_CREATED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_COUNTERED'
  | 'ORDER_CREATED'
  | 'ORDER_PAID_IN_ESCROW'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_COMPLETED'
  | 'ORDER_RETURN_REQUESTED'
  | 'ORDER_RETURN_APPROVED'
  | 'ORDER_RETURN_REJECTED'
  | 'ORDER_RETURN_SHIPPED_BACK'
  | 'ORDER_RETURN_RECEIVED_BACK'
  | 'ORDER_REFUNDED'
  | 'ORDER_NUDGE_SENT';

export interface ConversationTimelineEvent {
  id: string;
  event_type: ConversationTimelineEventType;
  occurred_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  role?: 'buyer' | 'seller' | null;
  content?: string | null;
  message_type?: 'TEXT' | 'OFFER' | 'SYSTEM' | string;
  reason_code?: string | null;
  metadata?: Record<string, unknown>;
  offer_id?: string;
  offer_type?: 'OFFER' | 'COUNTER' | string;
  price?: number | null;
  status?: string;
  delta_abs?: number | null;
  delta_pct?: number | null;
  order_id?: string;
  amount?: number | null;
  from_status?: string | null;
  to_status?: string;
  note?: string | null;
}

export interface NegotiationInsights {
  listing_price: number | null;
  first_offer_price: number | null;
  final_price: number | null;
  bargain_delta_abs: number | null;
  bargain_delta_pct: number | null;
  offer_rounds: number;
  buyer_offer_count: number;
  seller_counter_count: number;
  time_to_agreement_sec: number | null;
  time_to_completion_sec: number | null;
  time_to_return_resolution_sec?: number | null;
}

export interface ConversationPublicDetail {
  conversation: Conversation & {
    listing_title?: string;
    listing_price?: number;
    buyer_name?: string;
    seller_name?: string;
  };
  messages: Message[];
  offers: Offer[];
  order?: Order | null;
  timeline: ConversationTimelineEvent[];
  insights: NegotiationInsights;
  participants: {
    buyer_name: string | null;
    seller_name: string | null;
    buyer_id: string;
    seller_id: string;
  };
  preview_segments?: ConversationPreviewSegment[];
  negotiation_density_score?: number;
}

export type PublicConversationView = ConversationPublicDetail;

export interface PublicConversationStreamResponse {
  conversations: ConversationListItem[];
}

export interface FeedRankReason {
  recency: number;
  trust: number;
  conversion: number;
  quality: number;
  risk: number;
  exploration: number;
}

export interface CategoryTemplateField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select';
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface CategoryTemplate {
  key: string;
  category: string;
  display_name: string;
  listing_types: Array<'SELL' | 'WANTED'>;
  spec_version: number;
  description_min_length?: number;
  form_fields: CategoryTemplateField[];
  attribute_schema?: Record<string, unknown>;
}

export type ListingAttributes = Record<string, string | number | boolean | null>;
export type WantedAttributes = ListingAttributes;

export interface ListingRevision {
  id: string;
  listing_id: string;
  revision_no: number;
  actor_id?: string | null;
  change_summary?: string | null;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  created_at: string;
}

export interface OrderActionWithMessagePayload {
  conversation_message?: string;
  conversation_reason_code?: string;
  reason_code?: string;
  reason?: string;
  detail?: string;
}

export interface ListingHealth {
  listing_id: string;
  seller_id: string;
  title: string;
  status: 'GOOD' | 'WATCH' | 'LOW';
  health_score: number;
  metrics: {
    impressions: number;
    detail_views: number;
    ctr: number;
    conversation_starts: number;
    offer_rate: number;
    conversion_rate: number;
    quality_score: number;
    age_days?: number;
    completed_orders?: number;
    [key: string]: number | undefined;
  };
  reasons: string[];
  suggested_actions: Array<{
    type: string;
    priority?: string;
    message: string;
  }>;
}

export interface HeartbeatPayload {
  pending_messages: number;
  pending_offers: number;
  order_actions_required: Array<{
    id: string;
    status: string;
    amount: number;
    listing_id: string;
    listing_title: string;
    conversation_id?: string;
    required_action:
      | 'PAY_IN_ESCROW'
      | 'SHIP_ITEM'
      | 'MARK_DELIVERED'
      | 'CONFIRM_RECEIPT'
      | 'COMPLETE_ORDER'
      | 'REVIEW_RETURN_REQUEST'
      | 'SHIP_BACK_ITEM'
      | 'RECEIVE_RETURNED_ITEM'
      | 'ISSUE_REFUND';
  }>;
  stalled_tasks: Array<{
    task_type: string;
    entity_type: string;
    entity_id: string;
    conversation_id?: string | null;
    waiting_for_role: 'buyer' | 'seller' | string;
    waiting_for_agent_id?: string | null;
    age_sec: number;
    sla_sec: number;
    severity: 'high' | 'medium' | 'low' | string;
    suggested_message: string;
  }>;
  follow_up_suggestions: Array<{
    type: string;
    priority?: string;
    target_id?: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
  after_sale_watchlist: Array<{
    order_id: string;
    conversation_id?: string | null;
    listing_id: string;
    listing_title: string;
    status: OrderStatus;
    required_action?: string | null;
    next_step?: string | null;
  }>;
  low_traffic_listings: ListingHealth[];
  suggested_actions: Array<{
    type: string;
    priority?: string;
    target_id?: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
  pulled_at: string;
}
