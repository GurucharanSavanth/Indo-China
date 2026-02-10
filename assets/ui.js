// assets/ui.js
/**
 * UI rendering — builds DOM for each route/page.
 * All DOM manipulation is centralised here.
 */

import { getState, setState, subscribe, addBanner, dismissBanner, syncFiltersToURL } from './state.js';
import { exportDatasetCSV } from './services/exporters.js';
import { isComtradeAvailable, getDisableReason } from './services/comtrade.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Banners ──────────────────────────────────────────────────
export function renderBanners() {
  const container = $('#banner-area');
  if (!container) return;
  const banners = getState().ui.banners;
  container.innerHTML = banners.map(b => `
    <div class="banner banner-${b.level}" data-id="${b.id}">
      <span>${b.text}</span>
      ${b.dismissible ? `<button class="banner-close" data-dismiss="${b.id}">&times;</button>` : ''}
    </div>
  `).join('');
  container.querySelectorAll('.banner-close').forEach(btn => {
    btn.addEventListener('click', () => dismissBanner(btn.dataset.dismiss));
  });
}

// ── Filters bar ──────────────────────────────────────────────
export function renderFilters() {
  const bar = $('#filter-bar');
  if (!bar) return;
  const f = getState().filters;
  const ui = getState().ui;

  bar.innerHTML = `
    <div class="filter-group">
      <label>Reporter</label>
      <select id="f-reporter">
        <option value="IND" ${f.reporter === 'IND' ? 'selected' : ''}>India</option>
        <option value="CHN" ${f.reporter === 'CHN' ? 'selected' : ''}>China</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Partner</label>
      <select id="f-partner">
        <option value="CHN" ${f.partner === 'CHN' ? 'selected' : ''}>China</option>
        <option value="IND" ${f.partner === 'IND' ? 'selected' : ''}>India</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Flow</label>
      <select id="f-flow">
        <option value="EXPORT" ${f.flow === 'EXPORT' ? 'selected' : ''}>Exports</option>
        <option value="IMPORT" ${f.flow === 'IMPORT' ? 'selected' : ''}>Imports</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Years</label>
      <input type="number" id="f-year-start" value="${f.yearStart}" min="1990" max="2030" style="width:70px">
      <span>–</span>
      <input type="number" id="f-year-end" value="${f.yearEnd}" min="1990" max="2030" style="width:70px">
    </div>
    <div class="filter-group">
      <label>Frequency</label>
      <select id="f-freq">
        <option value="A" ${f.frequency === 'A' ? 'selected' : ''}>Annual</option>
        <option value="M" ${f.frequency === 'M' ? 'selected' : ''}>Monthly</option>
      </select>
    </div>
    <div class="filter-group">
      <label>
        <input type="checkbox" id="f-mirror" ${ui.mirrorMode ? 'checked' : ''}>
        Mirror
      </label>
    </div>
    <div class="filter-group">
      <button id="btn-export-csv" class="btn btn-sm">Export CSV</button>
    </div>
  `;

  // Bind events
  const bind = (id, key, transform = v => v) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', () => {
      setState(key, transform(el.type === 'checkbox' ? el.checked : el.value));
      syncFiltersToURL();
    });
  };
  bind('f-reporter', 'filters.reporter');
  bind('f-partner', 'filters.partner');
  bind('f-flow', 'filters.flow');
  bind('f-year-start', 'filters.yearStart', v => parseInt(v));
  bind('f-year-end', 'filters.yearEnd', v => parseInt(v));
  bind('f-freq', 'filters.frequency');
  bind('f-mirror', 'ui.mirrorMode');

  $('#btn-export-csv')?.addEventListener('click', () => {
    const state = getState();
    const rows = state.tradeFacts.length > 0 ? state.tradeFacts : [];
    if (rows.length === 0) {
      addBanner({ level: 'info', text: 'No data to export.', dismissible: true });
      return;
    }
    exportDatasetCSV(rows, `trade_${state.filters.reporter}_${state.filters.partner}.csv`);
  });
}

