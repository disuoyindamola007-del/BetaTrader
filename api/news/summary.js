import { get, set } from '../../lib/cache.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const SUMMARY_TTL_MS = 24 * 60 * 60_000;

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const headline = clean(req.query.headline, 300);
  const source = clean(req.query.source, 100);
  const article = clean(req.query.article, 4000);
  if (!headline) return res.status(400).json({ error: 'Headline is required' });

  const cacheKey = `news:summary:${headline}`;
  const cached = await get(cacheKey, SUMMARY_TTL_MS);
  if (cached) return res.status(200).json({ summary: cached, cached: true });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI news summaries are not configured' });

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_completion_tokens: 180,
        messages: [
          { role: 'system', content: 'Summarize financial news accurately and concisely for a trading app. Plain prose, 2-3 sentences, no markdown and no financial advice.' },
          { role: 'user', content: `Headline: ${headline}\nSource: ${source}\nArticle description: ${article}` },
        ],
      }),
    });
    if (response.status === 429) return res.status(429).json({ error: 'AI summary is temporarily rate limited', rateLimited: true });
    if (!response.ok) throw new Error(`Groq summary failed: ${response.status}`);
    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error('Empty AI summary');

    await set(cacheKey, summary, SUMMARY_TTL_MS);
    return res.status(200).json({ summary, cached: false });
  } catch (error) {
    console.error('News summary error:', error.message);
    return res.status(502).json({ error: 'AI summary is temporarily unavailable' });
  }
}
