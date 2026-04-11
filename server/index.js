/**
 * Minimal OpenAI Responses API proxy.
 *
 * Set OPENAI_API_KEY in .env (never commit real keys).
 * Run: node server/index.js
 */
require('dotenv').config();

const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '256kb' }));

const AGENT_SYSTEM_PROMPT = `You are an AI food agent.

You DO NOT ask the user to choose.

You decide and recommend.

Return ONLY JSON (no markdown, no prose):

{
  "intent": "recommend_order",
  "restaurant": "",
  "food": "",
  "estimated_price": 0,
  "suggest_split": false,
  "reason": ""
}

Rules:
- Always recommend ONE best option (one restaurant name, one dish).
- If estimated_price > 20 → suggest_split must be true.
- Be decisive; no multiple choices or questions.
- Use realistic US-style prices as numbers (e.g. 18.5).
- intent must be "recommend_order" unless the user only gave location — then you may use intent "ask_location" with empty strings and zeros where not applicable.
- For a normal food request, intent is always "recommend_order".`;

app.post('/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: 'OPENAI_API_KEY is not set. Add it to your .env file.' });
  }

  const { message } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Expected JSON body: { "message": "..." }' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: AGENT_SYSTEM_PROMPT,
        input: message.trim(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('OpenAI request failed:', msg);
    return res.status(502).json({ error: 'Upstream request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
