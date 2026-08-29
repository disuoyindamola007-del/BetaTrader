import { get, set } from '../../lib/cache.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const EXPLANATION_TTL_MS = 6 * 60 * 60_000;
const ALLOWED_METRICS = new Set([
  'Fear & Greed', 'BTC Dom', 'Crypto 24H',
  'S&P 500 ETF', 'Nasdaq ETF', 'Gold ETF',
]);

let groqCooldownUntil = 0;

function bucketValue(metric, rawValue) {
  const numeric = Number(String(rawValue).replace(/[^0-9+.-]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  if (metric === 'Fear & Greed') return Math.round(numeric / 5) * 5;
  if (metric === 'BTC Dom') return Math.round(numeric / 2) * 2;
  if (metric === 'Gold ETF') return Math.round(numeric / 5) * 5;
  return Math.round(numeric * 2) / 2;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : '';
  const value = typeof req.query.value === 'string' ? req.query.value.trim().slice(0, 30) : '';
  const signal = typeof req.query.signal === 'string' ? req.query.signal.trim().slice(0, 40) : '';
  if (!ALLOWED_METRICS.has(metric) || !value) return res.status(400).json({ error: 'Invalid market metric' });

  const bucket = bucketValue(metric, value);
  if (bucket == null) return res.status(400).json({ error: 'Invalid market metric value' });
  const metricKey = metric.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cacheKey = `market:explain:v1:${metricKey}:${bucket}`;
  const cached = await get(cacheKey, EXPLANATION_TTL_MS);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ explanation: cached.explanation || cached, cached: true });
  }

  if (Date.now() < groqCooldownUntil) {
    return res.status(429).json({ error: 'AI context is temporarily unavailable', rateLimited: true });
  }

  if (isCircuitOpen('groq')) {
    return res.status(503).json({ error: 'AI context provider temporarily unavailable', circuitOpen: true });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI context is not configured' });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_completion_tokens: 220,
        messages: [
          {
            role: 'system',
            content: 'You are a concise market explainer inside a retail trading companion. Explain the supplied reading in 2-3 short plain-language sentences. Describe possible cross-market meaning and uncertainty. Do not invent current events or data, do not predict outcomes, and do not give financial advice. Plain prose only, with no markdown.',
          },
          {
            role: 'user',
            content: `Explain what a ${metric} reading of ${value}${signal ? ` (${signal})` : ''} means for markets right now.`,
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 429) {
      groqCooldownUntil = Date.now() + 60_000;
      return res.status(429).json({ error: 'AI context is temporarily unavailable', rateLimited: true });
    }
    if (!response.ok) {
      recordFailure('groq');
      console.error('Market explainer Groq error:', response.status, (await response.text()).slice(0, 300));
      return res.status(502).json({ error: 'AI context is temporarily unavailable' });
    }

    const data = await response.json();
    const explanation = data?.choices?.[0]?.message?.content?.trim();
    if (!explanation) {
      recordFailure('groq');
      return res.status(502).json({ error: 'AI context is temporarily unavailable' });
    }

    recordSuccess('groq');
    await set(cacheKey, { explanation }, EXPLANATION_TTL_MS);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ explanation, cached: false });
  } catch (error) {
    console.error('Market explainer error:', error.message);
    if (error.name === 'AbortError') {
      recordFailure('groq');
      return res.status(408).json({ error: 'AI context request timed out' });
    }
    return res.status(502).json({ error: 'AI context is temporarily unavailable' });
  }
}
