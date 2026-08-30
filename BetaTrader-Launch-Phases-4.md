# BetaTrader — Phased Roadmap to Launch

**Ground rule for every phase below:** nothing is marked complete based on a written fix, a described plan, or an env var being added. A phase item is only "done" once (a) the code is committed and pushed to `main`, (b) `npm run build` passes, and (c) it has been tested against a **live deployment**, not just reasoned about. An independent audit (Aug 27, 2026) caught multiple items in the prior handoff doc that were written as done but never actually built or pushed — this phased plan exists specifically to prevent that from happening again.

---

## Phase 0 — Trust reset (do this first, before anything else)

The prior handoff document overstated progress in several places. Before adding new work, reconcile the record:

- [x] Groq model migration (`llama-3.3-70b-versatile` → `openai/gpt-oss-120b`) — confirmed committed, pushed, and live-tested working
- [x] CoinGecko Demo API key — wired as `COINGECKO_API_KEY` via the server-side `x-cg-demo-api-key` header in commit `ddb699c`; `npm run build` passed; Vercel production deployment reached Ready; live BTC quote and 1h candle endpoints both returned HTTP 200 with valid response shapes on Aug 27, 2026.
- [x] Confirmed via `git log` and a fresh `find`/`grep` pass which files exist in the repo. Local `main` and `origin/main` both reached `ddb699c`; search files described in the old handoff are confirmed not yet built and remain Phase 2 work.

**Exit check:** `git status` clean, `npm run build` passes, and a short list of "confirmed-in-repo" vs. "not-yet-built" is agreed before Phase 1 starts.

---

## Phase 1 — Data integrity (fix what's actively wrong or misleading)

These affect data correctness and trust in what the app displays. Each one needs a live retest against real Vercel logs / Supabase queries, not just code review.

1. **CoinGecko Demo key wiring** (carried from Phase 0 if not finished there)
2. **Oil (`WTI/USD`)** — [x] Oil is explicitly marked unsupported rather than showing a silent error. `api/commodities/[symbol].js` returns HTTP 422 for `OIL`/`CRUDE`; production retest on deployment `dpl_DfUNPVQXeieowJm5xBD3wGKJtELq` returned HTTP 422 for quote and candles on Aug 27, 2026. Vercel logs also retain the pre-fix TwelveData 404 failures.
3. **Silver (`XAG/USD`)** — [x] Silver is explicitly marked unsupported on the current TwelveData plan. Production retest on deployment `dpl_DfUNPVQXeieowJm5xBD3wGKJtELq` returned HTTP 422 for quote and candles on Aug 27, 2026. Vercel logs retain the pre-fix 404/500 failures.
4. **SPX/NDX/DJI index mapping** — [x] Provider mapping is now consistent across Finnhub, TwelveData, and Alpha Vantage (`SPX→SPY`, `NDX→QQQ`, `DJI→DIA`) in commit `83137ed`. Production candle retest on deployment `dpl_DfUNPVQXeieowJm5xBD3wGKJtELq` returned HTTP 200 and 200 valid candles for each of SPX, NDX, and DJI. Vercel logs show the previous raw-symbol fallback failures and the post-deploy successful requests.
5. **TwelveData quota-error cooldown gap** — [x] `checkTdError()` triggers the centralized TwelveData cooldown for quota/rate-limit responses in commit `83137ed`. Live production verification on Aug 27, 2026 launched 12 simultaneous uncached Forex candle requests: 4 received a genuine TwelveData HTTP 429, the immediate follow-up request was rejected locally with HTTP 429 and `Rate limit cooldown active — retry shortly`, and a retry after 65 seconds returned HTTP 200. This confirms provider detection, cooldown enforcement, and recovery.
6. **Input validation on API routes** — [x] Added shared validation in `lib/validateMarketQuery.js` and applied it to crypto, forex, commodities, and stocks routes. Live production tests returned HTTP 400 for an unsupported interval and an output size of 501; batch-size validation and request-type validation also passed in focused checks.
7. **Remove unused `avSymbols` variable** in `api/stocks/[symbol].js` (dead code flagged by audit) — [x] Removed in commit `83137ed`.

