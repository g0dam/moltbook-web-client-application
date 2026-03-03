import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useSWR, { SWRConfiguration } from 'swr';
import { useInView } from 'react-intersection-observer';
import { api, ApiError } from '@/lib/api';
import { useAuthStore, useFeedStore, useUIStore } from '@/store';
import type {
  Post,
  Comment,
  Agent,
  Submolt,
  PostSort,
  CommentSort,
  Listing,
  Conversation,
  ConversationListItem,
  Message,
  Offer,
  Order,
  Wallet,
  LedgerEntry,
  Review,
  AgentOverview,
  AgentListingSummary,
  AgentOrderSummary,
  AgentActivityItem,
  AgentConversationSummary,
  ConversationPublicDetail,
  NegotiationInsights,
  CategoryTemplate,
  HeartbeatPayload,
} from '@/types';
import { debounce } from '@/lib/utils';
export { useI18n } from './useI18n';

// SWR fetcher
const fetcher = <T>(fn: () => Promise<T>) => fn();

function normalizeApiError(err: unknown): { message: string; code?: string; hint?: string } {
  if (err instanceof ApiError) {
    if (err.statusCode === 404) {
      return { message: 'Endpoint not found. Please verify API routes.', code: err.code, hint: err.hint };
    }
    if (err.statusCode === 403) {
      return { message: 'Permission denied for this action.', code: err.code, hint: err.hint };
    }
    if (err.statusCode === 429) {
      return { message: 'Too many requests. Please retry later.', code: err.code, hint: err.hint };
    }
    return { message: err.message, code: err.code, hint: err.hint };
  }
  return { message: 'Request failed. Please try again.' };
}

// Auth hooks
export function useAuth() {
  const { agent, apiKey, isLoading, error, login, logout, refresh } = useAuthStore();
  
  useEffect(() => {
    if (apiKey && !agent) refresh();
  }, [apiKey, agent, refresh]);
  
  return { agent, apiKey, isLoading, error, isAuthenticated: !!agent, login, logout, refresh };
}

// Post hooks
export function usePost(postId: string, config?: SWRConfiguration) {
  return useSWR<Post>(postId ? ['post', postId] : null, () => api.getPost(postId), config);
}

export function usePosts(options: { sort?: PostSort; submolt?: string } = {}, config?: SWRConfiguration) {
  const key = useMemo(() => ['posts', options.sort || 'hot', options.submolt || 'all'], [options.sort, options.submolt]);
  return useSWR(key, () => api.getPosts({ sort: options.sort, submolt: options.submolt }), config);
}

export function usePostVote(postId: string) {
  const [isVoting, setIsVoting] = useState(false);
  const updatePostVote = useFeedStore(s => s.updatePostVote);
  
  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      const result = direction === 'up' ? await api.upvotePost(postId) : await api.downvotePost(postId);
      const scoreDiff = result.action === 'upvoted' ? 1 : result.action === 'downvoted' ? -1 : 0;
      updatePostVote(postId, result.action === 'removed' ? null : direction, scoreDiff);
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, updatePostVote]);
  
  return { vote, isVoting };
}

// Comment hooks
export function useComments(postId: string, options: { sort?: CommentSort } = {}, config?: SWRConfiguration) {
  return useSWR<Comment[]>(postId ? ['comments', postId, options.sort || 'top'] : null, () => api.getComments(postId, options), config);
}

export function useCommentVote(commentId: string) {
  const [isVoting, setIsVoting] = useState(false);
  
  const vote = useCallback(async (direction: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    try {
      direction === 'up' ? await api.upvoteComment(commentId) : await api.downvoteComment(commentId);
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setIsVoting(false);
    }
  }, [commentId, isVoting]);
  
  return { vote, isVoting };
}

// Agent hooks
export function useAgent(name: string, config?: SWRConfiguration) {
  return useSWR<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>(
    name ? ['agent', name] : null, () => api.getAgent(name), config
  );
}

export function useAgentOverview(name: string, config?: SWRConfiguration) {
  return useSWR<AgentOverview>(name ? ['agent-overview', name] : null, () => api.getAgentOverview(name), config);
}

export function useAgentListings(
  name: string,
  options: { status?: 'ACTIVE' | 'RESERVED' | 'SOLD' | 'OFF_SHELF' | 'ALL'; limit?: number; offset?: number } = {},
  config?: SWRConfiguration
) {
  const key = name ? ['agent-listings', name, options.status || 'ACTIVE', options.limit || 20, options.offset || 0] : null;
  return useSWR<AgentListingSummary[]>(key, () => api.getAgentListings(name, options), config);
}

export function useAgentOrders(
  name: string,
  options: { status?: string; role?: 'buyer' | 'seller' | 'all'; limit?: number; offset?: number } = {},
  config?: SWRConfiguration
) {
  const key = name ? ['agent-orders', name, options.status || 'COMPLETED', options.role || 'all', options.limit || 20, options.offset || 0] : null;
  return useSWR<AgentOrderSummary[]>(key, () => api.getAgentOrders(name, options), config);
}

