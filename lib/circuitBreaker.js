// Circuit breaker pattern for provider resilience.
// Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery).
// Complements the per-provider rate-limit cooldown in rateLimitState.js.

import { logCircuitBreaker } from './structuredLogger.js';

const FAILURE_THRESHOLD = 5;      // Open after this many failures in the window
const FAILURE_WINDOW_MS = 60_000; // Count failures within this window
const OPEN_TIMEOUT_MS = 60_000;   // Stay open for this long before half-open
const HALF_OPEN_MAX_REQUESTS = 3; // Allow this many test requests in half-open

const State = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

const breakers = {}; // { provider: { state, failures: [], halfOpenRequests, halfOpenSuccesses } }

function getBreaker(provider) {
  if (!breakers[provider]) {
    breakers[provider] = {
      state: State.CLOSED,
      failures: [],
      halfOpenRequests: 0,
      halfOpenSuccesses: 0,
      openedAt: null,
    };
  }
  return breakers[provider];
}

function pruneFailures(bru, now) {
  bru.failures = bru.failures.filter(t => now - t < FAILURE_WINDOW_MS);
}

export function isCircuitOpen(provider = 'default') {
  const bru = getBreaker(provider);
  const now = Date.now();

  if (bru.state === State.CLOSED) {
    pruneFailures(bru, now);
    return false;
  }

  if (bru.state === State.OPEN) {
    if (now - bru.openedAt >= OPEN_TIMEOUT_MS) {
      // Transition to HALF_OPEN
      bru.state = State.HALF_OPEN;
      bru.halfOpenRequests = 0;
      bru.halfOpenSuccesses = 0;
      logCircuitBreaker({
        provider,
        state: State.HALF_OPEN,
        failures: bru.failures.length,
        lastFailureTime: bru.failures.length > 0 ? new Date(bru.failures[bru.failures.length - 1]).toISOString() : null,
        halfOpenRequests: 0,
      });
      return false;
    }
    return true;
  }

  if (bru.state === State.HALF_OPEN) {
    if (bru.halfOpenRequests >= HALF_OPEN_MAX_REQUESTS) {
      // Still testing, don't allow more requests yet
      return true;
    }
    return false;
  }

  return false;
}

export function recordSuccess(provider = 'default') {
  const bru = getBreaker(provider);
  const now = Date.now();

  if (bru.state === State.HALF_OPEN) {
    bru.halfOpenRequests++;
    bru.halfOpenSuccesses++;

    if (bru.halfOpenSuccesses >= 2) {
      // Recovery confirmed
      bru.state = State.CLOSED;
      bru.failures = [];
      bru.halfOpenRequests = 0;
      bru.halfOpenSuccesses = 0;
      bru.openedAt = null;
      logCircuitBreaker({
        provider,
        state: State.CLOSED,
        failures: 0,
        lastFailureTime: null,
        halfOpenRequests: 0,
      });
    }
  } else if (bru.state === State.CLOSED) {
    // Success in closed state — prune old failures
    pruneFailures(bru, now);
  }
}

export function recordFailure(provider = 'default') {
  const bru = getBreaker(provider);
  const now = Date.now();

  if (bru.state === State.HALF_OPEN) {
    bru.halfOpenRequests++;
    // Failure in half-open — reopen immediately
    bru.state = State.OPEN;
    bru.openedAt = now;
    bru.halfOpenRequests = 0;
    bru.halfOpenSuccesses = 0;
    logCircuitBreaker({
      provider,
      state: State.OPEN,
      failures: bru.failures.length + 1,
      lastFailureTime: new Date(now).toISOString(),
      halfOpenRequests: 0,
    });
    return;
  }

  if (bru.state === State.CLOSED) {
    pruneFailures(bru, now);
    bru.failures.push(now);

    if (bru.failures.length >= FAILURE_THRESHOLD) {
      bru.state = State.OPEN;
      bru.openedAt = now;
      logCircuitBreaker({
        provider,
        state: State.OPEN,
        failures: bru.failures.length,
        lastFailureTime: new Date(now).toISOString(),
        halfOpenRequests: 0,
      });
    }
  }
}

export function getCircuitState(provider = 'default') {
  const bru = getBreaker(provider);
  return {
    state: bru.state,
    failures: bru.failures.length,
    halfOpenRequests: bru.halfOpenRequests,
    openedAt: bru.openedAt ? new Date(bru.openedAt).toISOString() : null,
  };
}

// Reset a breaker (useful for testing or manual recovery)
export function resetCircuit(provider = 'default') {
  delete breakers[provider];
}
