// Per-provider cooldown. A 429 from one provider only pauses THAT provider —
// e.g. TwelveData hitting its limit no longer freezes CoinGecko/crypto,
// since they're entirely separate accounts/quotas.

const COOLDOWN_MS = 60_000;
const cooldowns = {}; // { coingecko: timestamp, finnhub: timestamp, twelvedata: timestamp, alphavantage: timestamp }

export function isRateLimited(provider = 'default') {
  return Date.now() < (cooldowns[provider] || 0);
}

export function getCooldownRemainingMs(provider = 'default') {
  return Math.max(0, (cooldowns[provider] || 0) - Date.now());
}

export function getCooldownSeconds(provider = 'default') {
  return Math.ceil(getCooldownRemainingMs(provider) / 1000);
}

export function triggerRateLimitCooldown(provider = 'default') {
  cooldowns[provider] = Date.now() + COOLDOWN_MS;
}

export function clearRateLimitCooldown(provider = 'default') {
  delete cooldowns[provider];
}
