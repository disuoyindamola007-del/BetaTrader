import { get, set } from '../../lib/cache.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const PULSE_TTL_MS = 10 * 60_000;
const BRIEFING_TTL_MS = 4 * 60 * 60_000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(change) {
  if (change == null || Math.abs(change) < 0.1) return 'Flat';
  return change > 0 ? 'Rising' : 'Falling';
}

function colorForChange(change) {
  if (change == null || Math.abs(change) < 0.1) return 'neutral';
  return change > 0 ? 'emerald' : 'warning';
}

async function fetchJson(url, provider, options = {}) {
  if (provider && isRateLimited(provider)) throw new Error(`${provider} cooldown active`);
  const response = await fetch(url, options);
  if (response.status === 429) {
    if (provider) triggerRateLimitCooldown(provider);
    throw new Error(`${provider || 'Provider'} rate limit reached`);
  }
  if (!response.ok) throw new Error(`${provider || 'Provider'} request failed: ${response.status}`);
  return response.json();
}

async function loadCryptoPulse() {
  const apiKey = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY || '';
  const headers = { accept: 'application/json' };
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  const [globalData, prices] = await Promise.all([
    fetchJson(`${COINGECKO_BASE}/global`, 'coingecko', { headers }),
    fetchJson(`${COINGECKO_BASE}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`, 'coingecko', { headers }),
  ]);

  return {
    btcDominance: number(globalData?.data?.market_cap_percentage?.btc),
    cryptoMarketChange: number(globalData?.data?.market_cap_change_percentage_24h_usd),
    btcPrice: number(prices?.bitcoin?.usd),
    btcChange: number(prices?.bitcoin?.usd_24h_change),
    ethPrice: number(prices?.ethereum?.usd),
    ethChange: number(prices?.ethereum?.usd_24h_change),
  };
}

async function loadFearAndGreed() {
  const data = await fetchJson('https://api.alternative.me/fng/?limit=1&format=json');
  const latest = data?.data?.[0];
  return { value: number(latest?.value), label: latest?.value_classification || 'Unavailable' };
}