// ── Loading spinner ──────────────────────────────────────────
export function showLoading(msg = 'Loading...') {
  setState('ui.loading', true);
  const el = $('#loading-overlay');
  if (el) { el.style.display = 'flex'; el.querySelector('span').textContent = msg; }
}

export function hideLoading() {
  setState('ui.loading', false);
  const el = $('#loading-overlay');
  if (el) el.style.display = 'none';
}

// ── Page containers ──────────────────────────────────────────
export function renderPage(route) {
  const main = $('#main-content');
  if (!main) return;

  switch (route) {
    case '#/overview': return renderOverview(main);
    case '#/composition': return renderComposition(main);
    case '#/tariffs': return renderTariffs(main);
    case '#/macro': return renderMacro(main);
    case '#/forecast': return renderForecast(main);
    case '#/methods': return renderMethods(main);
    default: return renderOverview(main);
  }
}

// ── Overview ─────────────────────────────────────────────────
function renderOverview(el) {
  el.innerHTML = `
    <h2>Overview: India–China Bilateral Trade</h2>
    <div class="kpi-row" id="kpi-row"></div>
    <div class="chart-container">
      <div class="chart-header">
        <h3>Annual Trade Flow</h3>
        <div class="chart-actions">
          <button class="btn btn-xs" data-export="overview-chart" data-fmt="png">PNG</button>
          <button class="btn btn-xs" data-export="overview-chart" data-fmt="svg">SVG</button>
        </div>
      </div>
      <div id="overview-chart" style="width:100%;height:420px;"></div>
      <div class="provenance" id="overview-provenance"></div>
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Trade Balance</h3></div>
      <div id="balance-chart" style="width:100%;height:350px;"></div>
    </div>
  `;
}

// ── Composition ──────────────────────────────────────────────
function renderComposition(el) {
  const comtradeNote = isComtradeAvailable()
    ? ''
    : `<div class="info-box">Comtrade not enabled. Showing WITS product groups. ${getDisableReason()}</div>`;

  el.innerHTML = `
    <h2>Trade Composition</h2>
    ${comtradeNote}
    <div class="chart-container">
      <div class="chart-header">
        <h3>Product Composition</h3>
        <div class="chart-actions">
          <button class="btn btn-xs" data-export="comp-treemap" data-fmt="png">PNG</button>
        </div>
      </div>
      <div id="comp-treemap" style="width:100%;height:450px;"></div>
      <div class="provenance" id="comp-provenance"></div>
    </div>
    <div class="metrics-row" id="concentration-metrics"></div>
    <div class="chart-container">
      <div class="chart-header"><h3>Top Products Rank Shift</h3></div>
      <div id="comp-rank" style="width:100%;height:350px;"></div>
    </div>
  `;
}

// ── Tariffs ──────────────────────────────────────────────────
function renderTariffs(el) {
  el.innerHTML = `
    <h2>Tariffs</h2>
    <div class="chart-container">
      <div class="chart-header"><h3>Tariff Indicators</h3></div>
      <div id="tariff-chart" style="width:100%;height:400px;"></div>
      <div class="provenance" id="tariff-provenance"></div>
    </div>
    <div id="tariff-status"></div>
  `;
}

// ── Macro ────────────────────────────────────────────────────
function renderMacro(el) {
  el.innerHTML = `
    <h2>Macroeconomic Drivers</h2>
    <div class="chart-container">
      <div class="chart-header"><h3>GDP Series (Current USD)</h3></div>
      <div id="gdp-chart" style="width:100%;height:380px;"></div>
      <div class="provenance" id="gdp-provenance"></div>
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Exchange Rates (USD base)</h3></div>
      <div id="fx-chart" style="width:100%;height:350px;"></div>
      <div class="provenance" id="fx-provenance">
        <small>Source: Frankfurter API (ECB reference rates). Rates update daily ~16:00 CET.</small>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Correlation Explorer</h3></div>
      <div class="correlation-controls">
        <label>Lag (years): <input type="range" id="corr-lag" min="0" max="5" value="0"><span id="corr-lag-val">0</span></label>
        <p class="caveat">Caveat: Correlation does not imply causation.</p>
      </div>
      <div id="corr-chart" style="width:100%;height:350px;"></div>
    </div>
  `;
}

