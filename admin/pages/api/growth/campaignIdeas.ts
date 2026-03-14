import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type CampaignIdea = {
  title: string;
  description: string;
  expectedUsers: string;
  estimatedCost: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ideas?: CampaignIdea[]; error?: string }>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  try {
    const prompt =
      (req.body?.prompt as string)?.trim() ||
      'Generate 4 growth campaign ideas for a food-sharing app called HalfOrder in Toronto. Each idea should have: a short title, a 2-3 sentence description, expected new users (e.g. "50-100"), and estimated cost (e.g. "$200-500"). Format your response as a JSON array of objects with keys: title, description, expectedUsers, estimatedCost. Return only the JSON array, no other text.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '[]';
    const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '');
    let ideas: CampaignIdea[] = [];
    try {
      ideas = JSON.parse(jsonStr);
    } catch {
      ideas = [];
    }
    if (!Array.isArray(ideas)) ideas = [];

    res.status(200).json({ ideas });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error:
        e instanceof Error ? e.message : 'Failed to generate campaign ideas',
    });
  }
}
