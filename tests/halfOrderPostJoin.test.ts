import {
  halfOrderChatMemberIds,
  halfOrderChatUsersAppendUpdate,
  orderMemberIdsCallerCanSync,
} from '../lib/halfOrderPostJoin';

describe('half-order post-join writes', () => {
  it('builds a caller-inclusive member list for chat create', () => {
    expect(halfOrderChatMemberIds(['host', 'joiner'], 'joiner')).toEqual([
      'host',
      'joiner',
    ]);
  });

  it('refuses a chat member list that does not include the caller', () => {
    expect(halfOrderChatMemberIds(['host'], 'joiner')).toBeNull();
    expect(halfOrderChatMemberIds(['host'], '')).toBeNull();
  });

  it('appends chat membership with users only', () => {
    const patch = halfOrderChatUsersAppendUpdate(['host', 'joiner']);
    expect(Object.keys(patch)).toEqual(['users']);
    expect(patch.users).toEqual(['host', 'joiner']);
  });

  it('syncs only the caller order_members doc', () => {
    expect(orderMemberIdsCallerCanSync(['host', 'joiner'], 'joiner')).toEqual([
      'joiner',
    ]);
    expect(orderMemberIdsCallerCanSync(['host'], 'joiner')).toEqual([]);
    expect(orderMemberIdsCallerCanSync(['host', 'joiner'], null)).toEqual([]);
  });
});
