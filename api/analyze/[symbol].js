import { get, set } from '../../lib/cache.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const ANALYSIS_TTL_MS = 5 * 60_000;

let groqCooldownUntil = 0;

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function describeEMAStack(ema9, ema21, ema50) {
  if (ema9 > ema21 && ema21 > ema50) return 'bullish stack (9 > 21 > 50)';
  if (ema9 < ema21 && ema21 < ema50) return 'bearish stack (9 < 21 < 50)';
  return 'mixed / no clean stack';
}

function describeRSI(rsi) {
  if (rsi > 70) return `overbought at ${rsi}`;
  if (rsi > 60) return `approaching overbought at ${rsi}`;
  if (rsi > 50) return `bullish momentum at ${rsi}`;
  if (rsi > 40) return `neutral at ${rsi}`;
  if (rsi > 30) return `approaching oversold at ${rsi}`;
  return `oversold at ${rsi}`;
}

function describePricePosition(price, bbUpper, bbLower, high24h, low24h) {
  const range = bbUpper - bbLower;
  const position = range > 0 ? ((price - bbLower) / range * 100).toFixed(0) : 50;
  const parts = [];

  if (position >= 80) parts.push(`near upper Bollinger Band (${position}th percentile of band range)`);
  else if (position <= 20) parts.push(`near lower Bollinger Band (${position}th percentile of band range)`);
  else parts.push(`mid-range within Bollinger Bands (${position}th percentile)`);

  if (high24h && low24h) {
    const dayRange = high24h - low24h;
    if (dayRange > 0) {
      const dayPosition = ((price - low24h) / dayRange * 100).toFixed(0);
      if (dayPosition >= 80) parts.push(`near 24h high (${dayPosition}th percentile of daily range)`);
      else if (dayPosition <= 20) parts.push(`near 24h low (${dayPosition}th percentile of daily range)`);
    }
  }

  return parts.join(', ');
}