async function loadMarketProxies() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error('Finnhub is not configured');
  const symbols = ['SPY', 'QQQ', 'GLD'];
  const responses = await Promise.all(symbols.map(symbol =>
    fetchJson(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${apiKey}`, 'finnhub')
  ));
  return Object.fromEntries(symbols.map((symbol, index) => [symbol, {
    price: number(responses[index]?.c),
    changePct: number(responses[index]?.dp),
  }]));
}

function makePulse(crypto, fearGreed, proxies) {
  const pulse = [];
  if (fearGreed?.value != null) pulse.push({
    label: 'Fear & Greed', value: String(Math.round(fearGreed.value)),
    sublabel: fearGreed.label, color: fearGreed.value >= 55 ? 'emerald' : fearGreed.value <= 45 ? 'warning' : 'neutral',
  });
  if (crypto?.btcDominance != null) pulse.push({
    label: 'BTC Dom', value: `${crypto.btcDominance.toFixed(1)}%`,
    sublabel: crypto.btcDominance >= 55 ? 'High' : crypto.btcDominance <= 45 ? 'Low' : 'Moderate', color: 'neutral',
  });
  if (crypto?.cryptoMarketChange != null) pulse.push({
    label: 'Crypto 24H', value: `${crypto.cryptoMarketChange >= 0 ? '+' : ''}${crypto.cryptoMarketChange.toFixed(2)}%`,
    sublabel: direction(crypto.cryptoMarketChange), color: colorForChange(crypto.cryptoMarketChange),
  });
  if (proxies?.SPY?.changePct != null) pulse.push({
    label: 'S&P 500 ETF', value: `${proxies.SPY.changePct >= 0 ? '+' : ''}${proxies.SPY.changePct.toFixed(2)}%`,
    sublabel: direction(proxies.SPY.changePct), color: colorForChange(proxies.SPY.changePct),
  });
  if (proxies?.QQQ?.changePct != null) pulse.push({
    label: 'Nasdaq ETF', value: `${proxies.QQQ.changePct >= 0 ? '+' : ''}${proxies.QQQ.changePct.toFixed(2)}%`,
    sublabel: direction(proxies.QQQ.changePct), color: colorForChange(proxies.QQQ.changePct),
  });
  if (proxies?.GLD?.price != null) pulse.push({
    label: 'Gold ETF', value: `$${proxies.GLD.price.toFixed(2)}`,
    sublabel: direction(proxies.GLD.changePct), color: colorForChange(proxies.GLD.changePct),
  });
  return pulse;
}

async function loadPulse() {
  const cached = await get('market:overview:pulse:v1', PULSE_TTL_MS);
  if (cached) return { ...cached, cached: true };

  const [cryptoResult, fearResult, proxyResult] = await Promise.allSettled([
    loadCryptoPulse(), loadFearAndGreed(), loadMarketProxies(),
  ]);
  const crypto = cryptoResult.status === 'fulfilled' ? cryptoResult.value : null;
  const fearGreed = fearResult.status === 'fulfilled' ? fearResult.value : null;
  const proxies = proxyResult.status === 'fulfilled' ? proxyResult.value : null;
  const pulse = makePulse(crypto, fearGreed, proxies);
  if (pulse.length < 3) throw new Error('Insufficient live market data');

  const result = { pulse, raw: { crypto, fearGreed, proxies }, generatedAt: new Date().toISOString() };
  await set('market:overview:pulse:v1', result, PULSE_TTL_MS);
  return { ...result, cached: false };
}

async function loadHeadlines() {
  const cached = await get('news:general', 5 * 60_000);
  if (Array.isArray(cached) && cached.length > 0) return cached.slice(0, 8).map(item => item.headline);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];
  try {
    const data = await fetchJson(`${FINNHUB_BASE}/news?category=general&token=${apiKey}`, 'finnhub');
    return (Array.isArray(data) ? data : []).filter(item => item?.headline).slice(0, 8).map(item => item.headline);
  } catch (error) {
    console.error('Briefing headlines error:', error.message);
    return [];
  }
}

async function loadBriefing(pulseData) {
  const now = new Date();
  const bucket = `${now.toISOString().slice(0, 10)}:${Math.floor(now.getUTCHours() / 4)}`;
  const cacheKey = `market:overview:briefing:v1:${bucket}`;
  const cached = await get(cacheKey, BRIEFING_TTL_MS);
  if (cached) return { ...cached, cached: true };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('AI briefing is not configured');
  const headlines = await loadHeadlines();

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You create concise market briefings for retail traders using only supplied live data and headlines. Return valid JSON only with this exact shape: {"sentiment":"","confidence":0,"summary":"","volatility":"","keyRisk":"","keyDrivers":[""],"watchNext":[""]}. Confidence must be an integer from 0 to 100 and reflect confidence in the interpretation, not a trade signal. Use 2-3 sentences for summary, 2-4 key drivers, and 2-4 watch items. Do not invent events, levels, figures, or dates. Describe uncertain impacts as possibilities. No financial advice.`,
        },
        {
          role: 'user',
          content: `Live market data captured at ${pulseData.generatedAt}:\n${JSON.stringify(pulseData.raw)}\nCurrent headlines (may be empty):\n${JSON.stringify(headlines)}`,
        },
      ],
    }),
  });
  if (response.status === 429) throw new Error('AI briefing is temporarily rate limited');
  if (!response.ok) throw new Error(`Groq briefing failed: ${response.status}`);
  const data = await response.json();
  const briefing = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
  const valid = briefing?.sentiment && Number.isFinite(Number(briefing.confidence))
    && briefing?.summary && briefing?.volatility && briefing?.keyRisk
    && Array.isArray(briefing.keyDrivers) && Array.isArray(briefing.watchNext);
  if (!valid) throw new Error('Incomplete AI briefing');
  briefing.confidence = Math.max(0, Math.min(100, Math.round(Number(briefing.confidence))));

  const result = { briefing, generatedAt: new Date().toISOString() };
  await set(cacheKey, result, BRIEFING_TTL_MS);
  return { ...result, cached: false };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pulseData = await loadPulse();
    let briefing = null;
    let briefingError = null;
    try {
      briefing = await loadBriefing(pulseData);
    } catch (error) {
      console.error('Market briefing error:', error.message);
      briefingError = 'Daily AI Briefing is temporarily unavailable';
    }
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      pulse: pulseData.pulse,
      pulseGeneratedAt: pulseData.generatedAt,
      briefing: briefing?.briefing || null,
      briefingGeneratedAt: briefing?.generatedAt || null,
      briefingError,
    });
  } catch (error) {
    console.error('Market overview error:', error.message);
    return res.status(502).json({ error: 'Live market overview is temporarily unavailable' });
  }
}
