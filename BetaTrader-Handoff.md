# BetaTrader — Project Handoff

**Repo:** `disuoyindamola007-del/BetaTrader` (GitHub)
**Production:** `beta-trader-nu.vercel.app`
**Supabase project:** "BetaTrader" (project id: `incciljsxgujwltugdcj`) — a second project "LearnFromOla" also exists in the same org, unrelated, do not touch
**Dev environment:** Phone-only, no local terminal/IDE — all work happens via mobile browser against live Vercel deployments, Vercel logs, and Supabase dashboard. Full-file rewrites (`cat > file << 'EOF' ... EOF`) are strongly preferred over manual/line-by-line edits.

---

## 1. What BetaTrader is

A mobile-first trading companion app. Not a brokerage — it's an information and decision-support layer that sits alongside wherever the user actually trades. Four asset classes: crypto, forex, commodities, stocks/indices.

**Core features:**
- Live quotes and interactive candlestick charts
- AI-powered technical analysis (real indicators → LLM-generated plain-English read)
- Personal trade journal (entries, exits, stop-loss/take-profit, strategy, emotional state)
- Price/indicator alerts
- Personalized home dashboard (briefing, watchlist, trending, news, economic calendar)
- Universal symbol search

## Current Phase 8 status (Sep 3, 2026)

Phase 8 authentication is underway. Supabase Auth and the initial user-owned schema are live in the BetaTrader project only (`incciljsxgujwltugdcj`). Email/password signup captures first/last name, validates password composition and confirmation, creates profiles through a locked-down trigger, handles confirmation callbacks/expired links, restores sessions, signs out, and gates private screens. Owner-only RLS is enabled on profiles, favorites, journal trades, alerts, and notifications. Same-device local favorites/journal/alerts are additionally scoped by authenticated user ID.

Latest verified work through commit `4ccbda4` plus pending timezone modal fix: authenticated first-name greeting without refresh flicker; real logout; timezone selection sheet; network-first PWA navigation for auth callbacks. Cloud repositories, explicit local-to-cloud import, profile editing/settings sync, recovery/reset, account deletion/export, and two-account RLS/multi-device verification remain open. Do not mark Phase 8 complete.

