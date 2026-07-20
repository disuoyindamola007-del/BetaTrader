// Shared module-level cooldown. One 429 anywhere pauses everything for 60s.

const COOLDOWN_MS = 60_000;
let cooldownUntil = 0;

export function isRateLimited() {
  return Date.now() < cooldownUntil;
}

export function getCooldownRemainingMs() {
  return Math.max(0, cooldownUntil - Date.now());
}

export function getCooldownSeconds() {
  return Math.ceil(getCooldownRemainingMs() / 1000);
}

export function triggerRateLimitCooldown() {
  cooldownUntil = Date.now() + COOLDOWN_MS;
}

export function clearRateLimitCooldown() {
  cooldownUntil = 0;
}
