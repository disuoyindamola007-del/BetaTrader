# BetaTrader — How AI Trade Analysis Works

## Overview

BetaTrader's AI analysis system is a **real-time technical analysis pipeline** that combines calculated market indicators with LLM-powered interpretation. When a user clicks "Analyze" on any asset, the app doesn't just show raw numbers — it generates a plain-English technical read that explains what the indicators mean for trading decisions.

---

## The Analysis Pipeline (Step-by-Step)

### Step 1: User Triggers Analysis

When a user is on an asset detail page (e.g., BTC/USD, EUR/USD, AAPL) and clicks the **"Analyze"** button, the `handleAnalyze()` function in `AssetDetail.jsx` fires.

**Prerequisites checked before analysis:**
- Asset symbol must be present
- Live quote data must be available (current price, 24h change)
- Technical indicators must be calculated (RSI, EMA9, EMA21, EMA50)
- Not already analyzing (prevents duplicate requests)

### Step 2: Indicator Calculation (Client-Side)

Before any AI call, BetaTrader calculates technical indicators from raw candle data. This happens in `marketDataService.js`:

**RSI (Relative Strength Index) — 14-period**
```javascript
// Calculates momentum oscillator (0-100)
// >70 = overbought, <30 = oversold
calcRSI(candleData, 14)
```

**EMA (Exponential Moving Average) — 9, 21, 50 periods**
```javascript
// Calculates trend-following moving averages
// EMA9 > EMA21 > EMA50 = bullish stack
// EMA9 < EMA21 < EMA50 = bearish stack
calcEMA(candleData, 9)
calcEMA(candleData, 21)
calcEMA(candleData, 50)
```

These indicators are computed from the candle chart data that's already loaded for the asset's price chart.

### Step 3: API Request to `/api/analyze/[symbol]`

The frontend sends a GET request with query parameters:
```
/api/analyze/BTC?price=67500&changePct=2.3&rsi=62&ema9=66800&ema21=65200&ema50=63100
```

### Step 4: Server-Side Processing

The API route (`api/analyze/[symbol].js`) does the following:

**A. Validation**
- Checks that all required parameters are present and valid numbers
- Returns HTTP 400 if any indicator is missing (insufficient candle history)

**B. Cache Check (5-minute TTL)**
```javascript
const cacheKey = `analyze:${symbol}:${round(changePct, 1)}:${Math.round(rsi)}:${ema9 > ema21}:${ema21 > ema50}`;
```
The cache key is smart — it includes rounded indicator values and EMA relationships. This means:
- If RSI moves from 62.1 to 62.3, it uses the cached analysis (no re-billing)
- If RSI moves from 62 to 68, it generates a fresh analysis
- Cache is stored in Supabase Postgres (shared across all Vercel instances)

**C. Groq API Call**
If no cache hit, the server calls Groq's API:
```javascript
POST https://api.groq.com/openai/v1/chat/completions
Model: openai/gpt-oss-120b
Temperature: 0.4 (balanced creativity/consistency)
Max tokens: 180 (concise response)
```

**The Prompt sent to Groq:**
```
Symbol: BTC
Price: 67500
24h change: +2.3%
RSI(14): 62
EMA structure: short-term EMAs stacked bullish (9 > 21 > 50)

Write a 2-3 sentence technical read for a retail trader. Reference the RSI level and EMA structure directly. No financial advice disclaimers, no "consult a professional" language, no markdown. Plain prose only.
```

**System prompt:**
```
You are a concise technical analysis assistant embedded in a trading app UI. Keep responses short.
```

### Step 5: AI Interpretation & Response

Groq's LLM processes the indicators and generates a plain-English analysis. Example outputs:

**Bullish scenario:**
> "Bitcoin is trading above all key moving averages with the 9-period EMA leading above the 21 and 50, confirming short-term bullish momentum. RSI at 62 sits in neutral-to-strong territory without being overbought, leaving room for further upside if buying pressure continues."

