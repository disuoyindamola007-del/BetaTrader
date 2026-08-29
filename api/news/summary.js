import { get, set } from '../../lib/cache.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';

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

  const cacheKey = `news:summary:v2:${source}:${headline}`;
  const cached = await get(cacheKey, SUMMARY_TTL_MS);
  if (cached) return res.status(200).json({ summary: cached, cached: true });

  if (isCircuitOpen('groq')) {
    return res.status(503).json({ error: 'AI summary provider temporarily unavailable', circuitOpen: true });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI news summaries are not configured' });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        max_completion_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You explain financial news clearly for retail traders. Return valid JSON only with this exact shape:
{"overview":"","keyDevelopments":[""],"whyItMatters":"","marketImpact":"","whatToWatch":[""]}
Write a detailed but readable breakdown. The overview should be 2-3 sentences. Include 3-5 key developments and 3-5 things to watch. Explain possible effects on relevant stocks, sectors, currencies, commodities, or crypto in the marketImpact field. Clearly describe uncertainty. Use only facts in the supplied headline and description; never invent figures, quotes, events, or outcomes. You may explain general market mechanisms, but label possible effects as possibilities rather than facts. No financial advice.`,
          },
          {
            role: 'user',
            content: `Headline: ${headline}\nSource: ${source || 'Unknown'}\nArticle description: ${article || 'No description was supplied. Explain only what can safely be understood from the headline and clearly state the limited context.'}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 429) return res.status(429).json({ error: 'AI summary is temporarily rate limited', rateLimited: true });
    if (!response.ok) {
      recordFailure('groq');
      throw new Error(`Groq summary failed: ${response.status}`);
    }
    const data = await response.json();
    const rawSummary = data?.choices?.[0]?.message?.content?.trim();
    if (!rawSummary) throw new Error('Empty AI summary');

    let summary;
    try {
      summary = JSON.parse(rawSummary);
    } catch {
      throw new Error('Invalid AI summary format');
    }
    const valid = summary?.overview
      && Array.isArray(summary.keyDevelopments)
      && summary?.whyItMatters
      && summary?.marketImpact
      && Array.isArray(summary.whatToWatch);
    if (!valid) throw new Error('Incomplete AI summary');

    recordSuccess('groq');
    await set(cacheKey, summary, SUMMARY_TTL_MS);
    return res.status(200).json({ summary, cached: false });
  } catch (error) {
    console.error('News summary error:', error.message);
    if (error.name === 'AbortError') {
      recordFailure('groq');
      return res.status(408).json({ error: 'AI summary request timed out' });
    }
    if (!error.message?.includes('Groq summary failed')) {
      recordFailure('groq');
    }
    return res.status(502).json({ error: 'AI summary is temporarily unavailable' });
  }
}
