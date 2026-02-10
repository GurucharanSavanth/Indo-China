// assets/services/comtrade.js
/**
 * UN Comtrade client — OPTIONAL, feature-flagged.
 * Disabled by default. Enable via assets/config/local.js.
 * Degrades gracefully on auth/CORS/errors.
 */

import { COMTRADE } from '../config/endpoints.js';
import { flag } from '../config/featureFlags.js';
import { robustFetch } from './fetchers.js';
import { logError, AppError } from './errors.js';
import { track } from './telemetry.js';

// ISO numeric codes
const REPORTER_CODES = { IND: 699, CHN: 156 };
const FLOW_CODES = { IMPORT: 'M', EXPORT: 'X' };

let _disabled = false;
let _disableReason = '';

export function isComtradeAvailable() {
  return flag('comtrade.enabled') && !_disabled;
}

export function getDisableReason() {
  return _disableReason;
}

/**
 * Fetch HS-level trade data from Comtrade.
 * @param {object} params
 */
export async function fetchComtradeData({ reporter = 'IND', partner = 'CHN', period = '2023', cmdCode = 'TOTAL', flow = 'IMPORT' } = {}) {
  if (!isComtradeAvailable()) {
    return { data: [], status: 'disabled', reason: _disableReason || 'Comtrade not enabled' };
  }

  const baseUrl = flag('comtrade.baseUrl') || COMTRADE.DEFAULT_BASE;
  const reporterCode = REPORTER_CODES[reporter] || reporter;
  const partnerCode = REPORTER_CODES[partner] || partner;
  const flowCode = FLOW_CODES[flow] || flow;

  const url = COMTRADE.data(baseUrl, {
    reporterCode,
    partnerCode,
    period,
    cmdCode,
    flowCode,
    includeDesc: true,
  });

  // Append API key if configured
  const apiKey = flag('comtrade.apiKey');
  const fullUrl = apiKey ? `${url}&subscription-key=${apiKey}` : url;

  track('comtrade', 'fetch', { url: fullUrl });

  try {
    const data = await robustFetch(fullUrl, { responseType: 'json', cacheTtlMs: 60 * 60 * 1000 });
    return { data: data.data || data, status: 'ok' };
  } catch (err) {
    logError(err);
    _disabled = true;
    _disableReason = `Comtrade unavailable: ${err.message}`;
    return { data: [], status: 'failed', reason: _disableReason };
  }
}

/**
 * Normalise Comtrade response into trade_fact rows.
 */
export function normaliseComtradeData(records) {
  if (!Array.isArray(records)) return [];
  const ts = new Date().toISOString();

  return records.map(r => ({
    date: String(r.period || r.yr || ''),
    frequency: 'A',
    reporter_iso3: r.reporterISO || r.rtCode || '',
    partner_iso3: r.partnerISO || r.ptCode || '',
    flow: r.flowDesc?.toUpperCase()?.includes('EXPORT') ? 'EXPORT' : 'IMPORT',
    product_level: classifyProductLevel(r.cmdCode),
    product_code: String(r.cmdCode || ''),
    product_name: r.cmdDescE || r.cmdDesc || '',
    value_usd: parseFloat(r.primaryValue || r.TradeValue) || null,
    unit: 'USD',
    source_id: 'comtrade',
    retrieval_ts: ts,
    request_fingerprint: `comtrade:${r.reporterISO}:${r.partnerISO}:${r.period}:${r.cmdCode}`,
  }));
}

function classifyProductLevel(code) {
  const s = String(code);
  if (s === 'TOTAL' || s === 'AG6' || s === '') return 'TOTAL';
  if (s.length <= 2) return 'HS2';
  if (s.length <= 4) return 'HS4';
  return 'GROUP';
}
