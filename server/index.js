require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Places API (New) — Text Search. Returns up to 5 normalized place objects.
 */
async function searchPlaces(query) {
  if (!GOOGLE_API_KEY || !query || !String(query).trim()) {
    if (!GOOGLE_API_KEY) {
      console.warn('GOOGLE_MAPS_API_KEY is not set; skipping Places search.');
    }
    return [];
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: String(query).trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        'Places API (New) error:',
        response.status,
        data?.error?.message || JSON.stringify(data).slice(0, 300),
      );
      return [];
    }

    const raw = Array.isArray(data.places) ? data.places : [];

    return raw.slice(0, 5).map((place) => {
      const name =
        place.displayName && typeof place.displayName === 'object'
          ? String(place.displayName.text ?? '')
          : '';
      const address =
        typeof place.formattedAddress === 'string'
          ? place.formattedAddress
          : '';
      let location = null;
      if (place.location && typeof place.location === 'object') {
        const lat = place.location.latitude;
        const lng = place.location.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          location = { lat, lng };
        }
      }
      return { name, address, location };
    });
  } catch (err) {
    console.error(
      'searchPlaces:',
      err instanceof Error ? err.message : String(err),
    );
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
    const { message: userMessage } = req.body;

    if (!userMessage) {
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

    console.log('User:', userMessage);

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

User message: ${userMessage}
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

    const places = await searchPlaces(userMessage);

    return res.json({
      reply: aiText,
      places,
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