// ── Forecast ─────────────────────────────────────────────────
function renderForecast(el) {
  el.innerHTML = `
    <h2>Forecast (Model Output — Not Fact)</h2>
    <div class="model-warning">
      All values on this page are <strong>model outputs</strong>, not observed data.
      They are produced by statistical models and should be interpreted with caution.
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Baseline Forecast</h3></div>
      <div id="forecast-chart" style="width:100%;height:400px;"></div>
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Regression: trade ~ lag(FX) + GDP</h3></div>
      <div id="regression-chart" style="width:100%;height:350px;"></div>
    </div>
    <div class="diagnostics-panel" id="diagnostics">
      <h3>Diagnostics</h3>
      <div id="diag-content"></div>
    </div>
  `;
}

// ── Methods ──────────────────────────────────────────────────
function renderMethods(el) {
  el.innerHTML = `
    <h2>Methodology & Sources</h2>
    <div class="methods-content">
      <h3>Data Sources</h3>
      <ul>
        <li><strong>WITS (World Integrated Trade Solution)</strong> — bilateral trade flows, product composition, tariff indicators.
          <br><a href="https://wits.worldbank.org/witsapiintro.aspx?lang=en" target="_blank">API Documentation</a>
          | <a href="https://wits.worldbank.org/data/public/WITSAPI_UserGuide.pdf" target="_blank">User Guide (PDF)</a>
        </li>
        <li><strong>World Bank Indicators API (V2)</strong> — GDP, macro indicators.
          <br><a href="https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures" target="_blank">Basic Call Structures</a>
          | <a href="https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries" target="_blank">Indicator Queries</a>
        </li>
        <li><strong>Frankfurter API</strong> — USD/INR and USD/CNY exchange rates (ECB reference rates).
          <br><a href="https://frankfurter.dev/" target="_blank">Documentation</a>
          <br>Note: Rates update daily ~16:00 CET. "Rate date" shown on all FX displays.
        </li>
        <li><strong>UN Comtrade</strong> (optional, feature-flagged) — HS-level product detail.
          <br><a href="https://comtradedeveloper.un.org/" target="_blank">Developer Portal</a>
          | <a href="https://comtradeplus.un.org/ListOfReferences" target="_blank">Reference Codes</a>
        </li>
      </ul>

      <h3>Data Processing</h3>
      <ul>
        <li>All trade values in current USD.</li>
        <li>Missing values preserved as null/gaps — no imputation unless user toggles.</li>
        <li>Schema validation on every dataset; raw data stored even if validation fails.</li>
        <li>Request fingerprints (URL + params hash) stored for reproducibility.</li>
      </ul>

      <h3>Forecasting Models</h3>
      <p>Models produce <strong>model outputs, not facts</strong>. Labeled explicitly.</p>
      <ul>
        <li><strong>Seasonal Naive + Trend</strong>: Last season's value plus average trend growth.</li>
        <li><strong>Holt-Winters</strong>: Additive triple exponential smoothing (level, trend, seasonal).</li>
        <li><strong>Explanatory Regression</strong>: OLS with trade_value ~ lag(FX) + GDP + seasonality dummies.</li>
      </ul>
      <p>Diagnostics: Rolling train/test splits, RMSE, MAPE, residual summaries.</p>

      <h3>Concentration Metrics</h3>
      <ul>
        <li><strong>HHI</strong>: Herfindahl-Hirschman Index (sum of squared shares, ×10000).</li>
        <li><strong>Top-5 Share</strong>: Combined share of top 5 product groups.</li>
        <li><strong>Shannon Entropy</strong>: Information-theoretic diversification measure.</li>
      </ul>

      <h3>Limitations</h3>
      <ul>
        <li>WITS API limits: max 2 dimensions as ALL; reporter+partner both ALL not permitted.</li>
        <li>CORS restrictions may prevent live refresh from some browsers; pre-fetched WITS data is displayed in that case.</li>
        <li>Exchange rates are ECB reference rates (mid-market), not transaction rates.</li>
        <li>Correlation ≠ causation — macro correlations are exploratory, not causal.</li>
      </ul>
    </div>
  `;
}

