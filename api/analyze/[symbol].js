import { get, set } from '../../lib/cache.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const ANALYSIS_TTL_MS = 5 * 60_000; // indicators move slowly; avoid re-billing Groq on every refresh

// Dedicated cooldown for Groq only — deliberately NOT the shared market-data
// rateLimitState (lib/rateLimitState.js), since that cooldown is scoped to
// price/candle providers and a Groq 429 has nothing to do with those.
let groqCooldownUntil = 0;

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function buildPrompt({ symbol, price, changePct, rsi, ema9, ema21, ema50 }) {
  const trend = ema9 > ema21 && ema21 > ema50 ? 'short-term EMAs stacked bullish (9 > 21 > 50)'
    : ema9 < ema21 && ema21 < ema50 ? 'short-term EMAs stacked bearish (9 < 21 < 50)'
    : 'EMAs mixed / no clean stack';

  return `Symbol: ${symbol}
Price: ${price}
24h change: ${changePct}%
RSI(14): ${rsi}
EMA structure: ${trend}

Write a 2-3 sentence technical read for a retail trader. Reference the RSI level and EMA structure directly. No financial advice disclaimers, no "consult a professional" language, no markdown. Plain prose only.`;
}

export default async function handler(req, res) {
  const { symbol } = req.query;
  const { price, changePct, rsi, ema9, ema21, ema50 } = req.query;

  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const parsed = {
    price: Number(price),
    changePct: Number(changePct),
    rsi: Number(rsi),
    ema9: Number(ema9),
    ema21: Number(ema21),
    ema50: Number(ema50),
  };

  if (Object.values(parsed).some((n) => Number.isNaN(n))) {
    return res.status(400).json({ error: 'Missing or invalid indicator data — insufficient candle history for this asset yet' });
  }

  const cacheKey = `analyze:${symbol}:${round(parsed.changePct, 1)}:${Math.round(parsed.rsi)}:${parsed.ema9 > parsed.ema21}:${parsed.ema21 > parsed.ema50}`;

  const cached = await get(cacheKey, ANALYSIS_TTL_MS);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ analysis: cached, cached: true });
  }

  if (Date.now() < groqCooldownUntil) {
    return res.status(429).json({ error: 'AI analysis rate limit reached, try again shortly', rateLimited: true });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set in this environment');
    return res.status(500).json({ error: 'AI analysis is not configured' });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_completion_tokens: 180,
        messages: [
          { role: 'system', content: 'You are a concise technical analysis assistant embedded in a trading app UI. Keep responses short.' },
          { role: 'user', content: buildPrompt({ symbol, ...parsed }) },
        ],
      }),
    });

    if (groqRes.status === 429) {
      groqCooldownUntil = Date.now() + 60_000;
      return res.status(429).json({ error: 'AI analysis rate limit reached, try again shortly', rateLimited: true });
    }

    if (!groqRes.ok) {
      const body = await groqRes.text();
      console.error('Groq error:', groqRes.status, body.slice(0, 300));
      return res.status(502).json({ error: 'AI analysis provider error' });
    }

    const data = await groqRes.json();
    const analysis = data?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      console.error('Unexpected Groq response shape:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: 'AI analysis returned an empty response' });
    }

    await set(cacheKey, analysis, ANALYSIS_TTL_MS);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ analysis, cached: false });

  } catch (error) {
    console.error('Analyze proxy error:', error.message);
    return res.status(500).json({ error: 'Failed to reach AI analysis provider' });
  }
}
