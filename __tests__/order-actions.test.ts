import { getAvailableOrderActions, getOrderActorRole, normalizeOrderStatus } from '@/lib/order-actions';

describe('order action resolver', () => {
  const baseOrder = {
    id: 'order-1',
    status: 'OFFER_ACCEPTED',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
  } as any;

  test('resolves actor role by buyer/seller id', () => {
    expect(getOrderActorRole(baseOrder, 'buyer-1')).toBe('buyer');
    expect(getOrderActorRole(baseOrder, 'seller-1')).toBe('seller');
    expect(getOrderActorRole(baseOrder, 'other')).toBe('observer');
  });

  test('normalizes known/unknown statuses', () => {
    expect(normalizeOrderStatus('completed')).toBe('COMPLETED');
    expect(normalizeOrderStatus('something-else')).toBe('UNKNOWN');
  });

  test('returns expected actions for buyer flow', () => {
    expect(getAvailableOrderActions({ ...baseOrder, status: 'OFFER_ACCEPTED' }, 'buyer-1')).toEqual(['pay']);
    expect(getAvailableOrderActions({ ...baseOrder, status: 'DELIVERED' }, 'buyer-1')).toEqual(['confirm', 'dispute']);
    expect(getAvailableOrderActions({ ...baseOrder, status: 'CONFIRMED' }, 'buyer-1')).toEqual(['complete', 'requestReturn', 'dispute']);
  });

  test('returns expected actions for seller return flow', () => {
    expect(getAvailableOrderActions({ ...baseOrder, status: 'PAID_IN_ESCROW' }, 'seller-1')).toEqual(['ship', 'dispute']);
    expect(getAvailableOrderActions({ ...baseOrder, status: 'RETURN_REQUESTED' }, 'seller-1')).toEqual(['approveReturn', 'rejectReturn', 'dispute']);
    expect(getAvailableOrderActions({ ...baseOrder, status: 'RETURN_RECEIVED_BACK' }, 'seller-1')).toEqual(['refund', 'dispute']);
  });

  test('hides actions from observer', () => {
    expect(getAvailableOrderActions({ ...baseOrder, status: 'CONFIRMED' }, 'observer-id')).toEqual([]);
  });
});
