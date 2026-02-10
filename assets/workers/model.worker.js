// assets/workers/model.worker.js
/**
 * Web Worker for forecasting / modelling.
 * Runs statistical models off the main thread.
 *
 * Messages IN:  { type: 'forecast', values, params }
 * Messages OUT: { type: 'result'|'error', ... }
 *
 * NOTE: All outputs are MODEL OUTPUTS, NOT facts.
 */

self.onmessage = function (e) {
  const { type } = e.data;

  if (type === 'forecast') {
    try {
      const { values, params = {} } = e.data;
      const { horizon = 5, alpha = 0.3, beta = 0.1, seasonPeriod = 1 } = params;

      // Seasonal naive baseline
      const naive = seasonalNaive(values, seasonPeriod, horizon);

      // Holt-Winters
      const hw = holtWinters(values, { alpha, beta, gamma: 0.2, seasonPeriod, horizon });

      // Diagnostics via rolling eval
      const testSize = Math.min(3, Math.floor(values.length / 3));
      const naiveDiag = rollingEval(values, testSize, v => seasonalNaive(v, seasonPeriod, testSize));
      const hwDiag = rollingEval(values, testSize, v => holtWinters(v, { alpha, beta, gamma: 0.2, seasonPeriod, horizon: testSize }));

      self.postMessage({
        type: 'result',
        label: 'MODEL OUTPUT — NOT FACT',
        naive: { forecast: naive, diagnostics: naiveDiag },
        holtWinters: { forecast: hw, diagnostics: hwDiag },
      });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }

  if (type === 'regression') {
    try {
      const { y, X, labels } = e.data;
      const result = olsRegression(X, y);
      if (result) {
        result.label = 'MODEL OUTPUT — NOT FACT';
        result.predictorLabels = labels;
        result.rmse = calcRMSE(y, result.fitted);
        result.mape = calcMAPE(y, result.fitted);
        self.postMessage({ type: 'regression_result', ...result });
      } else {
        self.postMessage({ type: 'error', message: 'Regression failed (singular matrix).' });
      }
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};

// --- Inlined model functions (worker cannot import ES modules in all browsers) ---

function seasonalNaive(values, seasonPeriod, horizon) {
  const n = values.length;
  if (n < seasonPeriod + 1) return new Array(horizon).fill(null);
  const diffs = [];
  for (let i = seasonPeriod; i < n; i++) {
    if (values[i] !== null && values[i - seasonPeriod] !== null) {
      diffs.push(values[i] - values[i - seasonPeriod]);
    }
  }
  const avgTrend = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const sIdx = n - seasonPeriod + ((h - 1) % seasonPeriod);
    const base = sIdx >= 0 && sIdx < n ? values[sIdx] : values[n - 1];
    forecast.push(base !== null ? base + avgTrend * Math.ceil(h / seasonPeriod) : null);
  }
  return forecast;
}

function holtWinters(values, { alpha = 0.3, beta = 0.1, gamma = 0.2, seasonPeriod = 1, horizon = 5 } = {}) {
  const n = values.length;
  if (n < 2 * seasonPeriod) return seasonalNaive(values, seasonPeriod, horizon);
  let level = values.slice(0, seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
  let trend = 0;
  if (n >= 2 * seasonPeriod) {
    const a1 = values.slice(0, seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
    const a2 = values.slice(seasonPeriod, 2 * seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
    trend = (a2 - a1) / seasonPeriod;
  }
  const seasonal = new Array(seasonPeriod).fill(0);
  if (seasonPeriod > 1) {
    for (let i = 0; i < seasonPeriod; i++) seasonal[i] = (values[i] || 0) - level;
  }
  for (let t = 0; t < n; t++) {
    const v = values[t];
    if (v === null) continue;
    const sIdx = t % seasonPeriod;
    const pL = level;
    level = alpha * (v - seasonal[sIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - pL) + (1 - beta) * trend;
    if (seasonPeriod > 1) seasonal[sIdx] = gamma * (v - level) + (1 - gamma) * seasonal[sIdx];
  }
  const fc = [];
  for (let h = 1; h <= horizon; h++) {
    fc.push(level + trend * h + (seasonPeriod > 1 ? seasonal[(n + h - 1) % seasonPeriod] : 0));
  }
  return fc;
}

function olsRegression(X, y) {
  const n = y.length;
  const p = X[0].length;
  const Xa = X.map(r => [1, ...r]);
  const k = p + 1;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < k; l++) XtX[j][l] += Xa[i][j] * Xa[i][l];
      Xty[j] += Xa[i][j] * y[i];
    }
  }
  const coeffs = solveLinear(XtX, Xty);
  if (!coeffs) return null;
  const fitted = [], residuals = [];
  for (let i = 0; i < n; i++) {
    let yh = 0;
    for (let j = 0; j < k; j++) yh += coeffs[j] * Xa[i][j];
    fitted.push(yh);
    residuals.push(y[i] - yh);
  }
  return { coefficients: coeffs, fitted, residuals };
}

function solveLinear(A, b) {
  const n = A.length;
  const aug = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let mr = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[mr][c])) mr = r;
    [aug[c], aug[mr]] = [aug[mr], aug[c]];
    if (Math.abs(aug[c][c]) < 1e-12) return null;
    for (let r = c + 1; r < n; r++) {
      const f = aug[r][c] / aug[c][c];
      for (let j = c; j <= n; j++) aug[r][j] -= f * aug[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

function rollingEval(values, testSize, fcFn) {
  const clean = values.filter(v => v !== null);
  if (clean.length < testSize + 3) return { rmse: null, mape: null, residuals: [] };
  const train = clean.slice(0, clean.length - testSize);
  const test = clean.slice(clean.length - testSize);
  const pred = fcFn(train);
  return { rmse: calcRMSE(test, pred), mape: calcMAPE(test, pred), residuals: test.map((v, i) => v - (pred[i] || 0)) };
}

function calcRMSE(a, p) {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] != null && p[i] != null) { s += (a[i] - p[i]) ** 2; c++; } }
  return c > 0 ? Math.sqrt(s / c) : null;
}

function calcMAPE(a, p) {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] != null && a[i] !== 0 && p[i] != null) { s += Math.abs((a[i] - p[i]) / a[i]); c++; } }
  return c > 0 ? (s / c) * 100 : null;
}
