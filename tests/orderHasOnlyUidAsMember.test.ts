import { orderHasOnlyUidAsMember } from '@/services/deleteUserAccount';

describe('orderHasOnlyUidAsMember', () => {
  it('returns true for sole host on participants', () => {
    expect(
      orderHasOnlyUidAsMember({ participants: ['host'], users: [] }, 'host'),
    ).toBe(true);
  });

  it('returns false when a peer is on participants', () => {
    expect(
      orderHasOnlyUidAsMember(
        { participants: ['host', 'joiner'], users: [] },
        'host',
      ),
    ).toBe(false);
  });

  it('returns false when a peer is on half-order users', () => {
    expect(
      orderHasOnlyUidAsMember(
        { participants: ['host', 'joiner'], users: ['host', 'joiner'] },
        'host',
      ),
    ).toBe(false);
  });

  it('returns true for empty membership lists', () => {
    expect(orderHasOnlyUidAsMember({ participants: [], users: [] }, 'host')).toBe(
      true,
    );
  });
});
