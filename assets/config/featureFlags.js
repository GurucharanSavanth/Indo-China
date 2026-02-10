// assets/config/featureFlags.js
/**
 * Feature flags control optional modules.
 * Override via assets/config/local.js (not committed).
 */

const defaults = Object.freeze({
  comtrade: {
    enabled: false,
    baseUrl: 'https://comtradeapi.un.org',
    apiKey: '',
  },
  liveRefresh: true,
  monthlyToggle: true,
  mirrorToggle: true,
  forecastEnabled: true,
  maxRetries: 3,
  retryBaseMs: 1000,
  snapshotFallback: true,
});

let overrides = {};

/**
 * Load local overrides from assets/config/local.js (if present).
 * local.js should export default an object with partial overrides.
 */
export async function loadLocalConfig() {
  try {
    const mod = await import('./local.js');
    overrides = mod.default || {};
  } catch {
    // local.js not present — use defaults
  }
}

export function flag(path) {
  const parts = path.split('.');
  let val = overrides;
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) {
      val = val[p];
    } else {
      val = undefined;
      break;
    }
  }
  if (val !== undefined) return val;

  val = defaults;
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) {
      val = val[p];
    } else {
      return undefined;
    }
  }
  return val;
}

export { defaults as FLAGS_DEFAULTS };
