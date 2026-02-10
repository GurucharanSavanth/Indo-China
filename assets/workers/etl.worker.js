// assets/workers/etl.worker.js
/**
 * Web Worker for ETL pipeline.
 * Runs data fetching, normalisation, and validation off the main thread.
 *
 * Messages IN:  { type: 'run', config: { ... } }
 * Messages OUT: { type: 'progress'|'result'|'error', ... }
 */

self.onmessage = async function (e) {
  const { type, config } = e.data;

  if (type === 'run') {
    try {
      post('progress', { step: 'start', pct: 0 });

      // In a worker we cannot use ES module imports directly in all browsers,
      // so the ETL logic is self-contained here or uses importScripts.
      // For this static dashboard, the main thread orchestrates fetches
      // and sends raw data here for transformation.

      post('progress', { step: 'ready', pct: 100 });
      post('result', { message: 'ETL worker ready. Send data for processing.' });
    } catch (err) {
      post('error', { message: err.message });
    }
  }

  if (type === 'transform_trade') {
    try {
      const rows = e.data.rows || [];
      post('progress', { step: 'validating', pct: 30 });

      // Validate
      const valid = [];
      const invalid = [];
      for (const row of rows) {
        if (row.date && row.flow && row.value_usd !== undefined) {
          valid.push(row);
        } else {
          invalid.push(row);
        }
      }

      post('progress', { step: 'aggregating', pct: 60 });

      // Aggregate by year
      const yearMap = new Map();
      for (const row of valid) {
        const year = String(row.date).slice(0, 4);
        const key = `${year}|${row.flow}`;
        if (!yearMap.has(key)) yearMap.set(key, { date: year, flow: row.flow, value_usd: 0, count: 0 });
        const agg = yearMap.get(key);
        if (row.value_usd !== null) {
          agg.value_usd += row.value_usd;
          agg.count++;
        }
      }

      const yearly = [...yearMap.values()].sort((a, b) => a.date.localeCompare(b.date));

      post('progress', { step: 'done', pct: 100 });
      post('result', { valid, invalid, yearly, totalValid: valid.length, totalInvalid: invalid.length });
    } catch (err) {
      post('error', { message: err.message });
    }
  }

  if (type === 'transform_macro') {
    try {
      const rows = e.data.rows || [];
      const valid = rows.filter(r => r.date && r.indicator_code && r.value !== null);
      post('result', { valid, totalValid: valid.length });
    } catch (err) {
      post('error', { message: err.message });
    }
  }
};

function post(type, payload) {
  self.postMessage({ type, ...payload });
}
