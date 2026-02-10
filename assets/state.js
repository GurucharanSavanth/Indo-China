// assets/state.js
/**
 * Centralised application state with pub/sub.
 * Stores all data tables, filter state, and UI state.
 */

const _listeners = new Map();
let _state = {
  // Data tables (canonical)
  tradeFacts: [],
  macroFacts: [],
  catalog: [],

  // Derived / aggregated (computed from facts)
  yearlyTrade: [],
  tradeBalance: [],
  productComposition: [],

  // Filters
  filters: {
    reporter: 'IND',
    partner: 'CHN',
    flow: 'EXPORT',
    yearStart: 2000,
    yearEnd: 2024,
    frequency: 'A',
    productLevel: 'TOTAL',
  },

  // UI state
  ui: {
    loading: false,
    banners: [],        // { id, level, text, dismissible }
    activeRoute: '#/overview',
    mirrorMode: false,  // swap reporter/partner perspective
    snapshotMode: false,
  },

  // Forecast/model outputs (NOT facts)
  forecast: {
    baseline: [],
    regression: null,
    diagnostics: null,
  },
};

/**
 * Get current state (read-only snapshot).
 */
export function getState() {
  return _state;
}

/**
 * Update state and notify listeners.
 * @param {string} path - dot-separated path, e.g. 'filters.reporter'
 * @param {*} value
 */
export function setState(path, value) {
  const parts = path.split('.');
  let obj = _state;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  emit(path, value);
  emit('*', _state);
}

/**
 * Batch update.
 */
export function batchUpdate(updates) {
  for (const [path, value] of Object.entries(updates)) {
    const parts = path.split('.');
    let obj = _state;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }
  emit('*', _state);
}

/**
 * Subscribe to state changes.
 * @param {string} path - state path or '*' for any change
 * @param {function} fn
 * @returns {function} unsubscribe
 */
export function subscribe(path, fn) {
  if (!_listeners.has(path)) _listeners.set(path, new Set());
  _listeners.get(path).add(fn);
  return () => _listeners.get(path)?.delete(fn);
}

function emit(path, value) {
  const fns = _listeners.get(path);
  if (fns) fns.forEach(fn => fn(value));
}

/**
 * Add a UI banner.
 */
export function addBanner(banner) {
  const id = 'b' + Date.now() + Math.random().toString(36).slice(2, 6);
  const banners = [..._state.ui.banners, { id, ...banner }];
  setState('ui.banners', banners);
  return id;
}

/**
 * Dismiss a banner by id.
 */
export function dismissBanner(id) {
  setState('ui.banners', _state.ui.banners.filter(b => b.id !== id));
}

/**
 * Sync filters to URL hash query params.
 */
export function syncFiltersToURL() {
  const route = _state.ui.activeRoute.split('?')[0];
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(_state.filters)) {
    params.set(k, String(v));
  }
  if (_state.ui.mirrorMode) params.set('mirror', '1');
  window.location.hash = route + '?' + params.toString();
}

/**
 * Restore filters from URL hash query params.
 */
export function restoreFiltersFromURL() {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx < 0) return;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const updates = {};
  if (params.has('reporter')) updates['filters.reporter'] = params.get('reporter');
  if (params.has('partner')) updates['filters.partner'] = params.get('partner');
  if (params.has('flow')) updates['filters.flow'] = params.get('flow');
  if (params.has('yearStart')) updates['filters.yearStart'] = parseInt(params.get('yearStart'));
  if (params.has('yearEnd')) updates['filters.yearEnd'] = parseInt(params.get('yearEnd'));
  if (params.has('frequency')) updates['filters.frequency'] = params.get('frequency');
  if (params.has('productLevel')) updates['filters.productLevel'] = params.get('productLevel');
  if (params.has('mirror')) updates['ui.mirrorMode'] = params.get('mirror') === '1';
  if (Object.keys(updates).length > 0) batchUpdate(updates);
}
