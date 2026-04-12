require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');

/**
 * Google Places API (New) — searchText. Returns raw `places` or [] on failure.
 */
async function searchPlaces(query) {
  if (!query || !String(query).trim()) {
    return [];
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY is not set; skipping Places search.');
    return [];
  }

  try {
    const res = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress',
        },
        body: JSON.stringify({
          textQuery: String(query).trim(),
        }),
      },
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(
        'Places API (New) error:',
        res.status,
        data?.error?.message || JSON.stringify(data).slice(0, 300),
      );
      return [];
    }

    return data.places || [];
  } catch (err) {
    console.error('searchPlaces:', err instanceof Error ? err.message : err);
    return [];
  }
}

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

function replyFromOpenAiError(data) {
  if (!data || typeof data !== 'object') return 'OpenAI request failed';
  if (typeof data.error === 'string') return data.error;
  if (
    data.error &&
    typeof data.error === 'object' &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }
  return 'OpenAI request failed';
}

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: 'No message', places: [] });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({
        reply:
          'OPENAI_API_KEY is not set. Add it to .env (see .env.example).',
        places: [],
      });
    }

    console.log('User:', message);

    const prompt = `
You are a food assistant.

Return ONLY JSON.

Extract:
- food
- category
- searchQuery

Example:
{
  "food": "pizza",
  "category": "fast food",
  "searchQuery": "pizza near me"
}

User message: ${message}
`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: prompt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errText = replyFromOpenAiError(data);
      console.log('Clean AI:', errText);
      const status =
        response.status >= 400 && response.status < 600
          ? response.status
          : 502;
      return res.status(status).json({ reply: errText, places: [] });
    }

    const aiText =
      data?.output?.[0]?.content?.[0]?.text || 'No response';

    console.log('Clean AI:', aiText);

    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      parsed = { searchQuery: message };
    }

    const query =
      parsed && parsed.searchQuery ? parsed.searchQuery : message;

    let placesRaw = [];
    try {
      placesRaw = await searchPlaces(query);
    } catch (e) {
      console.error(
        'Places error:',
        e instanceof Error ? e.message : String(e),
      );
      placesRaw = [];
    }

    return res.json({
      reply: aiText,
      places: (placesRaw || []).slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log('Clean AI:', errMsg);
    return res.status(500).json({ reply: errMsg, places: [] });
  }
});

app.listen(3000, () => {
  console.log('🔥 Server REALLY running on port 3000');
});
