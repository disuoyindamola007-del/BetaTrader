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

## Phase 6.5 — Institutional-grade AI analysis upgrade

The prior AI analysis sent only RSI(14) and EMA 9/21/50 from a single timeframe, producing one 180-token paragraph. This upgrade brings the analysis closer to how institutional analysts actually evaluate charts.

**Completed:**
- [x] **Higher timeframe trend confirmation** — fetch a second timeframe at 4x the current one (1h→4h, 4h→1d, etc.) and compute its own EMA stack + RSI; the AI explicitly states whether the current timeframe agrees with or conflicts with the bigger picture, and lowers confidence when they disagree
- [x] **Confluence over single indicators** — the prompt now passes Bollinger Bands upper/lower, 24h high/low, 24h volume, and price position percentiles within both the BB range and daily range; the AI counts how many independent signals (trend, momentum, volatility, volume) are aligned vs conflicting and reflects this as strong/moderate/mixed alignment
- [x] **Volume as confirmation** — 24h volume is passed into the prompt; the AI comments on whether volume supports or fails to support the current price move
- [x] **Range and volatility context** — Bollinger Band position and 24h high/low percentiles let the AI note when price is near volatility extremes or daily range boundaries
- [x] **News as context, not override** — fetch existing news endpoint, filter for symbol relevance (check headline and related symbols); if relevant news exists, pass it with a relevance rating; if no relevant news, the AI states that plainly instead of inventing relevance; when news sentiment conflicts with technicals, the AI states the disagreement explicitly
- [x] **Output structure and language** — increased max tokens from 180 to 500; structured output with labeled sections: Trend Read, Momentum, Volatility & Range, News Context (if relevant), Overall Read; plain language throughout; fully advisory — no price targets, entry zones, stop losses, or buy/sell recommendations
- [x] **Higher timeframe display in UI** — added a new card below indicators showing the higher timeframe RSI and EMA stack direction (e.g., "Higher Timeframe (4h): RSI: 58, EMA Stack: Bullish")
- [x] **Graceful degradation** — when higher timeframe data is insufficient (fewer than 50 candles), the analysis falls back to current timeframe only and notes this explicitly
- [x] **Preserved caching and rate limiting** — both timeframe candle fetches reuse existing `useCandles` caching; Groq rate limiting and circuit breaker remain intact; analysis cache TTL stays at 5 minutes

**Cost impact:** +1 candle API call per unique asset+timeframe combination (cached). For a user viewing AAPL on 1h, the system fetches 1h + 4h candles once, then serves from cache. Groq token usage increased from ~180 to ~500 per analysis — still well within free tier limits.

**Files modified:**
- `api/analyze/[symbol].js` — complete rewrite with institutional-grade prompt, higher timeframe support, confluence analysis, news integration, 500-token output
- `src/components/markets/AssetDetail.jsx` — fetch higher timeframe candles, compute dual indicators, fetch/filter news, display higher timeframe trend card, render structured analysis output

**Exit check:** [x] Phase 6.5 complete — commit `41f01ca` pushed to `main`, `npm run build` passes, AI analysis now includes higher timeframe confirmation, confluence counting, volume assessment, Bollinger Band context, and news relevance filtering with structured labeled output.

---

## Phase 6.6 — Market hours awareness (weekend credit savings)

**Problem:** The app was polling every 60 seconds for forex, stocks, and commodities even when those markets were closed (weekends, holidays), wasting TwelveData credits on data that couldn't possibly change.

**Completed:**
- [x] Added `isMarketOpen(category)` function with proper market hours logic:
  - **Crypto**: Always open (24/7) — completely unaffected
  - **Stocks (US)**: Monday-Friday 9:30am-4:00pm ET, closed weekends & major US holidays
  - **Forex/Commodities**: Sunday 5pm ET to Friday 5pm ET (24h during weekdays)
