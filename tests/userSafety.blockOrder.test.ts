/**
 * Safety-path unit tests (no emulator).
 *
 * OrderRoom / Join / Help call `userSafety.blockUser(me, them)`.
 * Combined "Report and block" must write the legal `reports` shape first,
 * then block the reported user — not the reporter.
 */
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(),
  collection: jest.fn(() => ({ path: 'reports' })),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
}));

jest.mock('@/services/firebase', () => ({
  db: { name: 'mock-db' },
  auth: { currentUser: { uid: 'alice' } },
}));

jest.mock('@/services/blockService', () => ({
  blockUser: jest.fn(),
}));

jest.mock('../services/block', () => ({
  isUserBlocked: jest.fn(),
  blockUser: jest.fn(),
}));

import { addDoc } from 'firebase/firestore';
import { blockUser as persistBlock } from '@/services/blockService';
import { reportAndBlock } from '../services/report-block';
import { blockUser, submitUserReport } from '../services/userSafety';

const addDocMock = addDoc as unknown as jest.Mock;
const persistBlockMock = persistBlock as unknown as jest.Mock;

describe('userSafety.blockUser argument order', () => {
  beforeEach(() => {
    persistBlockMock.mockReset();
    persistBlockMock.mockResolvedValue(undefined);
    addDocMock.mockReset();
    addDocMock.mockResolvedValue({ id: 'report-1' });
  });

  it('passes (blocker, blocked) through to blockService (no swap)', async () => {
    await blockUser('alice', 'bob');
    expect(persistBlockMock).toHaveBeenCalledTimes(1);
    expect(persistBlockMock).toHaveBeenCalledWith('alice', 'bob');
  });
});

describe('reportAndBlock writes a rules-legal report then blocks the target', () => {
  beforeEach(() => {
    persistBlockMock.mockReset();
    persistBlockMock.mockResolvedValue(undefined);
    addDocMock.mockReset();
    addDocMock.mockResolvedValue({ id: 'report-1' });
  });

  it('uses submitReport keys and blocks the reported user, not the reporter', async () => {
    await reportAndBlock('alice', 'bob', 'order-99');

    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: 'alice',
        reporterId: 'alice',
        reportedUserId: 'bob',
        contentId: 'order:order-99',
        reason: 'abuse',
        createdAt: 'SERVER_TS',
      },
    );

    expect(persistBlockMock).toHaveBeenCalledTimes(1);
    expect(persistBlockMock).toHaveBeenCalledWith('alice', 'bob');
  });

  it('does not block if the report write fails', async () => {
    addDocMock.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(reportAndBlock('alice', 'bob', 'order-99')).rejects.toThrow(
      'permission-denied',
    );
    expect(persistBlockMock).not.toHaveBeenCalled();
  });
});

describe('submitUserReport contentId', () => {
  beforeEach(() => {
    addDocMock.mockReset();
    addDocMock.mockResolvedValue({ id: 'report-1' });
  });

  it('maps an order report to order:{orderId}', async () => {
    await submitUserReport({
      reporterId: 'alice',
      reportedUserId: 'bob',
      orderId: 'order-99',
      reason: 'Spam',
    });
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contentId: 'order:order-99',
        reason: 'spam',
      }),
    );
  });
});
