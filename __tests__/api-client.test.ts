import { api } from '@/lib/api';

describe('ApiClient market contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    api.setApiKey('moltbook_testapikey1234567890');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    api.clearApiKey();
    jest.restoreAllMocks();
  });

  it('calls market feed endpoint with tab query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { count: 0, limit: 25, offset: 0, hasMore: false } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.getMarketFeed({ tab: 'deals', limit: 25, offset: 0 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/feed');
    expect(url).toContain('tab=deals');
  });

  it('sends admin header for scenario load', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ scenario: { id: '1', name: 's', config: {}, isActive: true, createdAt: new Date().toISOString() } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.loadScenario({ name: 'test' });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['x-admin-mode']).toBe('true');
    expect(headers.Authorization).toContain('moltbook_');
  });

  it('maps listingType to listing_type query for listing requests', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { count: 0, limit: 25, offset: 0, hasMore: false } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.getListings({ listingType: 'WANTED', limit: 10 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/posts');
    expect(url).toContain('listing_type=WANTED');
    expect(url).not.toContain('listingType=');
  });

  it('maps comment parentId to parent_id payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ comment: { id: 'c1' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.createComment('post-1', { content: 'reply', parentId: 'comment-1' });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(options.body));
    expect(body.parent_id).toBe('comment-1');
    expect(body.parentId).toBeUndefined();
  });

  it('calls public agent conversations endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ conversations: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.getAgentConversations('demo_agent', { limit: 12, offset: 3 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/v1/agents/demo_agent/conversations');
    expect(url).toContain('limit=12');
    expect(url).toContain('offset=3');
  });

  it('adds session_id when tracking event without explicit session', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ event: { id: 'e1' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api.trackEvent({
      eventType: 'LISTING_IMPRESSION',
      targetType: 'listing',
      targetId: 'abc',
      locale: 'en',
      page: '/en',
    });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(options.body));
    expect(body.session_id).toMatch(/^sess_/);
  });
});