export function useAgentActivity(name: string, options: { limit?: number; offset?: number } = {}, config?: SWRConfiguration) {
  const key = name ? ['agent-activity', name, options.limit || 50, options.offset || 0] : null;
  return useSWR<AgentActivityItem[]>(key, () => api.getAgentActivity(name, options), config);
}

export function useAgentConversations(name: string, options: { limit?: number; offset?: number } = {}, config?: SWRConfiguration) {
  const key = name ? ['agent-conversations', name, options.limit || 30, options.offset || 0] : null;
  return useSWR<AgentConversationSummary[]>(key, () => api.getAgentConversations(name, options), config);
}

export function useHeartbeat(options: { enabled?: boolean; refreshInterval?: number } = {}, config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  const enabled = options.enabled !== false;
  return useSWR<HeartbeatPayload>(isAuthenticated && enabled ? ['agent-heartbeat'] : null, () => api.getHeartbeat(), {
    refreshInterval: options.refreshInterval || 30000,
    ...config,
  });
}

export function useHeartbeatStalledTasks(options: { enabled?: boolean; refreshInterval?: number } = {}, config?: SWRConfiguration) {
  const heartbeat = useHeartbeat(options, config);
  return {
    ...heartbeat,
    stalledTasks: heartbeat.data?.stalled_tasks || [],
    followUpSuggestions: heartbeat.data?.follow_up_suggestions || [],
    afterSaleWatchlist: heartbeat.data?.after_sale_watchlist || [],
  };
}

export function useCurrentAgent() {
  const { agent, isAuthenticated } = useAuth();
  return useSWR<Agent>(isAuthenticated ? ['me'] : null, () => api.getMe(), { fallbackData: agent || undefined });
}

// Submolt hooks
export function useSubmolt(name: string, config?: SWRConfiguration) {
  return useSWR<Submolt>(name ? ['submolt', name] : null, () => api.getSubmolt(name), config);
}

export function useSubmolts(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<{ data: Submolt[] }>(isAuthenticated ? ['submolts'] : null, () => api.getSubmolts(), config);
}

export function useCategoryTemplates(options: { listingType?: 'SELL' | 'WANTED' } = {}, config?: SWRConfiguration) {
  const key = ['category-templates', options.listingType || 'ALL'];
  return useSWR<CategoryTemplate[]>(key, () => api.getCategoryTemplates(options), config);
}

// Search hook
export function useSearch(query: string, options: { limit?: number } = {}, config?: SWRConfiguration) {
  const debouncedQuery = useDebounce(query, 300);
  return useSWR(
    debouncedQuery.length >= 2 ? ['search', debouncedQuery, options.limit || 25] : null,
    () => api.search(debouncedQuery, { limit: options.limit || 25 }), config
  );
}

// Market hooks
export function useMarketFeed(
  options: { tab?: 'for_you' | 'new' | 'nearby' | 'deals' | 'following'; limit?: number; offset?: number; location?: string } = {},
  config?: SWRConfiguration
) {
  const key = ['market-feed', options.tab || 'for_you', options.limit || 25, options.offset || 0, options.location || ''];
  return useSWR(key, () => api.getMarketFeed(options), config);
}

export function useListing(listingId: string, config?: SWRConfiguration) {
  return useSWR<Listing | Post>(listingId ? ['listing', listingId] : null, () => api.getListing(listingId), config);
}

export function useConversations(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<ConversationListItem[]>(isAuthenticated ? ['conversations'] : null, () => api.getConversations(), config);
}

export function useConversationStream(
  options: { status?: 'ALL' | 'OPEN' | 'NEGOTIATING' | 'RETURNING' | 'COMPLETED'; listingType?: 'SELL' | 'WANTED' | 'ALL'; limit?: number; offset?: number } = {},
  config?: SWRConfiguration
) {
  const key = ['conversation-stream', options.status || 'ALL', options.listingType || 'ALL', options.limit || 30, options.offset || 0];
  return useSWR<ConversationListItem[]>(key, () => api.getPublicConversationStream(options), config);
}

export function useConversation(conversationId: string, config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<{ conversation: Conversation; messages: Message[]; offers: Offer[] }>(
    isAuthenticated && conversationId ? ['conversation', conversationId] : null,
    () => api.getConversation(conversationId),
    config
  );
}

export function usePublicConversation(conversationId: string, config?: SWRConfiguration) {
  return useSWR<ConversationPublicDetail>(
    conversationId ? ['public-conversation', conversationId] : null,
    () => api.getPublicConversation(conversationId),
    config
  );
}

export function useConversationInsights(detail?: ConversationPublicDetail | null): NegotiationInsights {
  return useMemo(() => detail?.insights || {
    listing_price: null,
    first_offer_price: null,
    final_price: null,
    bargain_delta_abs: null,
    bargain_delta_pct: null,
    offer_rounds: 0,
    buyer_offer_count: 0,
    seller_counter_count: 0,
    time_to_agreement_sec: null,
    time_to_completion_sec: null,
  }, [detail]);
}

export function useOrders(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<Order[]>(isAuthenticated ? ['orders'] : null, () => api.getOrders(), config);
}

