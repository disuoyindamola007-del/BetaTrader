// Per-category cooldown. A 429 on one category (e.g. commodities/TwelveData)
// no longer blocks any other category (e.g. crypto/CoinGecko).

const COOLDOWN_MS = 60_000;
const cooldowns = {}; // { crypto: ts, forex: ts, stocks: ts, commodities: ts }

export function isRateLimited(category) {
  const until = cooldowns[category] || 0;
  return Date.now() < until;
}

export function getCooldownRemainingMs(category) {
  const until = cooldowns[category] || 0;
  return Math.max(0, until - Date.now());
}

export function getCooldownSeconds(category) {
  return Math.ceil(getCooldownRemainingMs(category) / 1000);
}

export function triggerRateLimitCooldown(category) {
  cooldowns[category] = Date.now() + COOLDOWN_MS;
}

export function clearRateLimitCooldown(category) {
  cooldowns[category] = 0;
}