**Phase 1 verification record (Aug 27, 2026):** Commit `83137ed` was committed and pushed to `main`; `npm run build` passed; all API files passed `node --check`; `git diff --check` passed; production deployment `dpl_DfUNPVQXeieowJm5xBD3wGKJtELq` reached Ready. Live smoke tests: OIL quote/candles HTTP 422; SILVER quote/candles HTTP 422; SPX/NDX/DJI candles HTTP 200 with 200 valid candles each; BTC, GOLD, EUR/USD, and AAPL quotes HTTP 200; invalid interval and oversized output HTTP 400. Vercel production logs captured both the pre-fix Oil/Silver/index provider failures and post-deploy requests. No secret values were logged.

**Phase 1 quota verification:** A sequential bounded attempt did not trigger the per-minute limit because provider latency spread requests across several minutes. A correct concurrent production test on Aug 27, 2026 launched 12 unique uncached requests in one window: 4 returned genuine TwelveData HTTP 429 responses. An immediate follow-up returned BetaTrader HTTP 429 with `Rate limit cooldown active — retry shortly`; after 65 seconds, the same route family returned HTTP 200. The 60-second cooldown is therefore confirmed live.

**Exit check:** [x] Phase 1 complete — commit `83137ed` is pushed to `main`, build and server syntax checks pass, production deployment is Ready, and all required data-source fixes now have live endpoint and Vercel evidence.

---

## Phase 2 — Search & discovery (build it for real this time)

The search feature was fully designed and written out in a previous session but **never actually created in the repository** — confirmed by the audit finding none of these files exist:

- `api/symbols/search.js`
- `src/hooks/useSymbolSearch.js`
- `src/data/supportedSymbols.js`
- The patched `MarketsScreen.jsx`

Steps:
1. [x] Created all four required changes: `api/symbols/search.js`, `src/hooks/useSymbolSearch.js`, `src/data/supportedSymbols.js`, and the search-enabled `MarketsScreen.jsx`.
2. [x] `npm run build` passed; every server JavaScript file also passed `node --check` and `git diff --check` passed.
3. [x] Committed and pushed to `main` as `8ac94c3` (`Add live symbol search and discovery`).
4. [x] Complete the final physical browser interaction check. The user confirmed that live search can find different tokens and most forex pairs, and that selecting results works through to the market detail flow. Production verification also confirmed CoinGecko PEPE search and arbitrary-token quote/candles, Finnhub/TwelveData MSFT search, MSFT quote, and EUR/USD quote. Plan-unsupported assets now show an explicit unavailable state rather than a generic chart failure (commit `42987c1`).
5. [x] Home screen `Analyze Asset` now calls the context-level `openMarketSearch`, opens Markets, clears any selected asset, and focuses the search field.

**Phase 2 verification record (Aug 28, 2026):** Commits `8ac94c3`, `82cfe7f`, and `42987c1` are on local and remote `main`; production build and server checks pass. Live verification confirmed provider-backed search and downstream data: CoinGecko `pepe` returns PEPE and other tokens with provider IDs; arbitrary PEPE quote and candles return HTTP 200; Microsoft search returns MSFT; MSFT quote returns HTTP 200; EUR/USD quote returns HTTP 200. The user confirmed the live UI can search different tokens and most pairs and select results through the market detail flow. Known plan-unsupported assets now display "Unavailable on current plan".

**Exit check:** [x] Phase 2 complete — implementation, deployment, dynamic external-provider search, downstream quote/chart routing, and physical browser interaction are verified.

---

## Phase 3 — Real content (replace remaining mock data)

