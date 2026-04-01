const express = require('express');
const router = express.Router();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in .env');
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 15000;

router.post('/', async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { message } = req.body;
    const prompt =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : '';
    if (!prompt) {
      return res.json({ ok: false, response: 'Message is required' });
    }

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant inside a food sharing app.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      const apiError =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error
          ? String(payload.error.message)
          : `OpenAI API error (${response.status})`;
      return res.json({ ok: false, response: apiError });
    }

    const reply =
      payload &&
      typeof payload === 'object' &&
      Array.isArray(payload.choices) &&
      payload.choices[0] &&
      payload.choices[0].message &&
      typeof payload.choices[0].message.content === 'string'
        ? payload.choices[0].message.content
        : 'No response generated';

    res.json({ ok: true, response: reply });
  } catch (err) {
    const errObj = err && typeof err === 'object' ? err : null;
    const code =
      errObj && 'code' in errObj ? String(errObj.code) : 'unknown';
    const name =
      errObj && 'name' in errObj ? String(errObj.name) : 'Error';
    const message =
      errObj && 'message' in errObj ? String(errObj.message) : 'Unknown error';
    console.error('FULL ERROR:', {
      name,
      code,
      message,
      cause:
        errObj && 'cause' in errObj
          ? String((errObj.cause && errObj.cause.message) || errObj.cause)
          : null,
    });

    const friendly =
      code === 'ENOTFOUND'
        ? 'Network DNS issue reaching api.openai.com'
        : message || 'Unknown error';
    res.json({
      ok: false,
      response: friendly,
    });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