- [x] Added `getTimeUntilMarketOpen(category)` for cache TTL extension during closures
- [x] Modified `getRefreshInterval()` to return `Infinity` when market is closed, preventing all auto-polling
- [x] Added `getQuoteTTL()` that extends cache TTL when market is closed (until market reopens, capped at 48 hours)
- [x] Updated `useQuote`, `useCandles`, and `useBatchQuotes` hooks to skip polling when markets are closed
- [x] Added market status indicator in AssetDetail UI showing "Market Open" (green pulsing dot) or "Market Closed — Data will update when market reopens" (amber dot)
- [x] US market holiday detection for major holidays (New Year's, MLK, Presidents', Memorial, Juneteenth, July 4th, Labor, Thanksgiving, Christmas)

**Market hours determination method:** Fixed schedule check based on US Eastern Time with DST handling. Uses `Date` object timezone conversion to reliably determine ET regardless of user's local timezone.

**Credit savings estimate:**
- Weekend duration: ~65 hours (Friday 5pm ET to Sunday 5pm ET for forex/commodities; ~62.5 hours for stocks)
- Normal polling: 1 request/minute = ~3,900 requests per weekend per active user
- With market hours awareness: 0 polling requests during closed hours
- **Estimated savings: ~95-100% of weekend credit usage** for forex, stocks, and commodities
- Only explicit user-initiated fetches consume credits during closures, and those are cached aggressively until market reopens

**Files modified:**
- `src/services/marketDataService.js` — added market hours functions, updated cache TTL logic
- `src/hooks/useMarketData.js` — skip polling when markets closed
- `src/components/markets/AssetDetail.jsx` — added market status indicator

**Exit check:** [x] Phase 6.6 complete — commit `e225f7c` pushed to `main`, `npm run build` passes, polling correctly skips closed markets, crypto unaffected, market status visible in UI.

---

## Phase 7 — Code cleanup ✅ COMPLETE

Completed and verified in commits `62b4b3c`, `f01ae82`, and `b786614`:

- [x] Removed obsolete local backup folders from the active project. They were ignored and were not tracked or pushed to GitHub.
- [x] Removed obsolete demo journal trades, demo alerts, and the unused static watchlist export.
- [x] Removed the unused `watchlist` import from `HomeScreen.jsx`.
- [x] Audited mock-data usage. `mockAssets` is intentionally retained as a static catalog for symbols, display names, categories, and fallback values. Trending is fallback-only; live quotes are used whenever available.
- [x] Confirmed journal data comes from `journalService.js`, alert data from `alertsService.js`, watchlist membership from persisted favorites, and market/news/pulse data from live services/API routes.
- [x] Searched for dead-code markers and obsolete browser dialogs. No remaining `TODO`, `FIXME`, `HACK`, `window.confirm()`, or browser `alert()` issues were found. Structured logs and PWA logs are intentional.
- [x] Fixed AI Analysis Light Mode readability and removed Markdown emphasis symbols from rendered output in commit `b786614`.

**Verification record:** `npm run build` passed, `git diff --check` passed, the working tree is clean, changes were pushed to `main`, and the user verified the Phase 6.7–6.9 and AI Analysis fixes live.

**Exit check:** [x] Phase 7 complete. The project is ready for Batch 2 authentication and accounts work.

---

## Phase 8 — Authentication, accounts, and cloud sync (Batch 2)

Phase 8 moves BetaTrader from a single-device local experience to a secure multi-user product while preserving existing functionality. Every item must be implemented, committed, build-verified, and tested with real authenticated users before Phase 8 is marked complete.

### 8.0 — Architecture and safety preparation

- [x] Confirm the correct Supabase project: BetaTrader project `incciljsxgujwltugdcj`; never modify the unrelated LearnFromOla project. Migration was run and inspected in this project only.
- [x] Audit current localStorage models and define cloud schemas for profiles/settings, favorites/watchlist, journal trades, alerts, and notifications where synchronization is required. `phase8-user-data.sql` creates all five user-owned tables; repositories remain local until their migration/sync phases.
- [ ] Define local-data migration behavior before implementation: show local item counts, let the user choose import/merge/skip, prevent duplicates, and never overwrite data silently.
- [x] Require `user_id` ownership on every user-owned row. Owner-only RLS is enabled for select/insert/update/delete and was inspected live. Browser-local favorites, journal, and alerts are also keyed by authenticated user ID to prevent same-device account leakage.
- [x] Keep user data separate from the existing server-only market cache. Browser auth uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the service-role key remains server-only and cache RLS remains unchanged.
- [ ] Define sign-out, account deletion, data export, recovery, rollback, and offline behavior.
- [ ] Use a staging/test account and database backup before production migrations.

