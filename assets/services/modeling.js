// assets/services/modeling.js
/**
 * Statistical modeling utilities for the forecast page.
 * These produce MODEL OUTPUTS, not facts. Always labeled as such.
 *
 * Implements:
 * - Seasonal naive + trend baseline
 * - Simple exponential smoothing / Holt-Winters-like
 * - Explanatory regression: trade_value ~ lag(FX) + GDP + seasonality dummies
 * - Rolling train/test evaluation with RMSE + MAPE
 */

/**
 * Seasonal naive forecast: last year's value + trend adjustment.
 * @param {number[]} values - historical values in chronological order
 * @param {number} seasonPeriod - e.g. 12 for monthly, 1 for annual
 * @param {number} horizonk - how many steps to forecast
 * @returns {number[]} forecasted values
 */
export function seasonalNaive(values, seasonPeriod = 1, horizon = 12) {
  const n = values.length;
  if (n < seasonPeriod + 1) return new Array(horizon).fill(null);

  // Compute trend as average difference between last period and previous
  const diffs = [];
  for (let i = seasonPeriod; i < n; i++) {
    if (values[i] !== null && values[i - seasonPeriod] !== null) {
      diffs.push(values[i] - values[i - seasonPeriod]);
    }
  }
  const avgTrend = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const seasonIdx = n - seasonPeriod + ((h - 1) % seasonPeriod);
    const base = seasonIdx >= 0 && seasonIdx < n ? values[seasonIdx] : values[n - 1];
    const stepsAhead = Math.ceil(h / seasonPeriod);
    forecast.push(base !== null ? base + avgTrend * stepsAhead : null);
  }
  return forecast;
}

/**
 * Holt-Winters additive (simplified double exponential smoothing with seasonal component).
 */
export function holtWinters(values, { alpha = 0.3, beta = 0.1, gamma = 0.2, seasonPeriod = 1, horizon = 12 } = {}) {
  const n = values.length;
  if (n < 2 * seasonPeriod) return seasonalNaive(values, seasonPeriod, horizon);

  // Initialize level, trend, and seasonal components
  let level = values.slice(0, seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
  let trend = 0;
  if (n >= 2 * seasonPeriod) {
    const avg1 = values.slice(0, seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
    const avg2 = values.slice(seasonPeriod, 2 * seasonPeriod).reduce((a, b) => a + (b || 0), 0) / seasonPeriod;
    trend = (avg2 - avg1) / seasonPeriod;
  }

  const seasonal = new Array(seasonPeriod).fill(0);
  if (seasonPeriod > 1) {
    for (let i = 0; i < seasonPeriod; i++) {
      seasonal[i] = (values[i] || 0) - level;
    }
  }

  // Fit
  for (let t = 0; t < n; t++) {
    const v = values[t];
    if (v === null) continue;
    const sIdx = t % seasonPeriod;
    const prevLevel = level;
    level = alpha * (v - seasonal[sIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    if (seasonPeriod > 1) {
      seasonal[sIdx] = gamma * (v - level) + (1 - gamma) * seasonal[sIdx];
    }
  }

  // Forecast
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const sIdx = (n + h - 1) % seasonPeriod;
    forecast.push(level + trend * h + (seasonPeriod > 1 ? seasonal[sIdx] : 0));
  }
  return forecast;
}

/**
 * Simple OLS regression: y = b0 + b1*x1 + b2*x2 + ...
 * @param {number[][]} X - matrix of predictors (each row is an observation)
 * @param {number[]} y - response variable
 * @returns {{ coefficients: number[], fitted: number[], residuals: number[] }}
 */
export function olsRegression(X, y) {
  const n = y.length;
  const p = X[0].length;
  // Add intercept
  const Xa = X.map(row => [1, ...row]);
  const k = p + 1;

  // X'X
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < k; l++) {
        XtX[j][l] += Xa[i][j] * Xa[i][l];
      }
      Xty[j] += Xa[i][j] * y[i];
    }
  }

  // Solve via Gaussian elimination
  const coefficients = solveLinear(XtX, Xty);
  if (!coefficients) return null;

  const fitted = [];
  const residuals = [];
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let j = 0; j < k; j++) yhat += coefficients[j] * Xa[i][j];
    fitted.push(yhat);
    residuals.push(y[i] - yhat);
  }

  return { coefficients, fitted, residuals };
}

function solveLinear(A, b) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return null;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
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

/**
 * Compute RMSE.
 */
export function rmse(actual, predicted) {
  let sum = 0, count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== null && predicted[i] !== null) {
      sum += (actual[i] - predicted[i]) ** 2;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : null;
}

/**
 * Compute MAPE (%).
 */
export function mape(actual, predicted) {
  let sum = 0, count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== null && actual[i] !== 0 && predicted[i] !== null) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }
  return count > 0 ? (sum / count) * 100 : null;
}

/**
 * Rolling train/test split evaluation.
 * @param {number[]} values
 * @param {number} testSize - number of periods to hold out
 * @param {function} forecastFn - (trainValues) => forecastArray of length testSize
 * @returns {{ rmse, mape, residuals }}
 */
export function rollingEval(values, testSize, forecastFn) {
  const clean = values.filter(v => v !== null);
  if (clean.length < testSize + 3) return { rmse: null, mape: null, residuals: [] };

  const train = clean.slice(0, clean.length - testSize);
  const test = clean.slice(clean.length - testSize);
  const predicted = forecastFn(train);

  return {
    rmse: rmse(test, predicted),
    mape: mape(test, predicted),
    residuals: test.map((v, i) => v - (predicted[i] || 0)),
  };
}
