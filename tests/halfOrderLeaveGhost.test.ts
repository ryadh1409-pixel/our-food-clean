import { planLeaveOrder } from '../services/orderLifecycle';

describe('planLeaveOrder — HalfOrder ghost-member guard', () => {
  const halfMatched = {
    cardId: 'card-1',
    users: ['host', 'joiner'],
    participants: ['host', 'joiner'],
    status: 'matched',
    createdBy: 'host',
    maxUsers: 2,
  };

  it('cancels a matched HalfOrder when the joiner leaves', () => {
    const plan = planLeaveOrder(halfMatched, 'joiner');
    expect(plan.kind).toBe('cancel_half');
    if (plan.kind !== 'cancel_half') return;
    expect(plan.fields.status).toBe('cancelled');
    expect(plan.fields.cancelledBy).toBe('joiner');
    expect(plan.fields.cancelReason).toBe('user');
    expect(plan.fields).not.toHaveProperty('users');
    expect(plan.fields).not.toHaveProperty('participants');
  });

  it('uses account_deleted reason when requested', () => {
    const plan = planLeaveOrder(halfMatched, 'joiner', {
      cancelReason: 'account_deleted',
    });
    expect(plan.kind).toBe('cancel_half');
    if (plan.kind !== 'cancel_half') return;
    expect(plan.fields.cancelReason).toBe('account_deleted');
  });

  it('is a no-op when the HalfOrder is already terminal', () => {
    expect(
      planLeaveOrder({ ...halfMatched, status: 'cancelled' }, 'joiner').kind,
    ).toBe('already_left');
    expect(
      planLeaveOrder({ ...halfMatched, status: 'completed' }, 'host').kind,
    ).toBe('already_left');
  });

  it('does not treat a legacy order as a HalfOrder', () => {
    const plan = planLeaveOrder(
      {
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
        status: 'open',
        createdBy: 'host',
        maxPeople: 2,
      },
      'joiner',
    );
    expect(plan.kind).toBe('leave_participants');
  });
});
