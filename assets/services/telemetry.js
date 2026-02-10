// assets/services/telemetry.js
/**
 * Lightweight client-side telemetry — console only (no external service).
 * Tracks fetch timings, cache hits, errors for debugging.
 */

const _events = [];
const MAX_EVENTS = 500;

export function track(category, action, meta = {}) {
  const evt = { ts: Date.now(), category, action, ...meta };
  _events.push(evt);
  if (_events.length > MAX_EVENTS) _events.shift();
}

export function getEvents(category) {
  return category ? _events.filter(e => e.category === category) : [..._events];
}

export function summarise() {
  const fetches = _events.filter(e => e.category === 'fetch');
  const errors = _events.filter(e => e.category === 'error');
  const cacheHits = _events.filter(e => e.action === 'cache_hit').length;
  const cacheMisses = _events.filter(e => e.action === 'cache_miss').length;
  return {
    totalFetches: fetches.length,
    totalErrors: errors.length,
    cacheHits,
    cacheMisses,
    cacheHitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1) + '%' : 'N/A',
  };
}
