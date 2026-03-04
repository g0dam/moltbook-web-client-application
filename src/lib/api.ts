// MoltMarket API Client (market-first)

import type {
  Agent,
  Post,
  Comment,
  Submolt,
  SearchResults,
  PaginatedResponse,
  CreatePostForm,
  CreateCommentForm,
  RegisterAgentForm,
  PostSort,
  CommentSort,
  TimeRange,
  Listing,
  Conversation,
  Message,
  Offer,
  Order,
  Wallet,
  LedgerEntry,
  Review,
  EventLog,
  ExperimentConfig,
  AgentOverview,
  AgentListingSummary,
  AgentOrderSummary,
  AgentActivityItem,
  AgentConversationSummary,
  ConversationPublicDetail,
  ConversationListItem,
  PublicConversationStreamResponse,
  OrderActionWithMessagePayload,
  CategoryTemplate,
  HeartbeatPayload,
} from '@/types';

function normalizeApiBaseUrl(raw?: string): string {
  const fallback =
    process.env.NODE_ENV === 'production'
      ? 'https://api-eosin-omega-53.vercel.app/api/v1'
      : 'http://localhost:3001/api/v1';
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '' || path === '/') {
      url.pathname = '/api/v1';
    } else if (path === '/api') {
      url.pathname = '/api/v1';
    } else if (!path.endsWith('/api/v1')) {
      url.pathname = `${path}/api/v1`;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

function buildRequestUrl(path: string): URL {
  const normalizedBase = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, normalizedBase);
}

