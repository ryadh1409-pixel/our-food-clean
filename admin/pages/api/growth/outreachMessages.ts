import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  const audience = (req.body?.audience as string) || 'Students';

  try {
    const prompt = `Generate outreach message templates for HalfOrder, a food-sharing app in Toronto. Target audience: ${audience}. Return a JSON object with keys: email (short professional email), instagram (casual Instagram DM), push (short push notification under 100 chars). Return only the JSON.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '{}';
    const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '');
    let templates = { email: '', instagram: '', push: '' };
    try {
      templates = JSON.parse(jsonStr);
    } catch {
      //
    }

    res.status(200).json({ templates });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: e instanceof Error ? e.message : 'Failed to generate' });
  }
}