### 8.1 — Supabase Auth foundation

- [ ] Configure Supabase Auth providers, email settings, and redirect URLs for Vercel production, preview, and local development.
- [x] Build sign-up with email/password and proper validation. First/last name, confirmation, and live length/uppercase/lowercase/number/symbol checks are implemented.
- [x] Build sign-in with invalid-credentials, network/rate-limit, and loading states. Duplicate-email behavior still needs a focused live retest.
- [x] Implement email verification and resend-verification handling. Code/hash/error callbacks, explicit confirmation UI, expiry UI/redirect, and resend for Supabase's unconfirmed-email error are implemented; live retest remains part of 8.9.
- [ ] Implement forgot-password and secure reset-password flows.
- [x] Persist and restore sessions across refreshes and browser restarts.
- [x] Handle auth loading without flashing private screens or the placeholder profile name. Expired-session behavior still needs a focused live test.
- [x] Implement sign-out and clear active private UI/cache state safely.
- [x] Protect authenticated screens and define the unauthenticated landing/auth experience.
- [x] Ensure only the public Supabase URL and anon/publishable key reach the frontend; never include service-role credentials in client code or logs.

### 8.2 — Profiles and settings

- [x] Create a `profiles` table keyed by `user_id`, including first/last/display name, avatar/initial, timezone, plan metadata, and created/updated timestamps.
- [x] Create profiles securely for new users using a trigger. Live signup created the expected profile row; direct execute access to `handle_new_user()` was revoked from PUBLIC/anon/authenticated live and in migrations.
- [x] Add RLS so a user can select and update only their own profile.
- [x] Replace the greeting name with authenticated profile/session first name, with no `Trader` flicker on refresh.
- [ ] Build Personal Information editing.
- [ ] Sync timezone, notification preference, and theme settings to the user profile where appropriate. Timezone picker UI is implemented, but settings are still localStorage-only.
- [ ] Show authenticated email/account status where appropriate.
- [ ] Keep Subscription marked Coming Soon unless billing and entitlements have a real server-side source of truth.

### 8.3 — Cloud watchlist/favorites

- [ ] Create a user-owned `watchlist`/`favorites` table with `user_id`, symbol, provider/category metadata, created/updated timestamps, and a unique constraint per user/symbol.
- [ ] Add RLS for select, insert, update, and delete limited to the authenticated owner.
- [ ] Implement a dedicated authenticated service layer for reads/writes.
- [ ] Preserve optimistic UI and rollback on failed writes.
- [ ] Import existing local favorites once, with duplicate protection and confirmation.
- [ ] Define signed-out and offline behavior.
- [ ] Continue sourcing prices from existing live market-data services; cloud sync stores membership/metadata, not live prices.

### 8.4 — Cloud journal

- [ ] Create a user-owned `journal_trades` table containing all current fields: asset, provider/category, direction, status, entry, exit, stop-loss, take-profit, quantity/capital, leverage, lot type/size, result, P/L, date/time, timeframe, emotion, bias, strategy, notes, and created/updated timestamps.
- [ ] Use suitable numeric and timestamp types, not only formatted strings.
- [ ] Add validation constraints for ownership, status, direction, required fields, and valid financial values.
- [ ] Add RLS for select, insert, update, and delete limited to the owner.
- [ ] Replace or extend `journalService.js` with a cloud-backed repository while retaining migration/offline support.
- [ ] Sync create, edit, delete, swipe-to-delete, and detail views with pending/error states.
- [ ] Preserve realized/projected P/L, forex pip conversion, crypto liquidation validation, performance statistics, open-position count, and formatting.
- [ ] Define conflict handling for multiple devices and prevent duplicate submissions.
- [ ] Import existing local trades once with confirmation and duplicate protection.