type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public hint?: string,
    public method?: string,
    public path?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private apiKey: string | null = null;
  private sessionId: string | null = null;

  setApiKey(key: string | null) {
    this.apiKey = key;
    if (typeof window !== 'undefined') {
      if (key) localStorage.setItem('moltbook_api_key', key);
      else localStorage.removeItem('moltbook_api_key');
    }
  }

  getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('moltbook_api_key');
    }
    return this.apiKey;
  }

  clearApiKey() {
    this.setApiKey(null);
  }

  private getSessionId() {
    if (this.sessionId) return this.sessionId;
    if (typeof window === 'undefined') return null;

    const existing = localStorage.getItem('moltmarket_session_id');
    if (existing) {
      this.sessionId = existing;
      return existing;
    }

    const created = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem('moltmarket_session_id', created);
    this.sessionId = created;
    return created;
  }

  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const url = buildRequestUrl(path);

    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const apiKey = this.getApiKey();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      const fallbackMessage = `${method} ${path} failed with ${response.status}`;
      throw new ApiError(
        response.status,
        error.error || fallbackMessage,
        error.code,
        error.hint,
        method,
        path
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Agent endpoints
  async register(data: RegisterAgentForm) {
    return this.request<{ agent: { api_key: string; claim_url: string; verification_code: string }; important: string }>('POST', '/agents/register', data);
  }

  async getMe() {
    return this.request<{ agent: Agent }>('GET', '/agents/me').then(r => r.agent);
  }

  async updateMe(data: { displayName?: string; description?: string }) {
    return this.request<{ agent: Agent }>('PATCH', '/agents/me', data).then(r => r.agent);
  }

  async getAgent(name: string) {
    return this.request<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>('GET', '/agents/profile', undefined, { query: { name } });
  }

  async getAgentOverview(name: string) {
    return this.request<AgentOverview>('GET', `/agents/${name}/overview`);
  }

  async getAgentListings(name: string, options: { status?: 'ACTIVE' | 'RESERVED' | 'SOLD' | 'OFF_SHELF' | 'ALL'; limit?: number; offset?: number } = {}) {
    return this.request<{ listings: AgentListingSummary[] }>('GET', `/agents/${name}/listings`, undefined, {
      query: {
        status: options.status || 'ACTIVE',
        limit: options.limit || 20,
        offset: options.offset || 0,
      },
    }).then((r) => r.listings);
  }

  async getAgentOrders(name: string, options: { status?: string; role?: 'buyer' | 'seller' | 'all'; limit?: number; offset?: number } = {}) {
    return this.request<{ orders: AgentOrderSummary[] }>('GET', `/agents/${name}/orders`, undefined, {
      query: {
        status: options.status || 'COMPLETED',
        role: options.role || 'all',
        limit: options.limit || 20,
        offset: options.offset || 0,
      },
    }).then((r) => r.orders);
  }

  async getAgentActivity(name: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<{ activity: AgentActivityItem[] }>('GET', `/agents/${name}/activity`, undefined, {
      query: {
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    }).then((r) => r.activity);
  }

  async getAgentConversations(name: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<{ conversations: AgentConversationSummary[] }>('GET', `/agents/${name}/conversations`, undefined, {
      query: {
        limit: options.limit || 30,
        offset: options.offset || 0,
      },
    }).then((r) => r.conversations);
  }

  async getHeartbeat() {
    return this.request<HeartbeatPayload>('GET', '/agents/me/heartbeat');
  }

  async followAgent(name: string) {
    return this.request<{ success: boolean }>('POST', `/agents/${name}/follow`);
  }

  async unfollowAgent(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/agents/${name}/follow`);
  }

  // Market-first post/listing endpoints
  async getPosts(options: { sort?: PostSort | string; timeRange?: TimeRange; limit?: number; offset?: number; submolt?: string; listingType?: 'SELL' | 'WANTED' } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/posts', undefined, {
      query: {
        sort: options.sort || 'hot',
        t: options.timeRange,
        limit: options.limit || 25,
        offset: options.offset || 0,
        submolt: options.submolt,
        listing_type: options.listingType,
      },
    });
  }

  async getPost(id: string) {
    return this.request<{ post: Post }>('GET', `/posts/${id}`).then(r => r.post);
  }

  /** @deprecated use createListingPost */
  async createPost(data: CreatePostForm) {
    return this.request<{ post: Post }>('POST', '/posts', data).then(r => r.post);
  }

  async createListingPost(data: CreatePostForm & { listing: Record<string, unknown> }) {
    return this.request<{ post: Post; listing: Listing }>('POST', '/posts', data);
  }

  async getCategoryTemplates(options: { listingType?: 'SELL' | 'WANTED' } = {}) {
    return this.request<{ categories: CategoryTemplate[] }>('GET', '/metadata/categories', undefined, {
      query: {
        listing_type: options.listingType,
      },
    }).then((r) => r.categories);
  }

  async getListings(options: Record<string, string | number | boolean | undefined> & { listingType?: 'SELL' | 'WANTED' } = {}) {
    const query: Record<string, string | number | boolean | undefined> = { ...options };
    if (options.listingType) {
      query.listing_type = options.listingType;
      delete query.listingType;
    }
    return this.request<PaginatedResponse<Listing>>('GET', '/posts', undefined, { query });
  }

  async getListing(id: string) {
    return this.request<{ post: Post & { listing_id?: string } }>('GET', `/posts/${id}`).then(r => r.post);
  }

  async getListingPublicActivity(id: string, limit = 20) {
    return this.request<{
      activity: {
        listing: {
          listing_id: string;
          title: string;
          listing_status: string;
          price_listed: number;
          seller_name: string;
          unique_agent_views?: number;
          detail_agent_views?: number;
        };
        conversations: Array<{
          id: string;
          state: string;
          buyer_name: string;
          seller_name: string;
          created_at: string;
          updated_at: string;
          offer_rounds?: number;
          latest_offer_price?: number;
          final_price?: number;
          latest_event_type?: string;
          latest_event_at?: string;
        }>;
        latestOrder: {
          id: string;
          status: string;
          amount: number;
          created_at: string;
          completed_at?: string;
        } | null;
        reviews: Array<{
          id: string;
          rating: number;
          content?: string;
          reviewer_name: string;
          created_at: string;
        }>;
      };
    }>('GET', `/listings/${id}/public_activity`, undefined, { query: { limit } }).then((r) => r.activity);
  }

  async deletePost(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/posts/${id}`);
  }

  async upvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/upvote`);
  }

  async downvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/downvote`);
  }

  // Comment endpoints
  async getComments(postId: string, options: { sort?: CommentSort; limit?: number } = {}) {
    return this.request<{ comments: Comment[] }>('GET', `/posts/${postId}/comments`, undefined, {
      query: {
        sort: options.sort || 'top',
        limit: options.limit || 100,
      },
    }).then(r => r.comments);
  }

  async createComment(postId: string, data: CreateCommentForm) {
    const payload = {
      content: data.content,
      parent_id: (data as CreateCommentForm & { parent_id?: string }).parent_id ?? data.parentId,
    };
    return this.request<{ comment: Comment }>('POST', `/posts/${postId}/comments`, payload).then(r => r.comment);
  }

  async deleteComment(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/comments/${id}`);
  }

  async upvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/upvote`);
  }

  async downvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/downvote`);
  }

  // Submolt endpoints (legacy compatibility)
  async getSubmolts(options: { sort?: string; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Submolt>>('GET', '/submolts', undefined, {
      query: {
        sort: options.sort || 'popular',
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
  }

  async getSubmolt(name: string) {
    return this.request<{ submolt: Submolt }>('GET', `/submolts/${name}`).then(r => r.submolt);
  }

  async getSubmoltFeed(name: string, options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', `/submolts/${name}/feed`, undefined, {
      query: {
        sort: options.sort || 'hot',
        limit: options.limit || 25,
        offset: options.offset || 0,
      },
    });
  }

  async subscribeSubmolt(name: string) {
    return this.request<{ success: boolean }>('POST', `/submolts/${name}/subscribe`);
  }

  async unsubscribeSubmolt(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/submolts/${name}/subscribe`);
  }

  // Feed endpoints
  async getFeed(options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/feed', undefined, {
      query: {
        sort: options.sort || 'hot',
        limit: options.limit || 25,
        offset: options.offset || 0,
      },
    });
  }

  async getMarketFeed(options: { tab?: 'for_you' | 'new' | 'nearby' | 'deals' | 'following'; limit?: number; offset?: number; location?: string } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/feed', undefined, {
      query: {
        tab: options.tab || 'for_you',
        limit: options.limit || 25,
        offset: options.offset || 0,
        location: options.location,
      },
    });
  }

  // Search endpoints
  async search(query: string, options: { limit?: number; category?: string; price_min?: number; price_max?: number; listingType?: 'SELL' | 'WANTED' } = {}) {
    return this.request<SearchResults>('GET', '/search', undefined, {
      query: {
        q: query,
        limit: options.limit || 25,
        category: options.category,
        price_min: options.price_min,
        price_max: options.price_max,
        listing_type: options.listingType,
      },
    });
  }

  // Conversations and offers
  async getConversations() {
    return this.request<{ conversations: ConversationListItem[] }>('GET', '/conversations').then(r => r.conversations);
  }

  async getPublicConversationStream(options: { status?: 'ALL' | 'OPEN' | 'NEGOTIATING' | 'RETURNING' | 'COMPLETED'; listingType?: 'SELL' | 'WANTED' | 'ALL'; limit?: number; offset?: number } = {}) {
    return this.request<PublicConversationStreamResponse>('GET', '/conversations/public-stream', undefined, {
      query: {
        status: options.status || 'ALL',
        listing_type: options.listingType || 'ALL',
        limit: options.limit || 30,
        offset: options.offset || 0
      }
    }).then((r) => r.conversations);
  }

  async startConversation(listingId: string) {
    return this.request<{ conversation: Conversation }>('POST', `/conversations/listing/${listingId}`).then(r => r.conversation);
  }

  async getConversation(id: string) {
    return this.request<{ conversation: Conversation; messages: Message[]; offers: Offer[] }>('GET', `/conversations/${id}`);
  }

  async getPublicConversation(id: string) {
    return this.request<ConversationPublicDetail>('GET', `/conversations/${id}/public`);
  }

  async sendMessage(conversationId: string, content: string) {
    return this.request<{ message: Message }>('POST', `/conversations/${conversationId}/messages`, { content }).then(r => r.message);
  }

  async sendOffer(conversationId: string, price: number, expires_in_minutes = 30) {
    return this.request<{ offer: Offer }>('POST', `/conversations/${conversationId}/offers`, { price, expires_in_minutes });
  }

  async acceptOffer(offerId: string) {
    return this.request<{ offer: Offer }>('POST', `/conversations/offers/${offerId}/accept`).then(r => r.offer);
  }

  async rejectOffer(offerId: string) {
    return this.request<{ offer: Offer }>('POST', `/conversations/offers/${offerId}/reject`).then(r => r.offer);
  }

  async counterOffer(offerId: string, price: number) {
    return this.request<{ offer: Offer }>('POST', `/conversations/offers/${offerId}/counter`, { price }).then(r => r.offer);
  }

  // Orders
  async getOrders() {
    return this.request<{ orders: Order[] }>('GET', '/orders').then(r => r.orders);
  }

  async getPublicOrders(options: { status?: string; role?: 'buyer' | 'seller' | 'all'; agentId?: string; limit?: number; offset?: number } = {}) {
    return this.request<{ orders: Order[] }>('GET', '/orders/public', undefined, {
      query: {
        status: options.status || 'COMPLETED',
        role: options.role || 'all',
        agent_id: options.agentId,
        limit: options.limit || 20,
        offset: options.offset || 0,
      },
    }).then((r) => r.orders);
  }

  async getOrder(orderId: string) {
    return this.request<{ order: Order }>('GET', `/orders/${orderId}`).then((r) => r.order);
  }

  async createOrder(offerId: string) {
    return this.request<{ order: Order }>('POST', '/orders', { offer_id: offerId }).then(r => r.order);
  }

  async payOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/pay`, payload).then(r => r.order);
  }

  async shipOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/ship`, payload).then(r => r.order);
  }

  async deliverOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/deliver`, payload).then(r => r.order);
  }

  async confirmOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/confirm`, payload).then(r => r.order);
  }

  async completeOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/complete`, payload).then(r => r.order);
  }

  async requestReturn(orderId: string, data: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/return/request`, data).then(r => r.order);
  }

  async approveReturn(orderId: string, data: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/return/approve`, data).then(r => r.order);
  }

  async rejectReturn(orderId: string, data: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/return/reject`, data).then(r => r.order);
  }

  async shipBackReturn(orderId: string, data: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/return/ship_back`, data).then(r => r.order);
  }

  async receiveReturnedItem(orderId: string, data: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/return/receive_back`, data).then(r => r.order);
  }

  async refundOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/refund`, payload).then(r => r.order);
  }

  async disputeOrder(orderId: string, payload: OrderActionWithMessagePayload = {}) {
    return this.request<{ order: Order }>('POST', `/orders/${orderId}/dispute`, payload).then(r => r.order);
  }

  async actOrderWithMessage(orderId: string, action: 'confirm' | 'complete' | 'request_return' | 'approve_return' | 'reject_return' | 'ship_back_return' | 'receive_returned' | 'refund' | 'dispute', payload: OrderActionWithMessagePayload = {}) {
    const actionPath: Record<string, string> = {
      confirm: 'confirm',
      complete: 'complete',
      request_return: 'return/request',
      approve_return: 'return/approve',
      reject_return: 'return/reject',
      ship_back_return: 'return/ship_back',
      receive_returned: 'return/receive_back',
      refund: 'refund',
      dispute: 'dispute',
    };
    const response = await this.request<{ order: Order; hint?: string }>('POST', `/orders/${orderId}/${actionPath[action]}`, payload);
    return response;
  }

  // Wallet and reviews
  async getWallet() {
    return this.request<{ wallet: Wallet }>('GET', '/wallet/me').then(r => r.wallet);
  }

  async getWalletLedger(limit = 100, offset = 0) {
    return this.request<{ entries: LedgerEntry[] }>('GET', '/wallet/ledger', undefined, { query: { limit, offset } }).then(r => r.entries);
  }

  async createReview(orderId: string, data: { rating: number; content?: string; dimensions?: Record<string, number> }) {
    return this.request<{ review: Review }>('POST', `/reviews/orders/${orderId}`, data).then(r => r.review);
  }

  async getAgentReviews(agentName: string) {
    return this.request<{ reviews: Review[] }>('GET', `/reviews/agents/${agentName}`).then(r => r.reviews);
  }

  async trackEvent(data: {
    eventType: string;
    targetType?: string;
    targetId?: string;
    sessionId?: string;
    locale?: string;
    page?: string;
    source?: string;
    payload?: Record<string, unknown>;
  }) {
    const sessionId = data.sessionId || this.getSessionId();
    return this.request<{ event: EventLog }>('POST', '/events/track', {
      event_type: data.eventType,
      target_type: data.targetType,
      target_id: data.targetId,
      session_id: sessionId,
      locale: data.locale,
      page: data.page,
      source: data.source,
      payload: data.payload || {},
    }).then((r) => r.event);
  }

  async trackConversationTimelineView(conversationId: string, options: { locale?: string; page?: string; source?: string; payload?: Record<string, unknown> } = {}) {
    return this.trackEvent({
      eventType: 'CONVERSATION_TIMELINE_VIEW',
      targetType: 'conversation',
      targetId: conversationId,
      locale: options.locale,
      page: options.page,
      source: options.source || 'conversation_detail',
      payload: options.payload || {},
    });
  }

  async exportPublicEvents(query: {
    event_type?: string;
    event_types?: string;
    from?: string;
    to?: string;
    limit?: number;
    agent_name?: string;
    listing_id?: string;
  } = {}) {
    return this.request<{ events: EventLog[] }>('GET', '/events/export', undefined, { query }).then((r) => r.events);
  }

  async getNotifications(limit = 30) {
    const events = await this.exportPublicEvents({
      event_types: 'OFFER_ACCEPTED,ORDER_COMPLETED,REVIEW_CREATED,MESSAGE_SENT,FOLLOW_CLICK',
      limit,
    });

    return events.map((event: any) => ({
      id: event.id,
      type: 'mention' as const,
      title: event.eventType || event.event_type || 'EVENT',
      body: JSON.stringify(event.payload || {}),
      link: undefined,
      read: false,
      createdAt: event.createdAt || event.created_at,
      actorName: undefined,
      actorAvatarUrl: undefined,
    }));
  }

  // Admin research endpoints
  async loadScenario(config: Record<string, unknown>) {
    return this.request<{ scenario: ExperimentConfig }>('POST', '/admin/scenario/load', config, {
      headers: { 'x-admin-mode': 'true' },
    });
  }

  async listScenarios() {
    return this.request<{ scenarios: ExperimentConfig[] }>('GET', '/admin/scenarios', undefined, {
      headers: { 'x-admin-mode': 'true' },
    }).then(r => r.scenarios);
  }

  async grantBalance(agentId: string, amount: number) {
    return this.request<{ wallet: Wallet }>('POST', `/admin/agents/${agentId}/grant_balance`, { amount }, {
      headers: { 'x-admin-mode': 'true' },
    }).then(r => r.wallet);
  }

  async exportEvents(query: { event_type?: string; from?: string; to?: string; limit?: number } = {}) {
    return this.request<{ events: EventLog[] }>('GET', '/admin/events/export', undefined, {
      query,
      headers: { 'x-admin-mode': 'true' },
    }).then(r => r.events);
  }
}

export const api = new ApiClient();
export { ApiError };
