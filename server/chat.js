const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in .env');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant inside a food sharing app.',
        },
        { role: 'user', content: message },
      ],
    });

    const reply = completion.choices[0].message.content;

    res.json({ ok: true, response: reply });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, response: 'AI error' });
  }
});

module.exports = router;