function buildPrompt(data) {
  const {
    symbol, price, changePct,
    // Current timeframe indicators
    rsi, ema9, ema21, ema50, bbUpper, bbLower, volume24h,
    high24h, low24h,
    // Higher timeframe (may be null if insufficient history)
    htEma9, htEma21, htEma50, htRsi, htTimeframe,
    // News
    newsContext,
  } = data;

  const currentEMAStack = describeEMAStack(ema9, ema21, ema50);
  const currentRSI = describeRSI(rsi);
  const pricePosition = describePricePosition(price, bbUpper, bbLower, high24h, low24h);

  // Higher timeframe analysis (only if data available)
  const hasHtData = htEma9 != null && htEma21 != null && htEma50 != null;
  const htEMAStack = hasHtData ? describeEMAStack(htEma9, htEma21, htEma50) : 'Insufficient data';
  const htRSI = hasHtData ? describeRSI(htRsi) : 'Insufficient data';
  const currentTrend = ema9 > ema21 && ema21 > ema50 ? 'bullish' : ema9 < ema21 && ema21 < ema50 ? 'bearish' : 'mixed';
  const htTrend = hasHtData ? (htEma9 > htEma21 && htEma21 > htEma50 ? 'bullish' : htEma9 < htEma21 && htEma21 < htEma50 ? 'bearish' : 'mixed') : 'unknown';
  const trendsAgree = hasHtData && currentTrend === htTrend && currentTrend !== 'mixed';

  // Count confluence factors (only count higher timeframe if data available)
  let bullishFactors = 0, bearishFactors = 0;
  if (currentTrend === 'bullish') bullishFactors++;
  if (currentTrend === 'bearish') bearishFactors++;
  if (hasHtData) {
    if (htTrend === 'bullish') bullishFactors++;
    if (htTrend === 'bearish') bearishFactors++;
  }
  if (rsi > 50) bullishFactors++;
  if (rsi < 50) bearishFactors++;
  if (hasHtData && htRsi > 50) bullishFactors++;
  if (hasHtData && htRsi < 50) bearishFactors++;
  if (price > (bbUpper + bbLower) / 2) bullishFactors++;
  else bearishFactors++;

  const totalFactors = bullishFactors + bearishFactors;
  const alignment = totalFactors > 0
    ? Math.round((Math.max(bullishFactors, bearishFactors) / totalFactors) * 100)
    : 50;

  let prompt = `Analyze ${symbol} with institutional-grade rigor. Write as a knowledgeable analyst explaining current conditions to someone who understands trading basics.

## Current Timeframe Data
- Symbol: ${symbol}
- Price: $${price}
- 24h change: ${changePct}%
- RSI(14): ${rsi} (${currentRSI})
- EMA structure: ${currentEMAStack}
- Bollinger Bands: Upper $${bbUpper?.toFixed(2) || 'N/A'}, Lower $${bbLower?.toFixed(2) || 'N/A'}
- Price position: ${pricePosition}
- 24h range: $${low24h?.toFixed(2) || 'N/A'} – $${high24h?.toFixed(2) || 'N/A'}
- 24h volume: ${volume24h ? volume24h.toLocaleString() : 'N/A'}

## Higher Timeframe Context (${htTimeframe || '4h/daily'})
${hasHtData ? `- RSI(14): ${htRsi} (${htRSI})
- EMA structure: ${htEMAStack}` : '- Insufficient historical data for higher timeframe analysis'}

## Timeframe Agreement
Current timeframe trend: ${currentTrend}
${hasHtData ? `Higher timeframe trend: ${htTrend}
${trendsAgree ? '✓ Trends are aligned — higher timeframe confirms current direction' : '⚠ Trends conflict — current timeframe disagrees with higher timeframe, lowering confidence'}` : 'Higher timeframe data not available — analysis based on current timeframe only'}

## Confluence Analysis
Bullish factors: ${bullishFactors}/${totalFactors}
Bearish factors: ${bearishFactors}/${totalFactors}
Alignment strength: ${alignment}%
${alignment >= 70 ? 'Strong alignment across multiple signals' : alignment >= 50 ? 'Moderate alignment with some conflicting signals' : 'Mixed signals — no clear consensus across indicators'}

${newsContext ? `## Relevant News
${newsContext}

If news was used in forming this analysis, state so. If news sentiment conflicts with the technical picture, note that explicitly.` : `## News Context
No notable news currently relevant to ${symbol}. Base analysis on technical factors only.`}

## Output Format
Structure your response as follows:

**Trend Read** — 2-3 sentences on trend direction across both timeframes, noting agreement or conflict

**Momentum** — 1-2 sentences on RSI reading and what it implies

**Volatility & Range** — 1-2 sentences on Bollinger Band position, 24h range context, and whether volume supports the current move

${newsContext ? '**News Context** — 1 sentence on whether news is relevant and its sentiment' : ''}
**Overall Read** — 1-2 sentences synthesizing alignment/conflict across all factors above

Keep language plain and clear. No jargon without explanation. No specific price targets, entry zones, stop losses, or buy/sell recommendations. This is an advisory read of current conditions only.`;

  return prompt;
}

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  // Parse all indicator data
  const data = {
    symbol,
    price: Number(req.query.price),
    changePct: Number(req.query.changePct ?? 0),
    // Current timeframe
    rsi: Number(req.query.rsi),
    ema9: Number(req.query.ema9),
    ema21: Number(req.query.ema21),
    ema50: Number(req.query.ema50),
    bbUpper: req.query.bbUpper ? Number(req.query.bbUpper) : null,
    bbLower: req.query.bbLower ? Number(req.query.bbLower) : null,
    volume24h: req.query.volume24h ? Number(req.query.volume24h) : null,
    high24h: req.query.high24h ? Number(req.query.high24h) : null,
    low24h: req.query.low24h ? Number(req.query.low24h) : null,
    // Higher timeframe
    htEma9: req.query.htEma9 ? Number(req.query.htEma9) : null,
    htEma21: req.query.htEma21 ? Number(req.query.htEma21) : null,
    htEma50: req.query.htEma50 ? Number(req.query.htEma50) : null,
    htRsi: req.query.htRsi ? Number(req.query.htRsi) : null,
    htTimeframe: req.query.htTimeframe || '4h',
    // News
    newsContext: req.query.news ? decodeURIComponent(req.query.news) : null,
  };

  // Validate required fields
  const required = ['price', 'rsi', 'ema9', 'ema21', 'ema50'];
  if (required.some(f => Number.isNaN(data[f]))) {
    return res.status(400).json({ error: 'Missing or invalid indicator data — insufficient candle history for this asset yet' });
  }

  // Build cache key from all relevant data
  const cacheKey = `analyze:${symbol}:${round(data.price, 2)}:${Math.round(data.rsi)}:${data.ema9 > data.ema21}:${data.ema21 > data.ema50}:${data.htEma9 ? (data.htEma9 > data.htEma21) : 'none'}`;

  const cached = await get(cacheKey, ANALYSIS_TTL_MS);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ analysis: cached, cached: true });
  }

  if (Date.now() < groqCooldownUntil) {
    return res.status(429).json({ error: 'AI analysis rate limit reached, try again shortly', rateLimited: true });
  }

  if (isCircuitOpen('groq')) {
    return res.status(503).json({ error: 'AI analysis provider temporarily unavailable', circuitOpen: true });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set in this environment');
    return res.status(500).json({ error: 'AI analysis is not configured' });
  }

  const prompt = buildPrompt(data);

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_completion_tokens: 500,
        messages: [
          { role: 'system', content: 'You are a technical analysis assistant that provides institutional-grade market analysis. Write in clear, plain language. Always advisory — never recommend specific trades, price targets, or entry/exit points. Structure responses with labeled sections.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (response.status === 429) {
      groqCooldownUntil = Date.now() + 60_000;
      return res.status(429).json({ error: 'AI analysis rate limit reached, try again shortly', rateLimited: true });
    }

    if (!response.ok) {
      const body = await response.text();
      console.error('Groq error:', response.status, body.slice(0, 300));
      recordFailure('groq');
      return res.status(502).json({ error: 'AI analysis provider error' });
    }

    const responseData = await response.json();
    const analysis = responseData?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      console.error('Unexpected Groq response shape:', JSON.stringify(responseData).slice(0, 300));
      recordFailure('groq');
      return res.status(502).json({ error: 'AI analysis returned an empty response' });
    }

    recordSuccess('groq');
    await set(cacheKey, analysis, ANALYSIS_TTL_MS);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ analysis, cached: false });

  } catch (error) {
    console.error('Analyze proxy error:', error.message);
    recordFailure('groq');
    return res.status(500).json({ error: 'Failed to reach AI analysis provider' });
  }
}
