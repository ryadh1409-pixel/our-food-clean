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

  const summary = (req.body?.summary as string)?.trim() || '';

  try {
    const prompt = summary
      ? `Based on this analytics summary for HalfOrder (food-sharing app in Toronto), write 2-4 concise actionable growth insights. Summary:\n${summary}\n\nRespond with only the insight text.`
      : 'Generate 2-4 concise growth insights for HalfOrder, a food-sharing app in Toronto. Mention peak hours, student areas, or downtown and give 1-2 recommendations. Plain paragraphs only.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    });

    const insight = completion.choices[0]?.message?.content?.trim() || '';
    res.status(200).json({ insight });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: e instanceof Error ? e.message : 'Failed to generate' });
  }
}
