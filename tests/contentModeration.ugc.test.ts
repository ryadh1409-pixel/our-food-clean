/**
 * App Store Guideline 1.2 — UGC moderation smoke tests.
 */
import {
  CONTENT_NOT_ALLOWED,
  moderateUserContent,
  moderateChatMessage,
} from '../utils/contentModeration';

describe('UGC content moderation (1.2)', () => {
  it('blocks profanity (case insensitive)', () => {
    const r = moderateUserContent('Hello FUCK world', { maxLength: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(CONTENT_NOT_ALLOWED);
  });

  it('blocks spam link phrase', () => {
    const r = moderateUserContent('spam link here', { maxLength: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(CONTENT_NOT_ALLOWED);
  });

  it('allows normal food chat', () => {
    const r = moderateChatMessage('Pizza at 6pm?', { maxLength: 500 });
    expect(r.ok).toBe(true);
  });
});
