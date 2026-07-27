/**
 * Shared gate for Admin SDK mutator routes that must not be publicly callable.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} [envValue] override for tests; defaults to process.env.CHAT_INTERNAL_API_KEY
 * @returns {boolean} true when the request may proceed
 */
function requireInternalApiKey(req, res, envValue = process.env.CHAT_INTERNAL_API_KEY) {
  const expected = typeof envValue === 'string' ? envValue.trim() : '';
  if (!expected) {
    res.status(503).json({ ok: false, error: 'Internal API key not configured' });
    return false;
  }
  const headerKey =
    typeof req.headers['x-internal-api-key'] === 'string'
      ? req.headers['x-internal-api-key'].trim()
      : '';
  const auth =
    typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  const bearer =
    auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = headerKey || bearer;
  if (!provided || provided !== expected) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { requireInternalApiKey };
