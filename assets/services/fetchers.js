// assets/services/fetchers.js
/**
 * Low-level fetch wrapper with retry, backoff, CORS detection,
 * rate-limit handling, and payload guard.
 */

import { AppError, NetworkError, CorsError, RateLimitError, ServerError, PayloadTooLargeError, logError } from './errors.js';
import { track } from './telemetry.js';
import { get as cacheGet, set as cacheSet, fingerprint } from './cache.js';
import { flag } from '../config/featureFlags.js';

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB guard

/**
 * Fetch with retry + caching.
 * @param {string} url
 * @param {object} opts - { cacheTtlMs, maxRetries, responseType: 'json'|'text'|'xml' }
 */
export async function robustFetch(url, opts = {}) {
  const {
    cacheTtlMs = 30 * 60 * 1000,
    maxRetries = flag('maxRetries') ?? 3,
    responseType = 'json',
    cacheKey: customCacheKey,
  } = opts;

  const key = customCacheKey || fingerprint(url);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      track('fetch', 'attempt', { url, attempt });
      const t0 = performance.now();
      const resp = await fetch(url, { mode: 'cors' });
      const elapsed = Math.round(performance.now() - t0);
      track('fetch', 'response', { url, status: resp.status, ms: elapsed });

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '0', 10);
        const err = new RateLimitError(new URL(url).hostname, retryAfter);
        logError(err);
        const wait = retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
        await sleep(wait);
        lastErr = err;
        continue;
      }

      if (resp.status >= 500) {
        const err = new ServerError(new URL(url).hostname, resp.status);
        logError(err);
        await sleep(backoff(attempt));
        lastErr = err;
        continue;
      }

      if (!resp.ok) {
        // 4xx errors (except 429) are client errors — never retry
        const err = new NetworkError(`HTTP ${resp.status} from ${url}`, { source: new URL(url).hostname, retryable: false });
        throw err;
      }

      // Payload size guard
      const cl = resp.headers.get('content-length');
      if (cl && parseInt(cl, 10) > MAX_PAYLOAD_BYTES) {
        throw new PayloadTooLargeError(new URL(url).hostname);
      }

      let data;
      if (responseType === 'json') {
        data = await resp.json();
      } else if (responseType === 'xml') {
        const text = await resp.text();
        data = new DOMParser().parseFromString(text, 'application/xml');
      } else {
        data = await resp.text();
      }

      cacheSet(key, data, cacheTtlMs);
      return data;

    } catch (err) {
      if (err instanceof PayloadTooLargeError) throw err;
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        // Likely CORS or offline
        if (!navigator.onLine) {
          lastErr = new NetworkError('Offline', { source: url });
        } else {
          lastErr = new CorsError(new URL(url).hostname);
        }
        logError(lastErr);
        throw lastErr; // no retry for CORS
      }
      if (err instanceof AppError) {
        lastErr = err;
        // Don't retry non-retryable errors (4xx, etc.)
        if (err.retryable === false) throw err;
      } else {
        lastErr = new NetworkError(err.message, { source: url });
        logError(lastErr);
      }
      if (attempt < maxRetries) await sleep(backoff(attempt));
    }
  }
  throw lastErr;
}

function backoff(attempt) {
  const base = flag('retryBaseMs') ?? 1000;
  return base * Math.pow(2, attempt) + Math.random() * 500;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

