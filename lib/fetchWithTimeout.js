// Centralized fetch wrapper with timeout, retry, and structured logging.
// Replaces raw fetch() calls across all API routes.

import { logRequest } from './structuredLogger.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const GROQ_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;

function jitter(delayMs) {
  return delayMs + Math.floor(Math.random() * delayMs * 0.5);
}

function isRetryableError(status) {
  // Retry on network errors (no status) or 5xx server errors
  // Do NOT retry on 4xx client errors (429 is handled by rate limiter)
  return !status || (status >= 500 && status < 600);
}

export async function fetchWithTimeout(url, options = {}, config = {}) {
  const {
    provider = 'unknown',
    endpoint = url,
    timeoutMs = url.includes('groq.com') ? GROQ_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
    retries = MAX_RETRIES,
  } = config;

  const startTime = Date.now();
  let lastError = null;
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Log the request
      logRequest({
        provider,
        endpoint,
        method: options.method || 'GET',
        status: response.status,
        duration,
        attempt: attempt + 1,
        cacheHit: false, // cache hits are logged separately
      });

      // Don't retry on 4xx (except we let the caller handle 429)
      if (response.status === 429) {
        return response; // Let the rate limiter handle this
      }

      if (!response.ok && isRetryableError(response.status)) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      attempt++;

      const duration = Date.now() - startTime;

      if (attempt <= retries && isRetryableError(error.name === 'AbortError' ? null : null)) {
        const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        logRequest({
          provider,
          endpoint,
          method: options.method || 'GET',
          status: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
          duration,
          attempt,
          cacheHit: false,
          failure: true,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Final failure
      logRequest({
        provider,
        endpoint,
        method: options.method || 'GET',
        status: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
        duration,
        attempt,
        cacheHit: false,
        failure: true,
      });

      if (error.name === 'AbortError') {
        const err = new Error(`${provider} request timed out after ${timeoutMs}ms`);
        err.timeout = true;
        throw err;
      }
      throw error;
    }
  }

  throw lastError;
}

export async function fetchJsonWithTimeout(url, options = {}, config = {}) {
  const response = await fetchWithTimeout(url, options, config);
  return response.json();
}
