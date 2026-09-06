# Phase 8 operations and data-safety policy

Applies only to the BetaTrader Supabase project `incciljsxgujwltugdcj`. Never run these procedures against LearnFromOla.

## Local import and rollback

After first authenticated sign-in, legacy unscoped/signed-out favorites, journal trades, and alerts are counted and offered as an explicit **Import and merge** or **Skip** choice. Import is idempotent by client ID, ID, symbol, or stable record content and records migration version 1 for that user. Source data is retained until cloud repositories confirm successful writes. To roll back before cloud confirmation, clear only that user's migration marker; do not delete source records.

## Offline behavior

Profile settings update the local, user-scoped cache immediately. Cloud write failures are reported in the UI and local values remain available offline. Cloud profile values are authoritative after the next successful sign-in/profile hydration. Favorites, journal, alerts, and notifications must retain local data until their cloud repositories and retry queues are complete; no silent deletion is allowed.

## Account deletion

Account deletion must require recent authentication and explicit confirmation. A trusted server-side endpoint must delete the Supabase Auth user using the service role; foreign keys with `ON DELETE CASCADE` remove profiles, favorites, journal trades, alerts, and notifications. The client then clears that user's scoped local keys and signs out. Never expose the service-role key to the browser.

## Data export

Export must be authenticated and owner-scoped. Include profile, favorites, journal trades, alerts, and notifications as a versioned JSON archive with UTC generation time. RLS remains enabled; server exports must verify the bearer token and user ID rather than accepting a user ID from request input.

## Recovery and rollback

Database changes are forward migrations. Before destructive changes, export affected rows/schema and record migration/commit/deployment IDs. Roll back application code through the prior known-good Vercel deployment. Restore data only from a verified backup and only for the authenticated owner. Never roll back by disabling RLS.
