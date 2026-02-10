// assets/services/transformers.js
/**
 * Data transformation utilities for the canonical data models.
 * Pure functions — no side effects.
 */

/**
 * Aggregate trade facts by year.
 */
export function aggregateByYear(tradeFacts) {
  const map = new Map();
  for (const row of tradeFacts) {
    const year = row.date.slice(0, 4);
    const key = `${year}|${row.flow}`;
    if (!map.has(key)) {
      map.set(key, { date: year, flow: row.flow, value_usd: 0, count: 0 });
    }
    const agg = map.get(key);
    if (row.value_usd !== null) {
      agg.value_usd += row.value_usd;
      agg.count++;
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compute year-over-year growth rate.
 */
export function computeYoY(sortedAnnual) {
  const result = [];
  for (let i = 0; i < sortedAnnual.length; i++) {
    const cur = sortedAnnual[i];
    const prev = sortedAnnual.find(r => r.date === String(Number(cur.date) - 1) && r.flow === cur.flow);
    result.push({
      ...cur,
      yoy_pct: prev && prev.value_usd > 0 ? ((cur.value_usd - prev.value_usd) / prev.value_usd) * 100 : null,
    });
  }
  return result;
}

/**
 * Compute CAGR over a window.
 */
export function computeCAGR(startValue, endValue, years) {
  if (!startValue || startValue <= 0 || !endValue || endValue <= 0 || years <= 0) return null;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * Compute trade balance (exports - imports) by year.
 */
export function computeBalance(yearlyAgg) {
  const exports = new Map();
  const imports = new Map();
  for (const r of yearlyAgg) {
    if (r.flow === 'EXPORT') exports.set(r.date, r.value_usd);
    if (r.flow === 'IMPORT') imports.set(r.date, r.value_usd);
  }
  const years = [...new Set([...exports.keys(), ...imports.keys()])].sort();
  return years.map(y => ({
    date: y,
    exports: exports.get(y) || 0,
    imports: imports.get(y) || 0,
    balance: (exports.get(y) || 0) - (imports.get(y) || 0),
    total: (exports.get(y) || 0) + (imports.get(y) || 0),
  }));
}

/**
 * Compute HHI (Herfindahl-Hirschman Index) for product concentration.
 */
export function computeHHI(productShares) {
  // productShares: array of { product_code, value_usd }
  const total = productShares.reduce((s, p) => s + (p.value_usd || 0), 0);
  if (total <= 0) return null;
  let hhi = 0;
  for (const p of productShares) {
    const share = (p.value_usd || 0) / total;
    hhi += share * share;
  }
  return hhi * 10000; // conventional scale
}

/**
 * Compute top-N share.
 */
export function computeTopNShare(productShares, n = 5) {
  const total = productShares.reduce((s, p) => s + (p.value_usd || 0), 0);
  if (total <= 0) return null;
  const sorted = [...productShares].sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0));
  const topN = sorted.slice(0, n).reduce((s, p) => s + (p.value_usd || 0), 0);
  return (topN / total) * 100;
}

/**
 * Compute Shannon entropy for product diversification.
 */
export function computeEntropy(productShares) {
  const total = productShares.reduce((s, p) => s + (p.value_usd || 0), 0);
  if (total <= 0) return null;
  let entropy = 0;
  for (const p of productShares) {
    const share = (p.value_usd || 0) / total;
    if (share > 0) {
      entropy -= share * Math.log2(share);
    }
  }
  return entropy;
}

/**
 * Pivot macro_fact rows into time-series by indicator.
 */
export function pivotMacroByIndicator(macroFacts, countryIso3) {
  const filtered = macroFacts.filter(r => r.country_iso3 === countryIso3);
  const indicators = new Map();
  for (const r of filtered) {
    if (!indicators.has(r.indicator_code)) {
      indicators.set(r.indicator_code, { indicator_code: r.indicator_code, indicator_name: r.indicator_name, series: [] });
    }
    indicators.get(r.indicator_code).series.push({ date: r.date, value: r.value });
  }
  // Sort each series
  for (const ind of indicators.values()) {
    ind.series.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...indicators.values()];
}

/**
 * Merge FX rates into an annual average for macro correlation.
 */
export function annualiseFX(fxRows) {
  const byYear = new Map();
  for (const r of fxRows) {
    const y = r.date.slice(0, 4);
    const key = `${y}|${r.indicator_code}`;
    if (!byYear.has(key)) byYear.set(key, { sum: 0, count: 0, indicator_code: r.indicator_code, country_iso3: r.country_iso3 });
    const agg = byYear.get(key);
    agg.sum += r.value;
    agg.count++;
  }
  return [...byYear.entries()].map(([key, v]) => ({
    date: key.split('|')[0],
    country_iso3: v.country_iso3,
    indicator_code: v.indicator_code,
    value: v.sum / v.count,
  }));
}

/**
 * Compute Pearson correlation coefficient between two equal-length arrays.
 */
export function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}
