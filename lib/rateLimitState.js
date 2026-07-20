// Module-level shared cooldown for rate-limit responses (429 / rateLimited).
// Shared across all requests in this serverless instance.
// Also used by frontend services/api.js so multiple tabs respect the same cooldown.

const COOLDOWN_MS = 60_000;

let cooldownUntil = 0;

export function isRateLimited() {
  return Date.now() < cooldownUntil;
}

export function getCooldownRemainingMs() {
  return Math.max(0, cooldownUntil - Date.now());
}

export function triggerRateLimitCooldown() {
  cooldownUntil = Date.now() + COOLDOWN_MS;
}

export function clearRateLimitCooldown() {
  cooldownUntil = 0;
}
