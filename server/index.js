require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');

const app = express();

app.use(express.json());

// TEST ROUTE
app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

// CHAT — OpenAI Responses API
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({
        error: 'OPENAI_API_KEY is not set. Add it to .env (see .env.example).',
      });
    }

    console.log('User:', message);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: message,
      }),
    });

    const data = await response.json();

    console.log('AI:', data);

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const text =
      data?.output?.[0]?.content?.[0]?.text || 'No response';

    console.log('Clean AI:', text);

    return res.json({
      reply: text,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// START SERVER
app.listen(3000, () => {
  console.log('🔥 Server REALLY running on port 3000');
});