**Target launch sequence (team's own phased plan):**
1. Core screens fully functional (search, asset detail, markets, analyze, alerts, journal)
2. Backend hardened (timeouts, retry/backoff, per-provider rate limiting, structured logging, no cascading failures)
3. UX polish (loading states, error messages, responsiveness)
4. Code cleanup (dead code, duplication from rapid iteration)
5. Batch 2: user auth, accounts, cloud-synced watchlist/journal/alerts (currently all device-local via localStorage)

---

## 2. Architecture — confirmed real, not assumed

### Data flow
All market data flows through `src/services/marketDataService.js` (single entry point) → `src/hooks/useMarketData.js` (`useQuote`, `useCandles`, `useBatchQuotes`, `useCryptoBatch`). This layer is solid: stale-while-revalidate caching, request deduplication (same in-flight promise shared across callers), smart refresh intervals that pause when the tab is hidden. **Keep as-is, do not rebuild.**

### Per-category API routes (Vercel serverless, root `/api/`)
| Category | Provider(s) | Notes |
|---|---|---|
| Crypto | CoinGecko only | 10 hardcoded symbols: BTC, ETH, SOL, XRP, BNB, ADA, DOT, LINK, DOGE, AVAX. Now uses a registered Demo API key (100 calls/min, 10k/month) — was previously unauthenticated (5-15/min), which was the real cause of chart-flicker complaints. |
| Forex | TwelveData only | 8 hardcoded pairs. Free "Basic 8" plan — 8 requests/min, 800/day (burst limit is the real constraint, not the daily cap). |
| Commodities | TwelveData only | `SYMBOL_MAP`: GOLD→XAU/USD, SILVER→XAG/USD, OIL/CRUDE→WTI/USD, BRENT→BRENT/USD. |
| Stocks | Finnhub → TwelveData → Alpha Vantage (cascading fallback) | Finnhub free tier (60/min general, no index/economic-calendar data). Alpha Vantage last-resort only (very tight free cap, historically ~25/day). |
| AI Analysis | Groq (`openai/gpt-oss-120b`) | `api/analyze/[symbol].js` — real LLM call, independent rate-limit cooldown, 5-min cache keyed on rounded indicator values to avoid re-billing on minor quote jitter. Model was migrated from `llama-3.3-70b-versatile` — see Section 3. |

### Frontend
- `src/components/markets/AssetDetail.jsx` only requires `selectedAsset.symbol` to function fully — `name` is optional (blank subtitle if missing, no crash). Quotes, charts, RSI/EMA/Bollinger, and AI Analysis are all confirmed real and working here.
- No router — `src/AppContext.jsx`'s `navigateToAsset(asset)` just sets `selectedAsset` state and switches the active tab to `'markets'`.

### Caching (fixed this session)
- **Root `lib/cache.js`** (server-side, imported by all `/api/*` routes) — now backed by a Supabase Postgres table (`cache`: key text PK, value jsonb, expires_at timestamptz, RLS enabled with zero policies — service-role-only). This replaced a plain in-memory `Map` that was **not shared across concurrent Vercel serverless instances**, meaning the "cache for 30-60s" guarantee only held per-instance, not app-wide, under real multi-user traffic.
- **`src/lib/cache.js`** (frontend, imported by the browser-side `marketDataService.js`) — deliberately kept as a simple in-memory `Map`. This is correct: it's per-browser-session, scoped naturally per user.
- ⚠️ **CRITICAL PITFALL, already hit once:** these are two separate files at different paths with the same filename. Mixing them up (putting Supabase server code into the frontend file) caused a real production outage — the service-role key tried to load in-browser, crashed the page to blank white, and would have exposed the key in the public JS bundle if it hadn't crashed first. **Always confirm which `cache.js` is being discussed/edited before touching either.**

### Rate limiting (fixed this session)
- Both `lib/rateLimitState.js` (backend) and `src/lib/rateLimitState.js` (frontend) previously used **one global module-level cooldown** — a single 429 from any provider paused every request app-wide for 60s, including categories on completely unrelated providers (e.g., TwelveData failing would freeze CoinGecko/crypto too).
- Both files now key cooldowns **per-provider/category** (`coingecko`, `finnhub`, `twelvedata`, `alphavantage`). All API routes and `marketDataService.js` updated to pass the correct category through every call site.
- Design intent (explicitly confirmed with the product owner): each provider should handle its own market independently; fallback to another provider only happens when the primary is actually down — never a blanket freeze.

---

## 3. Confirmed bugs — fixed this session

1. **Watchlist bug (merged to main):** `HomeScreen.jsx` did `watchlist.map(w => w.symbol)`, but `watchlist` (from `mockData.js`) is an array of plain strings, not objects. `.symbol` on a string returns `undefined`; `getCategory(undefined)` defaults to `'stocks'`, so all 5 entries slipped through as broken requests — producing malformed URLs like `/api/stocks/%2C%2C%2C%2C%2C` (empty symbols joined by commas). Confirmed via Vercel logs: 37 hits on that exact malformed path, causing Finnhub to return HTML error pages that then failed JSON parsing. **Fix:** `watchlist.filter(s => getCategory(s) !== 'crypto')` — no `.map` needed since entries are already symbols.
2. **Commodities route bug (merged to main):** `api/commodities/[symbol].js` had a broken `res.status(200).json(json(candles))` call (calling a nonexistent `json()` function) plus a stray extra `}` — leftover from a bad merge conflict resolution. Fixed back to `res.status(200).json(candles)`.
3. **CoinGecko unauthenticated tier:** was calling the public endpoint with no API key (5-15 calls/min global pool). Fixed by adding a registered Demo API key (100/min, 10k/month).
4. **Cache-file mixup (caught before merge):** see Section 2 above — resolved.
5. **Groq model deprecation (merged to main, confirmed working live):** `api/analyze/[symbol].js` was calling `llama-3.3-70b-versatile`, which Groq deprecated June 17, 2026 and fully decommissioned by end of August 2026 — confirmed via Vercel logs showing `404 model_not_found` on every Analyze request. Migrated to `openai/gpt-oss-120b` (Groq's own recommended replacement for this model). Only the `MODEL` constant changed; auth, caching, and error handling are untouched. Live-tested and confirmed working after deploy.

---

## 4. Confirmed bugs — still open

1. **Oil (`WTI/USD` on TwelveData) returns a genuine HTTP 404.** Confirmed via Vercel logs — not a rate-limit issue, the symbol itself appears unrecognized by TwelveData's API. Needs a corrected symbol format or acceptance that Oil isn't available on the current TwelveData plan.
2. **Silver (`XAG/USD`) shows inconsistent behavior** — logs show both 429 (rate limit) and 404 at different times. Needs a clean retest now that per-provider rate limiting is live, to isolate whether it's purely contention or also has a symbol-format problem like Oil.
3. **SPX/NDX/DJI index charts return 503.** Root cause: index-to-ETF symbol mapping (`SPX→SPY`, `NDX→QQQ`, `DJI→DIA`) is only applied for the Alpha Vantage fallback leg — Finnhub and TwelveData both receive the raw, unmapped symbol (`"SPX"`), which they likely don't recognize, so both legs fail before ever reaching the one leg (Alpha Vantage) with correct mapping. Alpha Vantage's very tight free daily cap compounds this.
4. **Home screen still has real mock data:** AI Briefing and Market Pulse are now real (commits `fe97bdc`, `b5546fb`). News was already real from Phase 3. Trending fallback remains for when live data isn't available.
5. **`mockAssets` (18 hardcoded symbols) still backs Home's watchlist metadata merge** (name/bias/confidence lookup) — not a functional bug since prices are live, but worth noting as a dependency on mock data that should eventually be replaced.
6. **Three `_backup-before-*` folders exist untracked in the repo** (`_backup-before-phase4`, `_backup-before-phase4-20260721-223446`, `_backup-before-kimi-merge`) — unclear if needed, likely repo bloat worth cleaning up.

---

## 5. Feature-by-feature status

| Feature | Status | Notes |
|---|---|---|
| Live quotes/charts | ✅ Real | Solid caching, dedup, stale-while-revalidate |
| Technical indicators (RSI/EMA/Bollinger) | ✅ Real | Computed client-side from real candle data |
| AI Analysis | ✅ Real | Groq LLM call, proper loading/error/rate-limit states |
| Journal | ✅ Real | localStorage-backed, 3-step wizard, live-computed performance stats (win rate, avg win/loss, best/worst trade) |
| Alerts | ✅ Real | localStorage-backed, live price-triggering against real quotes, auto-flips to "triggered" |
| Profile | ✅ Real (partial) | Authenticated first-name identity, real logout, timezone picker, dark mode, and notifications toggles are wired. Personal Info editing, cloud settings sync, Subscription, Security, and Help remain open. |
| Search | ✅ Real | Dynamic provider-backed search is live: CoinGecko searches crypto tokens by name/symbol and preserves each token ID; Finnhub and TwelveData search stocks, forex, and commodities. Search results flow into working quote/chart routes. Assets unsupported by the current provider plan show an explicit "Unavailable on current plan" state. Implemented in commits `8ac94c3`, `82cfe7f`, and `42987c1`; production-tested with PEPE, MSFT, and EUR/USD. |
| Home News/Briefing/Pulse | ✅ All real | News loads real Finnhub feed; AI Briefing generates from real pulse/quotes/news via Groq with 3h client cache; Market Pulse loads real CoinGecko/Alternative.me/Finnhub data. View All opens full news list; article detail shows AI News Breakdown. |
| Economic Calendar | ⏸️ Intentionally parked | "Coming Soon" UI shipped — Finnhub's calendar endpoint is premium-only, decided not worth $10-12/mo yet |
| "Analyze Asset" Home button | ✅ Real | Opens Markets search directly, clears any selected asset, and focuses the search field. |
| SPX/NDX/DJI charts | ❌ Broken (503) | See Section 4.3 |
| Oil / Silver commodities | ❌ Broken (404/429) | See Section 4.1–4.2 |

---

## 6. New-session resume point (Aug 28, 2026)

**Start here — do not rebuild Phase 2 or the Phase 3 news implementation.** Local and remote `main` are clean at commit `b5546fb`.

1. ~~Finish the two remaining Phase 3 browser checks with the user:~~ [x] User confirmed live headline selection and AI summary display on Aug 28, 2026.
2. ~~Get the product decision for the remaining mock Home sections before coding:~~ [x] AI Briefing and Market Pulse implemented and live (commits `fe97bdc`, `b5546fb`).
3. **Keep Economic Calendar parked** as "Coming Soon" because the current Finnhub plan does not support the required calendar endpoint.
4. ~~Phase 3 is not complete until~~ [x] Phase 3 complete — all items implemented, build passes, production deployment ready.
5. After Phase 3 exits, begin **Phase 4 live verification** of Alerts and Journal persistence. Do not rebuild those features before physically testing the existing implementation.

### Current Phase 3 implementation evidence

- Real Finnhub news feed and full list/detail screens: `4b1eaa3`
- Correct Vercel news route layout: `f02d75d`
- Detailed structured AI News Breakdown: `c092372`
- Final breakdown label: `802aa9c`
- Production `/api/news`: HTTP 200 with real Finnhub articles
- Production `/api/news/summary`: HTTP 200 with Overview, Key Developments, Why It Matters, Possible Market Impact, and What to Watch Next
- User confirmed live headline selection and summary display
- AI Briefing generates from real pulse/quotes/news via Groq with 3h client cache: `fe97bdc`
- Market Pulse loads real CoinGecko/Alternative.me/Finnhub data: existing implementation verified live
- Briefing refresh icon removed (automatic cache expiry only): `b5546fb`

---

## 7. Working conventions to preserve

- **Full-file rewrites only.** The user works phone-only via Termux; always provide complete `cat > file << 'EOF' ... EOF` blocks, never ask for manual/line-by-line edits.
- **Verify before proposing fixes.** This project has repeatedly caught assumption-based advice via real Vercel logs, Supabase SQL queries, and build output. Always ask for and review real evidence before diagnosing root causes.
- **Double-check file paths before editing**, especially anything named `cache.js` or `rateLimitState.js` — both exist in two places (root vs. `src/lib/`) with different, non-interchangeable purposes.
- **Search/symbol scope discipline:** never let search surface a symbol the corresponding quote route can't actually serve. If expanding search coverage, expand the underlying supported-symbol list first, not just the search index.
