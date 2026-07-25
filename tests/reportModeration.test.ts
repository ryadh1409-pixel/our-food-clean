/**
 * Report moderation: unique reporters + no auto-restrict from spam volume.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  countUniqueReporters,
  shouldAutoRestrictFromReports,
} = require('../functions/lib/reportModeration');

describe('reportModeration', () => {
  describe('countUniqueReporters', () => {
    it('counts distinct reporterIds only', () => {
      expect(
        countUniqueReporters([
          { reporterId: 'attacker' },
          { reporterId: 'attacker' },
          { reporterId: 'attacker' },
          { reporterId: 'attacker' },
          { reporterId: 'attacker' },
        ]),
      ).toBe(1);
    });

    it('counts multiple distinct reporters', () => {
      expect(
        countUniqueReporters([
          { reporterId: 'a' },
          { reporterId: 'b' },
          { reporterId: 'a' },
          { reporterId: 'c' },
        ]),
      ).toBe(3);
    });

    it('ignores missing or blank reporterIds', () => {
      expect(
        countUniqueReporters([
          { reporterId: 'a' },
          { reporterId: '' },
          { reporterId: '   ' },
          {},
          null,
          { reporterId: 123 },
        ]),
      ).toBe(1);
    });

    it('returns 0 for empty or non-array input', () => {
      expect(countUniqueReporters([])).toBe(0);
      expect(countUniqueReporters(null)).toBe(0);
      expect(countUniqueReporters(undefined)).toBe(0);
    });
  });

  describe('shouldAutoRestrictFromReports', () => {
    it('never auto-restricts from report volume (even above threshold)', () => {
      expect(shouldAutoRestrictFromReports(0, 5)).toBe(false);
      expect(shouldAutoRestrictFromReports(5, 5)).toBe(false);
      expect(shouldAutoRestrictFromReports(100, 5)).toBe(false);
    });
  });
});
