// assets/services/wits.js
/**
 * WITS (World Integrated Trade Solution) data client.
 * Implements QueryPlanner to respect WITS request limits.
 */

import { WITS } from '../config/endpoints.js';
import { robustFetch } from './fetchers.js';
import { WitsLimitError, logError } from './errors.js';
import { sha256 } from './cache.js';
import { track } from './telemetry.js';

/**
 * QueryPlanner: validates and chunks WITS queries.
 * Rules:
 *  - Max 2 dimensions can be "all".
 *  - reporter=all + partner=all together is NOT allowed.
 *  - If 2 dims are "all", all others must be specific.
 */
export class QueryPlanner {
  static DIMS = ['reporter', 'year', 'partner', 'product', 'indicator'];

  static validate(params) {
    const allDims = this.DIMS.filter(d => String(params[d]).toLowerCase() === 'all');
    if (allDims.length > 2) {
      return { valid: false, reason: `${allDims.length} dimensions set to ALL; max 2 allowed.` };
    }
    if (allDims.includes('reporter') && allDims.includes('partner')) {
      return { valid: false, reason: 'reporter=ALL + partner=ALL is not allowed.' };
    }
    if (allDims.length === 2) {
      const specificDims = this.DIMS.filter(d => !allDims.includes(d));
      for (const sd of specificDims) {
        if (String(params[sd]).toLowerCase() === 'all') {
          return { valid: false, reason: `When 2 dims are ALL, ${sd} must be specific.` };
        }
      }
    }
    return { valid: true };
  }

  /**
   * Chunk a query into valid sub-queries if it violates limits.
   * Strategy: split years into individual requests.
   */
  static chunk(datasource, params, yearRange = [2000, 2024]) {
    const check = this.validate(params);
    if (check.valid) {
      return [{ datasource, params }];
    }

    // Split by year blocks of 5
    const chunks = [];
    for (let y = yearRange[0]; y <= yearRange[1]; y += 5) {
      const endY = Math.min(y + 4, yearRange[1]);
      for (let yr = y; yr <= endY; yr++) {
        const p = { ...params, year: String(yr) };
        const recheck = this.validate(p);
        if (recheck.valid) {
          chunks.push({ datasource, params: p });
        }
      }
    }
    if (chunks.length === 0) {
      throw new WitsLimitError(check.reason);
    }
    return chunks;
  }
}

/**
 * Fetch WITS JSON data for a given datasource and params.
 * Auto-chunks if necessary.
 * Returns an array of raw response objects.
 */
export async function fetchWitsData(datasource, params, yearRange) {
  const queries = QueryPlanner.chunk(datasource, params, yearRange);
  const results = [];

  for (const q of queries) {
    const url = WITS.DATA.json(q.datasource, q.params);
    track('wits', 'fetch', { url });
    try {
      const data = await robustFetch(url, { responseType: 'json', cacheTtlMs: 60 * 60 * 1000 });
      results.push({ url, data, status: 'ok' });
    } catch (err) {
      logError(err);
      results.push({ url, data: null, status: 'failed', error: err.message });
    }
  }
  return results;
}

/**
 * Fetch WITS SDMX metadata (XML).
 */
export async function fetchWitsMetadata(endpoint) {
  try {
    return await robustFetch(endpoint, { responseType: 'xml', cacheTtlMs: 24 * 60 * 60 * 1000 });
  } catch (err) {
    logError(err);
    return null;
  }
}

/**
 * Normalise WITS JSON response into trade_fact rows.
 * Schema depends on actual response structure; this handles common shapes.
 */
export function normaliseWitsResponse(rawData, datasource, url) {
  const rows = [];
  const ts = new Date().toISOString();

  if (!rawData) return rows;

  // WITS JSON responses vary; common structure is an array of observation objects
  // or a dataset with series/observations. We handle both.
  const observations = extractObservations(rawData);

  for (const obs of observations) {
    rows.push({
      date: obs.year || obs.TimePeriod || '',
      frequency: 'A',
      reporter_iso3: obs.ReporterISO3 || obs.reporter || '',
      partner_iso3: obs.PartnerISO3 || obs.partner || '',
      flow: mapFlow(obs.TradeFlowCode || obs.Indicator || ''),
      product_level: obs.ProductCode === 'TOTAL' || obs.ProductCode === '999999' ? 'TOTAL' : 'GROUP',
      product_code: obs.ProductCode || 'TOTAL',
      product_name: obs.ProductDescription || obs.Product || '',
      value_usd: parseFloat(obs.Value) || null,
      unit: 'USD',
      source_id: `wits:${datasource}`,
      retrieval_ts: ts,
      request_fingerprint: url,
    });
  }
  return rows;
}

function extractObservations(data) {
  if (Array.isArray(data)) return data;
  if (data && data.dataSets && Array.isArray(data.dataSets)) {
    // SDMX-JSON structure
    const ds = data.dataSets[0];
    if (ds && ds.observations) return Object.values(ds.observations).map(v => v);
    if (ds && ds.series) {
      const obs = [];
      for (const s of Object.values(ds.series)) {
        if (s.observations) {
          for (const o of Object.values(s.observations)) {
            obs.push(o);
          }
        }
      }
      return obs;
    }
  }
  if (data && typeof data === 'object') {
    // Try common WITS structures
    for (const key of ['Dataset', 'data', 'wits', 'Data']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

function mapFlow(code) {
  const c = String(code).toUpperCase();
  if (c.includes('EXPORT') || c === 'X' || c === '2') return 'EXPORT';
  if (c.includes('IMPORT') || c === 'M' || c === '1') return 'IMPORT';
  return c;
}