export function usePublicOrders(
  options: { status?: string; role?: 'buyer' | 'seller' | 'all'; agentId?: string; limit?: number; offset?: number } = {},
  config?: SWRConfiguration
) {
  const key = ['public-orders', options.status || 'COMPLETED', options.role || 'all', options.agentId || 'all', options.limit || 20, options.offset || 0];
  return useSWR<Order[]>(key, () => api.getPublicOrders(options), config);
}

export function useOrder(orderId: string, config?: SWRConfiguration) {
  return useSWR<Order>(orderId ? ['order', orderId] : null, () => api.getOrder(orderId), config);
}

export function useOrderActions(orderId: string) {
  const act = useCallback(async (action: 'pay' | 'ship' | 'deliver' | 'confirm' | 'complete' | 'requestReturn' | 'approveReturn' | 'rejectReturn' | 'shipBackReturn' | 'receiveReturnedItem' | 'refund', payload: Record<string, unknown> = {}) => {
    switch (action) {
      case 'pay':
        return api.payOrder(orderId);
      case 'ship':
        return api.shipOrder(orderId);
      case 'deliver':
        return api.deliverOrder(orderId);
      case 'confirm':
        return api.confirmOrder(orderId);
      case 'complete':
        return api.completeOrder(orderId);
      case 'requestReturn':
        return api.requestReturn(orderId, payload as { reason_code?: string; detail?: string });
      case 'approveReturn':
        return api.approveReturn(orderId, payload as { reason?: string });
      case 'rejectReturn':
        return api.rejectReturn(orderId, payload as { reason?: string });
      case 'shipBackReturn':
        return api.shipBackReturn(orderId, payload as { detail?: string });
      case 'receiveReturnedItem':
        return api.receiveReturnedItem(orderId, payload as { detail?: string });
      case 'refund':
        return api.refundOrder(orderId);
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }, [orderId]);

  return { act };
}

export function useConversationActionComposer(orderId?: string) {
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const submitAction = useCallback(async (
    action: 'confirm' | 'complete' | 'request_return' | 'approve_return' | 'reject_return' | 'ship_back_return' | 'receive_returned' | 'refund' | 'dispute',
    payload: {
      conversation_message?: string;
      conversation_reason_code?: string;
      reason_code?: string;
      reason?: string;
      detail?: string;
    } = {}
  ) => {
    if (!orderId) {
      throw new Error('orderId is required');
    }

    setIsRunning(true);
    setLastHint(null);
    try {
      const response = await api.actOrderWithMessage(orderId, action, payload);
      if (response?.hint) {
        setLastHint(response.hint);
      }
      return response?.order;
    } finally {
      setIsRunning(false);
    }
  }, [orderId]);

  return { submitAction, lastHint, isRunning };
}

export function useWallet(config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<Wallet>(isAuthenticated ? ['wallet'] : null, () => api.getWallet(), config);
}

export function useWalletLedger(limit = 100, offset = 0, config?: SWRConfiguration) {
  const { isAuthenticated } = useAuth();
  return useSWR<LedgerEntry[]>(
    isAuthenticated ? ['wallet-ledger', limit, offset] : null,
    () => api.getWalletLedger(limit, offset),
    config
  );
}

export function useAgentReviews(agentName: string, config?: SWRConfiguration) {
  return useSWR<Review[]>(agentName ? ['agent-reviews', agentName] : null, () => api.getAgentReviews(agentName), config);
}

export function useListingPublicActivity(listingId: string, limit = 20, config?: SWRConfiguration) {
  return useSWR(
    listingId ? ['listing-public-activity', listingId, limit] : null,
    () => api.getListingPublicActivity(listingId, limit),
    config
  );
}

export { normalizeApiError };

// Infinite scroll hook
export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean) {
  const { ref, inView } = useInView({ threshold: 0, rootMargin: '100px' });
  
  useEffect(() => {
    if (inView && hasMore) onLoadMore();
  }, [inView, hasMore, onLoadMore]);
  
  return { ref, inView };
}

// Debounce hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

// Local storage hook
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(newValue));
      }
      return newValue;
    });
  }, [key]);
  
  return [storedValue, setValue];
}

// Media query hook
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  
  return matches;
}

// Breakpoint hooks
export function useIsMobile() {
  return useMediaQuery('(max-width: 639px)');
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}

// Click outside hook
export function useClickOutside<T extends HTMLElement>(callback: () => void) {
  const ref = useRef<T>(null);
  
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };
    
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [callback]);
  
  return ref;
}

// Keyboard shortcut hook
export function useKeyboardShortcut(key: string, callback: () => void, options: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        (!options.ctrl || event.ctrlKey || event.metaKey) &&
        (!options.shift || event.shiftKey) &&
        (!options.alt || event.altKey)
      ) {
        event.preventDefault();
        callback();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options]);
}

// Copy to clipboard hook
export function useCopyToClipboard(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, []);
  
  return [copied, copy];
}

// Toggle hook
export function useToggle(initialValue = false): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle, setValue];
}

// Previous value hook
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}
