/**
 * Report → user moderation helpers (pure / testable).
 *
 * Raw report document counts are attacker-controlled: one signed-in account can
 * create unlimited `reports` docs. Derived `users.reportCount` must reflect
 * distinct reporters, and account restriction must not be applied from that
 * signal alone (admin ban remains the enforcement path).
 */

/**
 * @param {Array<{ reporterId?: unknown } | null | undefined>} reportDocs
 * @returns {number}
 */
function countUniqueReporters(reportDocs) {
  const reporters = new Set();
  if (!Array.isArray(reportDocs)) return 0;
  for (const data of reportDocs) {
    const reporterId =
      data && typeof data.reporterId === 'string' ? data.reporterId.trim() : '';
    if (reporterId) reporters.add(reporterId);
  }
  return reporters.size;
}

/**
 * Auto-restrict from report volume is unsafe (sybil / spam reports).
 * Always returns false; callers should flag for review instead.
 * @param {number} _uniqueReporterCount
 * @param {number} _threshold
 * @returns {false}
 */
function shouldAutoRestrictFromReports(_uniqueReporterCount, _threshold) {
  return false;
}

module.exports = {
  countUniqueReporters,
  shouldAutoRestrictFromReports,
};