// ── KPI rendering ────────────────────────────────────────────
export function renderKPIs(data) {
  const container = $('#kpi-row');
  if (!container) return;

  const format = (v) => v !== null && v !== undefined
    ? '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(0) + 'M')
    : 'Data unavailable';

  const formatPct = (v) => v !== null && v !== undefined ? v.toFixed(1) + '%' : '–';

  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Exports</div>
      <div class="kpi-value">${format(data.exports)}</div>
      <div class="kpi-sub">YoY: ${formatPct(data.exportYoY)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Imports</div>
      <div class="kpi-value">${format(data.imports)}</div>
      <div class="kpi-sub">YoY: ${formatPct(data.importYoY)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Trade</div>
      <div class="kpi-value">${format(data.total)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Balance</div>
      <div class="kpi-value ${data.balance < 0 ? 'kpi-negative' : ''}">${format(data.balance)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">CAGR (5yr)</div>
      <div class="kpi-value">${formatPct(data.cagr5)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">CAGR (10yr)</div>
      <div class="kpi-value">${formatPct(data.cagr10)}</div>
    </div>
  `;
}

// ── Provenance rendering ─────────────────────────────────────
export function renderProvenance(elId, info) {
  const el = $(`#${elId}`);
  if (!el) return;
  el.innerHTML = `
    <small>
      Source: ${info.source || '–'} | Dataset: ${info.dataset || '–'}
      | Retrieved: ${info.retrieval_ts || '–'}
      | ${info.url ? `<a href="${info.url}" target="_blank" rel="noopener">Request URL</a>` : `File: ${info.file || '–'}`}
      ${info.note ? `<br>Note: ${info.note}` : ''}
    </small>
  `;
}

// ── Concentration metrics ────────────────────────────────────
export function renderConcentrationMetrics(metrics) {
  const el = $('#concentration-metrics');
  if (!el) return;
  el.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">HHI</div>
      <div class="metric-value">${metrics.hhi !== null ? metrics.hhi.toFixed(0) : 'Data unavailable'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Top-5 Share</div>
      <div class="metric-value">${metrics.top5 !== null ? metrics.top5.toFixed(1) + '%' : 'Data unavailable'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Entropy</div>
      <div class="metric-value">${metrics.entropy !== null ? metrics.entropy.toFixed(2) : 'Data unavailable'}</div>
    </div>
  `;
}

// ── Diagnostics panel ────────────────────────────────────────
export function renderDiagnostics(diag) {
  const el = $('#diag-content');
  if (!el) return;
  if (!diag) {
    el.innerHTML = '<p>No diagnostics available. Run forecast first.</p>';
    return;
  }
  el.innerHTML = `
    <table class="diag-table">
      <tr><th>Model</th><th>RMSE</th><th>MAPE</th></tr>
      <tr>
        <td>Seasonal Naive</td>
        <td>${diag.naive?.rmse !== null ? diag.naive.rmse.toFixed(2) : '–'}</td>
        <td>${diag.naive?.mape !== null ? diag.naive.mape.toFixed(1) + '%' : '–'}</td>
      </tr>
      <tr>
        <td>Holt-Winters</td>
        <td>${diag.hw?.rmse !== null ? diag.hw.rmse.toFixed(2) : '–'}</td>
        <td>${diag.hw?.mape !== null ? diag.hw.mape.toFixed(1) + '%' : '–'}</td>
      </tr>
    </table>
    <h4>Residual Summary</h4>
    <pre>${JSON.stringify(diag.residualSummary || {}, null, 2)}</pre>
  `;
}

// Listen for banner updates
subscribe('ui.banners', renderBanners);
