// assets/services/worldbank.js
/**
 * World Bank Indicators API (V2) client.
 * Always requests JSON, handles pagination.
 */

import { WORLDBANK } from '../config/endpoints.js';
import { robustFetch } from './fetchers.js';
import { logError } from './errors.js';
import { track } from './telemetry.js';

/**
 * Fetch a World Bank indicator with full pagination.
 * @param {string} countryCode - ISO2 or ISO3 country code, or "IND;CHN" for multiple
 * @param {string} indicatorCode - e.g. NY.GDP.MKTP.CD
 * @param {object} opts - { date: '2000:2024' }
 * @returns {Array} merged pages of indicator data
 */
export async function fetchIndicator(countryCode, indicatorCode, opts = {}) {
  const { date = '2000:2024' } = opts;
  const allRecords = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = WORLDBANK.indicator(countryCode, indicatorCode, { date, page, perPage: 500 });
    track('worldbank', 'fetch', { url, page });

    try {
      const resp = await robustFetch(url, { responseType: 'json', cacheTtlMs: 60 * 60 * 1000 });

      // WB V2 JSON returns [metadata, data]
      if (Array.isArray(resp) && resp.length === 2) {
        const meta = resp[0];
        const data = resp[1];
        totalPages = meta.pages || 1;
        if (Array.isArray(data)) {
          allRecords.push(...data);
        }
      } else {
        // Unexpected shape
        break;
      }
    } catch (err) {
      logError(err);
      break;
    }
    page++;
  }

  return allRecords;
}

/**
 * Normalise World Bank indicator response into macro_fact rows.
 */
export function normaliseWBIndicator(records, indicatorCode) {
  const ts = new Date().toISOString();
  return records
    .filter(r => r && r.value !== null && r.value !== undefined)
    .map(r => ({
      date: r.date || '',
      country_iso3: r.countryiso3code || r.country?.id || '',
      indicator_code: indicatorCode,
      indicator_name: r.indicator?.value || indicatorCode,
      value: parseFloat(r.value),
      unit: guessUnit(indicatorCode),
      source_id: 'worldbank',
      retrieval_ts: ts,
      request_fingerprint: `worldbank:${r.countryiso3code}:${indicatorCode}:${r.date}`,
    }));
}

function guessUnit(code) {
  if (code.includes('CD') || code.includes('USD')) return 'current USD';
  if (code.includes('ZG') || code.includes('ZS')) return '%';
  return 'value';
}

/**
 * Convenience: fetch and normalise GDP for India and China.
 */
export async function fetchGDPSeries(dateRange = '2000:2024') {
  const ind = await fetchIndicator('IND', WORLDBANK.INDICATORS.GDP_CURRENT_USD, { date: dateRange });
  const chn = await fetchIndicator('CHN', WORLDBANK.INDICATORS.GDP_CURRENT_USD, { date: dateRange });
  return [
    ...normaliseWBIndicator(ind, WORLDBANK.INDICATORS.GDP_CURRENT_USD),
    ...normaliseWBIndicator(chn, WORLDBANK.INDICATORS.GDP_CURRENT_USD),
  ];
}
