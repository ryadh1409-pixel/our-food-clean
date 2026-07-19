const batchSet = jest.fn();
const batchCommit = jest.fn();
const ensureHalfOrderChat = jest.fn();
const syncOrderMemberProfilesForOrder = jest.fn();
const autoInvite = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (parent: { name: string }) => ({
    id: parent.name === 'food_cards' ? 'card-1' : 'order-1',
  }),
  serverTimestamp: () => 'server-timestamp',
  writeBatch: () => ({
    set: batchSet,
    commit: batchCommit,
  }),
}));

jest.mock('@/constants/orderStatus', () => ({
  HALF_ORDER_MATCH_WAIT_MS: 60_000,
  ORDER_STATUS: { WAITING: 'waiting' },
}));
jest.mock('@/services/autoInvite', () => ({ autoInvite }));
jest.mock('@/services/firebase', () => ({ db: {} }));
jest.mock('@/services/halfOrderChat', () => ({ ensureHalfOrderChat }));
jest.mock('@/services/orders', () => ({
  loadHalfOrderCreatorProfiles: jest.fn().mockResolvedValue({
    host: {
      userId: 'user-1',
      name: 'Host',
      avatar: null,
      phone: null,
      expoPushToken: null,
    },
  }),
}));
jest.mock('@/services/orderMemberProfile', () => ({
  syncOrderMemberProfilesForOrder,
}));

import { createAiPlaceFoodCardAndOrder } from '../services/aiChatFoodOrder';

describe('createAiPlaceFoodCardAndOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchCommit.mockResolvedValue(undefined);
    ensureHalfOrderChat.mockResolvedValue(undefined);
    syncOrderMemberProfilesForOrder.mockResolvedValue(undefined);
    autoInvite.mockResolvedValue(undefined);
  });

  it('returns the committed order when chat initialization fails', async () => {
    ensureHalfOrderChat.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      createAiPlaceFoodCardAndOrder({
        uid: 'user-1',
        placeName: 'Pizza Place',
        address: '123 Main St',
        displayName: 'Host',
        photoUrl: null,
      }),
    ).resolves.toEqual({ cardId: 'card-1', orderId: 'order-1' });

    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(ensureHalfOrderChat).toHaveBeenCalledWith('order-1', ['user-1']);
    expect(syncOrderMemberProfilesForOrder).toHaveBeenCalledWith('order-1', [
      'user-1',
    ]);
    warn.mockRestore();
  });

  it('still rejects when the atomic order write fails', async () => {
    batchCommit.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      createAiPlaceFoodCardAndOrder({
        uid: 'user-1',
        placeName: 'Pizza Place',
        address: '123 Main St',
        displayName: 'Host',
        photoUrl: null,
      }),
    ).rejects.toThrow('permission denied');

    expect(ensureHalfOrderChat).not.toHaveBeenCalled();
  });
});
