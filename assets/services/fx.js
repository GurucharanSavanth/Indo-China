// assets/services/fx.js
/**
 * Frankfurter FX API client.
 * Keyless, browser-friendly. Updates daily ~16:00 CET.
 */

import { FRANKFURTER } from '../config/endpoints.js';
import { robustFetch } from './fetchers.js';
import { logError } from './errors.js';
import { track } from './telemetry.js';

/**
 * Fetch latest FX rates.
 * @returns {{ base, date, rates: { INR, CNY } }}
 */
export async function fetchLatestFX() {
  const url = FRANKFURTER.latest();
  track('fx', 'fetch_latest', { url });
  return await robustFetch(url, { responseType: 'json', cacheTtlMs: 15 * 60 * 1000 });
}

/**
 * Fetch a historical FX rate for a single date.
 * @param {string} dateStr - YYYY-MM-DD
 */
export async function fetchHistoricalFX(dateStr) {
  const url = FRANKFURTER.historical(dateStr);
  track('fx', 'fetch_historical', { url, date: dateStr });
  return await robustFetch(url, { responseType: 'json', cacheTtlMs: 24 * 60 * 60 * 1000 });
}

/**
 * Fetch FX time series between two dates.
 * Splits into 5-year chunks to avoid timeouts on long ranges.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {{ base, start_date, end_date, rates: { 'YYYY-MM-DD': { INR, CNY } } }}
 */
export async function fetchFXSeries(startDate, endDate) {
  const startYear = parseInt(startDate.slice(0, 4));
  const endYear = parseInt(endDate.slice(0, 4));

  // Split into 5-year chunks to avoid timeouts
  const allRates = {};
  for (let y = startYear; y <= endYear; y += 5) {
    const chunkStart = y === startYear ? startDate : `${y}-01-01`;
    const chunkEndYear = Math.min(y + 4, endYear);
    const chunkEnd = chunkEndYear === endYear ? endDate : `${chunkEndYear}-12-31`;

    const url = FRANKFURTER.series(chunkStart, chunkEnd);
    track('fx', 'fetch_series_chunk', { url, chunkStart, chunkEnd });

    try {
      const resp = await robustFetch(url, { responseType: 'json', cacheTtlMs: 60 * 60 * 1000 });
      if (resp && resp.rates) {
        Object.assign(allRates, resp.rates);
      }
    } catch (err) {
      logError(err);
      // Continue with remaining chunks even if one fails
    }
  }

  if (Object.keys(allRates).length === 0) {
    return null;
  }

  return { base: 'USD', start_date: startDate, end_date: endDate, rates: allRates };
}

/**
 * Normalise FX series into macro_fact rows.
 * Aggregates daily rates to annual averages for chart/correlation use.
 */
export function normaliseFXSeries(seriesData) {
  if (!seriesData || !seriesData.rates) return [];
  const ts = new Date().toISOString();

  // Group by year and compute annual averages
  const yearlyINR = {};
  const yearlyCNY = {};

  for (const [dateStr, rates] of Object.entries(seriesData.rates)) {
    const year = dateStr.slice(0, 4);
    if (rates.INR !== undefined) {
      if (!yearlyINR[year]) yearlyINR[year] = { sum: 0, count: 0 };
      yearlyINR[year].sum += rates.INR;
      yearlyINR[year].count++;
    }
    if (rates.CNY !== undefined) {
      if (!yearlyCNY[year]) yearlyCNY[year] = { sum: 0, count: 0 };
      yearlyCNY[year].sum += rates.CNY;
      yearlyCNY[year].count++;
    }
  }

  const rows = [];
  for (const [year, agg] of Object.entries(yearlyINR)) {
    rows.push({
      date: year,
      country_iso3: 'IND',
      indicator_code: 'FX_USD_INR',
      indicator_name: 'USD/INR Exchange Rate (annual avg)',
      value: parseFloat((agg.sum / agg.count).toFixed(4)),
      unit: 'INR per USD',
      source_id: 'frankfurter',
      retrieval_ts: ts,
      request_fingerprint: `frankfurter:annual:${year}:INR`,
    });
  }
  for (const [year, agg] of Object.entries(yearlyCNY)) {
    rows.push({
      date: year,
      country_iso3: 'CHN',
      indicator_code: 'FX_USD_CNY',
      indicator_name: 'USD/CNY Exchange Rate (annual avg)',
      value: parseFloat((agg.sum / agg.count).toFixed(4)),
      unit: 'CNY per USD',
      source_id: 'frankfurter',
      retrieval_ts: ts,
      request_fingerprint: `frankfurter:annual:${year}:CNY`,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.indicator_code.localeCompare(b.indicator_code));
}
