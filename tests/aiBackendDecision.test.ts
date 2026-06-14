import { parseDecisionFromChatResponse } from '../services/aiBackendDecision';

describe('parseDecisionFromChatResponse', () => {
  it('uses structured food fields for decisions even when a display reply is present', () => {
    const { decision, rawText } = parseDecisionFromChatResponse({
      food: 'pizza',
      category: 'fast food',
      searchQuery: 'pizza near North York',
      reply: 'Here are nearby options for pizza near North York.',
      places: [
        {
          displayName: { text: 'Pizza Place' },
          formattedAddress: '123 Main St',
        },
      ],
    });

    expect(decision).toMatchObject({
      intent: 'recommend_order',
      food: 'pizza',
      reason: 'fast food',
      message: 'pizza near North York',
    });
    expect(rawText).toContain('"intent":"recommend_order"');
  });
});
