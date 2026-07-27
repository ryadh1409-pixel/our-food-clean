const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { requireInternalApiKey } = require('../server/internalApiAuth');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('chat internal API key gate', () => {
  it('rejects when key is not configured', () => {
    const res = mockRes();
    assert.equal(requireInternalApiKey({ headers: {} }, res, ''), false);
    assert.equal(res.statusCode, 503);
  });

  it('rejects missing credentials', () => {
    const res = mockRes();
    assert.equal(requireInternalApiKey({ headers: {} }, res, 'secret'), false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects wrong key', () => {
    const res = mockRes();
    assert.equal(
      requireInternalApiKey(
        { headers: { 'x-internal-api-key': 'nope' } },
        res,
        'secret',
      ),
      false,
    );
    assert.equal(res.statusCode, 401);
  });

  it('accepts x-internal-api-key', () => {
    const res = mockRes();
    assert.equal(
      requireInternalApiKey(
        { headers: { 'x-internal-api-key': 'secret' } },
        res,
        'secret',
      ),
      true,
    );
  });

  it('accepts Authorization Bearer', () => {
    const res = mockRes();
    assert.equal(
      requireInternalApiKey(
        { headers: { authorization: 'Bearer secret' } },
        res,
        'secret',
      ),
      true,
    );
  });
});