**Bearish scenario:**
> "Price has dropped below the 50-period EMA and the moving averages are stacking bearish, with the 9 below the 21 below the 50. RSI at 38 is approaching oversold territory but hasn't reached it yet, suggesting the downtrend may have more room to run."

**Range-bound scenario:**
> "The EMAs are tangled with no clear stack, indicating a consolidating market. RSI at 52 is dead center, confirming the lack of directional momentum. Price is likely to remain range-bound until a catalyst breaks the equilibrium."

### Step 6: Response Handling

The API returns:
```json
{
  "analysis": "Bitcoin is trading above all key moving averages...",
  "cached": false
}
```

The frontend displays this in the AssetDetail page below the price chart.

---

## How the Bot "Interprets" Indicators

The AI doesn't just regurgitate numbers — it **interprets relationships** between indicators:

### RSI Interpretation Rules (learned by the LLM)

| RSI Range | Interpretation |
|-----------|----------------|
| 0-30 | Oversold — potential bounce candidate |
| 30-50 | Weak/bearish momentum |
| 50-70 | Strong/bullish momentum |
| 70-100 | Overbought — potential pullback candidate |

### EMA Stack Interpretation

| EMA Relationship | Interpretation |
|------------------|----------------|
| EMA9 > EMA21 > EMA50 | Strong uptrend (bullish stack) |
| EMA9 < EMA21 < EMA50 | Strong downtrend (bearish stack) |
| Mixed/crossed | Consolidation or trend change |

### Combined Interpretation

The AI synthesizes multiple signals:
- **RSI + EMA alignment**: "RSI at 75 with bearish EMA stack suggests overbought conditions in a downtrend — potential short opportunity"
- **Divergence detection**: "Price making new highs but RSI failing to confirm — bearish divergence"
- **Momentum shifts**: "RSI crossed above 50 while EMAs are still bearish — early signs of reversal"

---

## Rate Limiting & Cost Control

**Groq Rate Limit:**
- 60-second cooldown triggered on HTTP 429
- Server-side `groqCooldownUntil` variable prevents retry storms

**Cache Strategy:**
- 5-minute server-side cache (Supabase)
- Cache key includes rounded indicator values to maximize hit rate
- Prevents re-billing on minor price fluctuations

**Token Usage:**
- Max 180 tokens per analysis (concise responses)
- Temperature 0.4 balances creativity with consistency

---

## What the Analysis Does NOT Do

1. **No financial advice** — The system prompt explicitly avoids disclaimers, but the AI is instructed to describe conditions, not recommend actions
2. **No fundamental analysis** — Only technical indicators (price-based) are used
3. **No multi-timeframe analysis** — Only the currently displayed timeframe's indicators are sent
4. **No historical context** — The AI doesn't know past support/resistance levels, only current indicator values
5. **No volume analysis** — Volume indicators are not currently included in the prompt

---

## Technical Architecture Summary

```
User clicks "Analyze"
    ↓
Client calculates RSI, EMA9, EMA21, EMA50 from candle data
    ↓
GET /api/analyze/[symbol]?price=X&rsi=Y&ema9=Z...
    ↓
Server validates parameters
    ↓
Server checks Supabase cache (5-min TTL)
    ↓
[Cache miss] → POST to Groq API (openai/gpt-oss-120b)
    ↓
Groq returns plain-English analysis
    ↓
Server caches result in Supabase
    ↓
Client displays analysis below chart
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `src/components/markets/AssetDetail.jsx` | UI component, triggers analysis, displays result |
| `api/analyze/[symbol].js` | Serverless API route, orchestrates Groq call |
| `src/services/marketDataService.js` | Calculates RSI, EMA, Bollinger Bands |
| `lib/cache.js` | Server-side Supabase cache |
| `src/hooks/useMarketData.js` | Fetches candle data for indicator calculation |
