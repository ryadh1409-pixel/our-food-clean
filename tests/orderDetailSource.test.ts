import { resolveOrderDetailSource, foodCardInviteTargetId } from '../lib/orderDetailSource';

type Row = { kind: 'card' | 'squat' | 'linked' };

describe('resolveOrderDetailSource', () => {
  const card: Row = { kind: 'card' };
  const squat: Row = { kind: 'squat' };
  const linked: Row = { kind: 'linked' };

  it('shows the catalog food card even if orders/{1-10} was squatted', () => {
    const resolved = resolveOrderDetailSource({
      urlId: '1',
      primaryOrder: squat,
      linkedOrder: linked,
      foodCard: card,
    });
    expect(resolved).toEqual({ source: 'food_card', row: card });
  });

  it('ignores a stolen food_cards.orderId pointer on catalog slots', () => {
    const resolved = resolveOrderDetailSource({
      urlId: '7',
      primaryOrder: null,
      linkedOrder: linked,
      foodCard: card,
    });
    expect(resolved).toEqual({ source: 'food_card', row: card });
  });

  it('follows a legitimate AI-card orderId when the URL is the card id', () => {
    const resolved = resolveOrderDetailSource({
      urlId: 'aiCardAutoId',
      primaryOrder: squat,
      linkedOrder: linked,
      foodCard: card,
    });
    expect(resolved).toEqual({ source: 'order', row: linked });
  });

  it('loads a real order URL when no food card exists at that id', () => {
    const resolved = resolveOrderDetailSource({
      urlId: 'realOrderAutoId',
      primaryOrder: squat,
      linkedOrder: null,
      foodCard: null,
    });
    expect(resolved).toEqual({ source: 'order', row: squat });
  });
});

describe('foodCardInviteTargetId', () => {
  it('keeps catalog invites on the card id even if orderId was planted', () => {
    expect(foodCardInviteTargetId({ id: '3', orderId: 'attackerOrder' })).toBe(
      '3',
    );
  });

  it('uses the linked order id for non-slot cards', () => {
    expect(
      foodCardInviteTargetId({ id: 'aiCardAutoId', orderId: 'hostOrder' }),
    ).toBe('hostOrder');
  });
});
