// assets/services/cache.js
/**
 * In-memory + sessionStorage cache with TTL and fingerprinting.
 */

import { track } from './telemetry.js';

const _mem = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a SHA-256 hex digest of a string (request fingerprint).
 */
export async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fingerprint(url, params) {
  return `${url}|${JSON.stringify(params || {})}`;
}

export function get(key) {
  // Memory first
  const mem = _mem.get(key);
  if (mem && Date.now() < mem.expires) {
    track('cache', 'cache_hit', { store: 'memory', key });
    return mem.value;
  }
  // SessionStorage fallback
  try {
    const raw = sessionStorage.getItem('cache:' + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.expires) {
        track('cache', 'cache_hit', { store: 'session', key });
        _mem.set(key, parsed);
        return parsed.value;
      }
      sessionStorage.removeItem('cache:' + key);
    }
  } catch { /* quota or parse errors */ }

  track('cache', 'cache_miss', { key });
  return undefined;
}

export function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  const entry = { value, expires: Date.now() + ttlMs };
  _mem.set(key, entry);
  try {
    sessionStorage.setItem('cache:' + key, JSON.stringify(entry));
  } catch { /* quota exceeded — memory cache still works */ }
}

export function invalidate(key) {
  _mem.delete(key);
  try { sessionStorage.removeItem('cache:' + key); } catch {}
}

export function clear() {
  _mem.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k.startsWith('cache:')) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch {}
}