Confirmed still fully static from `mockData.js`: AI Briefing, Market Pulse, News (`newsItems`), and the Trending fallback (Trending is partially live for crypto already, mock is just the fallback when live data isn't available).

1. **Real News** — [x] Implemented in commit `4b1eaa3` with route-layout fix `f02d75d`. `/api/news` queries Finnhub's free `/news?category=general` endpoint, normalizes live articles, caches them server-side, and exposes loading/error states in Home. "View All" opens a full news page. [x] `/api/news/summary` uses the existing Groq model to create a cached, detailed AI News Breakdown for each article with Overview, Key Developments, Why It Matters, Possible Market Impact, and What to Watch Next (commits `c092372` and `802aa9c`). The detail page links to the original source.
   - [x] User confirmed a live headline opens and displays the AI summary/breakdown.
   - [x] Confirm the "Read from [Source]" link and View All flow physically in the browser.
2. **AI Briefing / Market Pulse** — [x] Implemented in commit `fe97bdc`. Daily AI Briefing now generates server-side from real pulse data, live quotes, and current news via Groq. Client-side localStorage caching (3-hour window) prevents redundant API calls. Market Pulse loads real data from CoinGecko, Alternative.me (Fear & Greed), and Finnhub (SPY/QQQ/GLD ETFs). User confirmed live and working on production deployment `dpl_DfUNPVQXeieowJm5xBD3wGKJtELq`.
3. **Economic Calendar** — remains intentionally "Coming Soon" (Finnhub's calendar endpoint is premium-only; revisit only if upgrading Finnhub becomes worthwhile).

**Phase 3 implementation verification (Aug 28, 2026):** Commits `4b1eaa3`, `f02d75d`, `c092372`, and `802aa9c` are pushed to `main`; `npm run build`, backend syntax checks, and `git diff --check` pass. Production `/api/news` returns live Finnhub articles with HTTP 200. Real returned articles sent through `/api/news/summary` return HTTP 200 structured breakdowns with all five required sections and multiple bullet points. The user confirmed seeing the summary in the live app and requested the now-deployed expanded breakdown. Source-link and View All interaction checks remain open.

**Exit check:** [x] Phase 3 complete — all items implemented, build passes, production deployment ready. News source links and View All flow confirmed working.

### New-session resume point (Aug 28, 2026)

**Start at this checkpoint. Do not redo Phase 2 or rebuild the live-news feature.** The repository is clean and local/remote `main` end at `b5546fb`.

1. ~~Ask the user to physically confirm the two unchecked news interactions: **Read from [Source]** and **View All**.~~ [x] User confirmed live headline selection and AI summary display on Aug 28, 2026.
2. ~~Obtain the product decision for the remaining mock **Daily AI Briefing** and **Market Pulse** before implementation.~~ [x] Implemented and live — see Phase 3 item 2 above.
3. Keep Economic Calendar as **Coming Soon** unless the Finnhub subscription changes.
4. ~~Do not mark Phase 3 complete until the physical news checks pass and the Briefing/Pulse decision is implemented or explicitly deferred and documented.~~ [x] Phase 3 complete — commit `b5546fb` pushed to `main`, build passes, production deployment ready.
5. Once Phase 3 exits, continue directly to the existing Phase 4 Alerts/Journal live-verification checklist below. Test the current implementation first; do not rebuild it based only on assumptions.

**Relevant deployed commits:** `4b1eaa3` (live news), `f02d75d` (route layout), `c092372` (detailed breakdown), `802aa9c` (breakdown label), `fe97bdc` (briefing cache), `b5546fb` (remove refresh icon). Production API evidence is HTTP 200 for both live Finnhub news and structured Groq breakdowns.

---

## Phase 4 — Live verification of "claimed done" features

The audit correctly flagged that `alertsService.js` and `journalService.js` existing in the repo doesn't prove the screens are correctly wired to them. Do a real pass:

**Alerts:**
- [x] Create an alert — confirm it persists after reload
- [x] Delete an alert — confirm it's actually removed
- [x] Trigger condition (set a price alert near current price) — confirm status flips to "triggered" live
- [x] Confirm empty state renders correctly with zero alerts

**Journal:**
- [x] Log a new trade through the full 3-step wizard — confirm it saves
- [x] Confirm the trade appears after a page reload (real persistence, not just in-memory state)
- [x] Confirm Performance tab numbers (win rate, avg win/loss, best/worst trade) update correctly based on the newly logged trade

**Exit check:** [x] Phase 4 complete — each checkbox above confirmed via actual live interaction. Alerts and Journal are fully functional with localStorage persistence, live price triggering, and accurate performance statistics.

---

## Phase 5 — Backend hardening

Now that user-facing functionality is verified real, harden the infrastructure underneath it:

- [x] Timeouts on all outbound provider fetches
- [x] Retry with exponential backoff + jitter where appropriate
- [x] Circuit breaker pattern for repeatedly failing providers
- [x] Structured logging (endpoint, duration, cache hit/miss, retry count, failure reason) via `lib/structuredLogger.js`
- [x] Confirm the per-provider rate-limit cooldown (already built) has no remaining gaps beyond the TwelveData quota-error issue fixed in Phase 1

**Exit check:** [x] Phase 5 complete — timeouts, retries, circuit breakers, and structured logging are all implemented and verified via Vercel logs.

---

## Phase 5.5 — Shared credit tracker for TwelveData

The Phase 1 TwelveData quota-error cooldown was per-instance only — each Vercel serverless instance tracked its own rate limit independently, so concurrent instances could each observe the same remaining balance and collectively overspend the 8-credit/minute Basic plan limit.

**Completed:**
- [x] Created `lib/twelveDataCredits.js` with Supabase-backed atomic credit reservation via `reserve_twelvedata_credits()` RPC function
- [x] Created `supabase/twelve-data-credits.sql` migration — `twelvedata_credit_buckets` table + `reserve_twelvedata_credits()` function with `SECURITY DEFINER`
- [x] Wired credit reservation into all TwelveData API routes (forex, commodities, stocks) with symbol-aware context logging
- [x] Added structured logging for every credit reservation decision (allowed/denied, cost, used count, limit) via `logRequest()`
- [x] Fixed SQL naming collision: renamed function output column from `used` to `used_count` to resolve Postgres ambiguity error
- [x] Confirmed tracker enforcement working — blocked requests now return `TwelveData credit budget exhausted (8/8 credits reserved this minute)` instead of raw TwelveData 429s
- [x] Collision test: deliberately fired GOLD (1 credit) + 8-pair forex batch simultaneously — tracker correctly blocked the second request when both landed in the same minute
- [x] Confirmed `used_count` populates correctly in rejection logs
- [x] Confirmed structured logs show `credit_reservation` events with correct `usedAfter` values

**Exit check:** [x] Phase 5.5 complete — the shared tracker (not just per-route caching) is confirmed to prevent overspending, with clear log evidence of blocking decisions.

---

## Phase 6 — UX polish

- [x] Consistent loading skeletons across all screens — added `Skeleton.jsx` component library, replaced spinners with skeleton placeholders in HomeScreen (briefing, pulse, news)
- [x] Consistent, clear error states — distinguish "rate limited" (429) from "unavailable" errors in UI with appropriate messaging and retry buttons
- [x] Page persistence on refresh — `journalView`, `selectedNews`, `selectedPulseMetric` now persist to localStorage; users stay on the same page/sub-page after reload
- [x] Review and tighten mobile responsiveness across screen sizes

**Exit check:** [x] Phase 6 complete — loading states use skeletons, error states distinguish rate-limited vs unavailable, page state persists across refreshes, dark mode toggle works correctly with full light/dark theme support.

---

## Phase 7 — Code cleanup

- Remove or archive the three untracked `_backup-before-*` folders (`_backup-before-phase4`, `_backup-before-phase4-20260721-223446`, `_backup-before-kimi-merge`) once confirmed unnecessary
- Remove dead code (e.g., unused `avSymbols` variable, any other flagged-but-unused variables found during Phase 1)
- Reduce remaining dependency on `mockData.js` where feasible — at minimum, document clearly which parts of `mockAssets` (name/bias/confidence metadata) are intentionally staying static vs. which should eventually be dynamic

---

## Phase 8 — Auth & accounts (Batch 2, post-launch-readiness)

Only after everything above is verified real and stable:

- User authentication (Supabase Auth)
- Cloud-synced watchlist, journal, and alerts (currently all device-local via `localStorage`) — will need proper Row Level Security policies so each user only ever sees their own data, distinct from the server-only `cache` table's current zero-policy setup

---

## How to use this document

Work top to bottom. Do not start a phase until the previous phase's exit check has been satisfied with real evidence (logs, screenshots, live test results) — not a description of what should now work. If a phase item turns out to already be more complete than expected (as happened with Journal/Alerts earlier in this project), verify it live anyway and update its status here with the evidence, rather than assuming.