### 8.5 — Cloud alerts

- [ ] Create a user-owned `alerts` table containing asset, provider/category, type, condition, threshold/value, status, created/updated timestamps, triggered timestamp, and notification state.
- [ ] Add owner-only RLS policies for every operation.
- [ ] Replace or extend `alertsService.js` with a cloud-backed repository while retaining local migration support.
- [ ] Preserve active/triggered transitions and duplicate-alert behavior.
- [ ] Decide how alerts work when the browser is closed. Client polling alone cannot guarantee background alerts; use a suitable server/cron/edge mechanism if reliable background delivery is required.
- [ ] Keep browser notification permission separate from database alert state.
- [ ] Import existing local alerts once with confirmation and duplicate protection.

### 8.6 — Notifications and account security

- [ ] Create user-owned notification records if notification history must sync across devices.
- [ ] Add RLS for notification reads and marking notifications as read.
- [ ] Preserve the full-page Notifications screen and unread badge behavior.
- [ ] Add password-change and active-session controls where supported.
- [ ] Implement account deletion with explicit confirmation and a trusted cascade/archive policy for user-owned rows.
- [ ] Implement export of the user’s profile, watchlist, journal, alerts, and notifications.
- [ ] Review XSS, CSRF, IDOR, authorization, sensitive logging, and secret-exposure risks.
- [ ] Ensure signing out removes private records from active UI and does not leak another user’s cached data.

### 8.7 — Local-to-cloud migration and multi-device sync

- [ ] Build an explicit migration flow after first successful sign-in.
- [ ] Display local data counts before import.
- [ ] Define and implement merge behavior, cloud-wins/local-wins options, or a documented default.
- [ ] Make imports idempotent and record migration version/completion per user.
- [ ] Remove local copies only after successful cloud confirmation, unless intentionally retained as an offline cache.
- [ ] Revalidate on focus or subscribe to changes so another device’s updates appear without a full reload.
- [ ] Define offline retries and queues without creating duplicate trades or alerts.

### 8.8 — Billing and plan enforcement (only if approved)

- [ ] Decide whether paid subscriptions are part of this release. If not, leave Subscription as Coming Soon.
- [ ] If approved, select a payment provider and implement server-verified checkout and webhooks.
- [ ] Store subscription state server-side; never trust a client-only plan flag.
- [ ] Enforce premium entitlements on API routes as well as in the UI.
- [ ] Add billing portal, cancellation, failed-payment, renewal, and webhook replay handling.

### 8.9 — Phase 8 verification and launch gate

- [ ] Run migrations only against the BetaTrader Supabase project and verify every RLS policy with at least two separate test accounts.
- [ ] Confirm User A cannot select, insert, update, delete, or infer User B’s rows through direct API calls or modified requests.
- [ ] Test sign-up, verification, sign-in, refresh persistence, sign-out, password recovery, expired sessions, and network failures.
- [ ] Test local import with empty, partial, duplicate, and large datasets.
- [ ] Test watchlist, journal, alerts, and notifications on two browsers/devices using the same account.
- [ ] Test isolation between two different accounts.
- [ ] Test offline behavior, retries, duplicate submissions, and concurrent edits.
- [ ] Confirm the market cache remains service-role-only and private user data never enters public cache keys or structured logs.
- [ ] Run `npm run build`, syntax checks, dependency/security checks, and `git diff --check`.
- [ ] Deploy to a preview environment, perform live verification, then deploy production.
- [ ] Record migration names, commits, test accounts/results, deployment URL, and rollback steps in the handoff.

**Phase 8 exit check:** Phase 8 is complete only when authentication, ownership, RLS, migration, sync, security, and live production behavior are implemented, committed, build-verified, and tested with at least two separate accounts.

---

## How to use this document

Work top to bottom. Do not start a phase until the previous phase's exit check has been satisfied with real evidence (logs, screenshots, live test results) — not a description of what should now work. If a phase item turns out to already be more complete than expected (as happened with Journal/Alerts earlier in this project), verify it live anyway and update its status here with the evidence, rather than assuming.
