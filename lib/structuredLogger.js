// Structured logging for all provider requests.
// Each log entry is a JSON object that Vercel can parse and filter.

const LOG_PREFIX = '[BetaTrader]';

export function logRequest({
  provider,
  endpoint,
  method = 'GET',
  status,
  duration,
  attempt = 1,
  cacheHit = false,
  failure = false,
  extra = {},
}) {
  const entry = {
    ts: new Date().toISOString(),
    provider,
    endpoint,
    method,
    status,
    durationMs: duration,
    attempt,
    cacheHit,
    failure,
    ...extra,
  };

  if (failure) {
    console.error(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } else {
    console.log(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  }
}

export function logCacheHit({ provider, key, ttlMs, valueSize }) {
  console.log(`${LOG_PREFIX} ${JSON.stringify({
    ts: new Date().toISOString(),
    event: 'cache_hit',
    provider,
    key,
    ttlMs,
    valueSize,
  })}`);
}

export function logCacheMiss({ provider, key }) {
  console.log(`${LOG_PREFIX} ${JSON.stringify({
    ts: new Date().toISOString(),
    event: 'cache_miss',
    provider,
    key,
  })}`);
}

export function logCircuitBreaker({ provider, state, failures, lastFailureTime, halfOpenRequests }) {
  console.warn(`${LOG_PREFIX} ${JSON.stringify({
    ts: new Date().toISOString(),
    event: 'circuit_breaker',
    provider,
    state,
    failures,
    lastFailureTime,
    halfOpenRequests,
  })}`);
}

export function logRateLimit({ provider, action, remainingMs }) {
  console.warn(`${LOG_PREFIX} ${JSON.stringify({
    ts: new Date().toISOString(),
    event: 'rate_limit',
    provider,
    action,
    remainingMs,
  })}`);
}
