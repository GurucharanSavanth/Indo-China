// assets/app.js
/**
 * Application entry point.
 * Orchestrates data loading, routing, and page rendering.
 */

import { loadLocalConfig, flag } from './config/featureFlags.js';
import { initRouter } from './router.js';
import { getState, setState, batchUpdate, subscribe, addBanner } from './state.js';
import {
  renderPage, renderFilters, renderBanners, renderKPIs, renderProvenance,
  renderConcentrationMetrics, renderDiagnostics, showLoading, hideLoading
} from './ui.js';
import {
  renderOverviewChart, renderBalanceChart, renderCompositionTreemap,
  renderRankShiftChart, renderTariffChart, renderGDPChart, renderFXChart,
  renderCorrelationChart, renderForecastChart, renderRegressionChart,
  wireExportButtons, disposeAll
} from './charts.js';
import { fetchWitsData, normaliseWitsResponse } from './services/wits.js';
import { fetchIndicator, normaliseWBIndicator } from './services/worldbank.js';
import { fetchFXSeries, normaliseFXSeries } from './services/fx.js';
import { isComtradeAvailable } from './services/comtrade.js';
import { validateBatch } from './services/validators.js';
import {
  aggregateByYear, computeYoY, computeBalance, computeCAGR,
  computeHHI, computeTopNShare, computeEntropy,
  annualiseFX, pearsonCorrelation
} from './services/transformers.js';
import { errorToBanner, logError } from './services/errors.js';
import { WORLDBANK } from './config/endpoints.js';

// ── Bootstrap ────────────────────────────────────────────────
async function init() {
  await loadLocalConfig();

  // Load WITS trade data first for instant display
  await loadSnapshots();

  // Render initial UI
  renderFilters();
  renderBanners();

  // Set up router
  initRouter(onRouteChange);

  // Subscribe to filter changes for cross-filtering
  subscribe('filters.flow', () => refreshCurrentPage());
  subscribe('filters.reporter', () => refreshCurrentPage());
  subscribe('filters.partner', () => refreshCurrentPage());
  subscribe('filters.yearStart', () => refreshCurrentPage());
  subscribe('filters.yearEnd', () => refreshCurrentPage());
  subscribe('filters.frequency', () => refreshCurrentPage());
  subscribe('ui.mirrorMode', () => refreshCurrentPage());

  // Attempt live refresh in background (non-blocking)
  if (flag('liveRefresh')) {
    setTimeout(() => attemptLiveRefresh(), 300);
  }
}

// ── Snapshot loading ─────────────────────────────────────────
async function loadSnapshots() {
  try {
    const [tradeResp, compResp, gdpResp, fxResp, tariffResp] = await Promise.allSettled([
      fetch('./assets/data/processed/trade_annual.json').then(r => r.json()),
      fetch('./assets/data/processed/trade_composition.json').then(r => r.json()),
      fetch('./assets/data/processed/macro_gdp.json').then(r => r.json()),
      fetch('./assets/data/processed/fx_series.json').then(r => r.json()),
      fetch('./assets/data/processed/tariff_indicators.json').then(r => r.json()),
    ]);

    const tradeFacts = tradeResp.status === 'fulfilled' ? (tradeResp.value.data || []) : [];
    const compFacts = compResp.status === 'fulfilled' ? (compResp.value.data || []) : [];
    const gdpFacts = gdpResp.status === 'fulfilled' ? (gdpResp.value.data || []) : [];
    const fxFacts = fxResp.status === 'fulfilled' ? (fxResp.value.data || []) : [];
    const tariffFacts = tariffResp.status === 'fulfilled' ? (tariffResp.value.data || []) : [];

    const validTrade = [...tradeFacts, ...compFacts].filter(r => r.value_usd !== null);
    const validMacro = [...gdpFacts, ...fxFacts, ...tariffFacts].filter(r => r.value !== null);

    batchUpdate({
      tradeFacts: validTrade,
      macroFacts: validMacro,
      'ui.snapshotMode': true,
    });

    if (validMacro.length > 0 || validTrade.length > 0) {
      addBanner({ level: 'info', text: `Loaded WITS trade data (${validTrade.length} trade, ${validMacro.length} macro records). Live refresh starting...`, dismissible: true });
    }
  } catch (err) {
    logError(err);
  }
}

// ── Live data refresh ────────────────────────────────────────
async function attemptLiveRefresh() {
  showLoading('Fetching live data...');

  // Refresh sources that support CORS (World Bank, Frankfurter)
  // WITS typically blocks CORS from browsers — handled gracefully
  const tasks = [
    refreshMacroData(),
    refreshFXData(),
    refreshTradeData(),
  ];

  const results = await Promise.allSettled(tasks);

  let anySuccess = false;
  for (const r of results) {
    if (r.status === 'rejected') {
      const banner = errorToBanner(r.reason);
      addBanner(banner);
    } else if (r.value === true) {
      anySuccess = true;
    }
  }

  if (anySuccess) {
    setState('ui.snapshotMode', false);
    // Clear the initial snapshot info banner
    const banners = getState().ui.banners.filter(b => !b.text.includes('Loaded WITS trade data'));
    setState('ui.banners', banners);
  }

  hideLoading();
  refreshCurrentPage();
}

async function refreshTradeData() {
  try {
    const results = await fetchWitsData('tradestats-trade', {
      reporter: 'IND',
      year: 'all',
      partner: 'CHN',
      product: '999999',
      indicator: 'all',
    }, [2000, 2024]);

    const allRows = [];
    for (const r of results) {
      if (r.status === 'ok' && r.data) {
        const normalised = normaliseWitsResponse(r.data, 'tradestats-trade', r.url);
        allRows.push(...normalised);
      }
    }

    if (allRows.length > 0) {
      const { valid } = validateBatch(allRows, 'trade_fact');
      if (valid.length > 0) {
        setState('tradeFacts', valid);
        return true;
      }
    }

    // WITS returned no usable data — likely CORS or empty response
    addBanner({
      level: 'warn',
      text: 'WITS trade data unavailable from browser (CORS). Displaying pre-fetched WITS data for trade flows.',
      dismissible: true,
    });
    return false;
  } catch (err) {
    logError(err);
    addBanner({
      level: 'warn',
      text: 'WITS trade data unavailable (CORS/network). Displaying pre-fetched WITS data.',
      dismissible: true,
    });
    return false;
  }
}

async function refreshMacroData() {
  try {
    const [indGDP, chnGDP] = await Promise.all([
      fetchIndicator('IND', WORLDBANK.INDICATORS.GDP_CURRENT_USD, { date: '2000:2024' }),
      fetchIndicator('CHN', WORLDBANK.INDICATORS.GDP_CURRENT_USD, { date: '2000:2024' }),
    ]);

    const gdpRows = [
      ...normaliseWBIndicator(indGDP, WORLDBANK.INDICATORS.GDP_CURRENT_USD),
      ...normaliseWBIndicator(chnGDP, WORLDBANK.INDICATORS.GDP_CURRENT_USD),
    ];

    if (gdpRows.length > 0) {
      const { valid } = validateBatch(gdpRows, 'macro_fact');
      const existing = getState().macroFacts.filter(r => r.source_id !== 'worldbank');
      setState('macroFacts', [...existing, ...valid]);
      return true;
    }
    // World Bank returned no data — CORS likely blocked from this origin
    return false;
  } catch (err) {
    logError(err);
    return false;
  }
}

async function refreshFXData() {
  try {
    const fxSeries = await fetchFXSeries('2005-01-03', '2024-12-31');
    if (fxSeries) {
      const fxRows = normaliseFXSeries(fxSeries);
      if (fxRows.length > 0) {
        const existing = getState().macroFacts.filter(r => r.source_id !== 'frankfurter');
        setState('macroFacts', [...existing, ...fxRows]);
        return true;
      }
    }
    return false;
  } catch (err) {
    logError(err);
    return false;
  }
}

// ── Route change handler ─────────────────────────────────────
function onRouteChange(route) {
  disposeAll();
  renderPage(route);
  renderFilters();

  // Render charts for the active route after DOM is ready
  requestAnimationFrame(() => {
    populateRoute(route);
    wireExportButtons();
  });
}

function refreshCurrentPage() {
  const route = getState().ui.activeRoute;
  populateRoute(route);
}

// ── Route-specific data population ───────────────────────────
function populateRoute(route) {
  const state = getState();
  const f = state.filters;

  // Apply cross-filter
  const reporter = state.ui.mirrorMode ? f.partner : f.reporter;
  const partner = state.ui.mirrorMode ? f.reporter : f.partner;

  const filteredTrade = state.tradeFacts.filter(r => {
    if (r.reporter_iso3 && r.reporter_iso3 !== reporter) return false;
    if (r.partner_iso3 && r.partner_iso3 !== partner) return false;
    const year = parseInt(r.date);
    if (year < f.yearStart || year > f.yearEnd) return false;
    if (f.frequency !== 'A' && r.frequency !== f.frequency) return false;
    return true;
  });

  switch (route) {
    case '#/overview':
      populateOverview(filteredTrade, state);
      break;
    case '#/composition':
      populateComposition(filteredTrade, state);
      break;
    case '#/tariffs':
      populateTariffs(state);
      break;
    case '#/macro':
      populateMacro(state);
      break;
    case '#/forecast':
      populateForecast(filteredTrade, state);
      break;
    case '#/methods':
      break;
  }
}

function populateOverview(filteredTrade, state) {
  // Filter to TOTAL-level rows only to prevent double-counting with composition GROUP rows
  const totalTrade = filteredTrade.filter(r => r.product_level === 'TOTAL');
  const yearly = aggregateByYear(totalTrade);
  const withYoY = computeYoY(yearly);
  const balance = computeBalance(yearly);

  renderOverviewChart(yearly);
  renderBalanceChart(balance);

  // KPIs from latest available year in actual data (not filter yearEnd which may exceed data range)
  const availableYears = [...new Set(yearly.map(r => r.date))].sort();
  const latestYear = availableYears.length > 0 ? availableYears[availableYears.length - 1] : String(state.filters.yearEnd);
  const latestExport = withYoY.find(r => r.date === latestYear && r.flow === 'EXPORT');
  const latestImport = withYoY.find(r => r.date === latestYear && r.flow === 'IMPORT');
  const latestBalance = balance.find(r => r.date === latestYear);

  const exportValues = yearly.filter(r => r.flow === 'EXPORT').sort((a, b) => a.date.localeCompare(b.date));
  const cagr5Export = exportValues.length >= 6
    ? computeCAGR(exportValues[exportValues.length - 6]?.value_usd, exportValues[exportValues.length - 1]?.value_usd, 5)
    : null;
  const cagr10Export = exportValues.length >= 11
    ? computeCAGR(exportValues[exportValues.length - 11]?.value_usd, exportValues[exportValues.length - 1]?.value_usd, 10)
    : null;

  renderKPIs({
    exports: latestExport?.value_usd ?? null,
    imports: latestImport?.value_usd ?? null,
    total: latestBalance?.total ?? null,
    balance: latestBalance?.balance ?? null,
    exportYoY: latestExport?.yoy_pct ?? null,
    importYoY: latestImport?.yoy_pct ?? null,
    cagr5: cagr5Export,
    cagr10: cagr10Export,
  });

  renderProvenance('overview-provenance', {
    source: 'WITS TradeStats',
    dataset: 'tradestats-trade',
    retrieval_ts: totalTrade.length > 0 ? totalTrade[0].retrieval_ts : new Date().toISOString(),
    url: 'https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/reporter/IND/year/all/partner/CHN/product/999999/indicator/all?format=JSON',
    note: totalTrade.length === 0 ? 'No trade data available. WITS API may be blocked by CORS.' : '',
  });

  wireExportButtons();
}

function populateComposition(filteredTrade, state) {
  const productData = filteredTrade.filter(r => r.product_level !== 'TOTAL' && r.flow === state.filters.flow);

  renderCompositionTreemap(productData);

  if (productData.length > 0) {
    renderConcentrationMetrics({
      hhi: computeHHI(productData),
      top5: computeTopNShare(productData, 5),
      entropy: computeEntropy(productData),
    });
  } else {
    renderConcentrationMetrics({ hhi: null, top5: null, entropy: null });
  }

  // Compute rank shift from ALL years of composition data (not just filtered year range)
  const allCompositionRows = state.tradeFacts.filter(
    r => r.product_level !== 'TOTAL' && r.flow === state.filters.flow
  );
  const rankData = computeProductRankings(allCompositionRows);
  renderRankShiftChart(rankData);

  renderProvenance('comp-provenance', {
    source: isComtradeAvailable() ? 'UN Comtrade' : 'WITS TradeStats',
    dataset: 'product groups',
    retrieval_ts: productData.length > 0 ? productData[0].retrieval_ts : new Date().toISOString(),
    file: 'trade_composition.json',
  });
}

function computeProductRankings(productRows) {
  const byYear = {};
  for (const r of productRows) {
    if (!byYear[r.date]) byYear[r.date] = [];
    byYear[r.date].push(r);
  }

  const ranksByProduct = {};
  for (const [year, rows] of Object.entries(byYear)) {
    const sorted = [...rows].sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0));
    sorted.forEach((row, idx) => {
      const key = row.product_code;
      if (!ranksByProduct[key]) {
        ranksByProduct[key] = { product_name: row.product_name, product_code: key, rankings: [] };
      }
      ranksByProduct[key].rankings.push({ year: row.date, rank: idx + 1 });
    });
  }

  return Object.values(ranksByProduct)
    .filter(p => p.rankings.length >= 2)
    .sort((a, b) => {
      const avgA = a.rankings.reduce((s, r) => s + r.rank, 0) / a.rankings.length;
      const avgB = b.rankings.reduce((s, r) => s + r.rank, 0) / b.rankings.length;
      return avgA - avgB;
    })
    .slice(0, 10);
}

function populateTariffs(state) {
  const tariffData = state.macroFacts.filter(r =>
    r.source_id && r.source_id.includes('tariff')
  );
  renderTariffChart(tariffData);
  renderProvenance('tariff-provenance', {
    source: 'WITS TradeStats-Tariff',
    dataset: 'tradestats-tariff',
    retrieval_ts: tariffData.length > 0 ? tariffData[0].retrieval_ts : new Date().toISOString(),
    file: 'tariff_indicators.json',
    note: tariffData.length === 0 ? 'No tariff data available from configured sources.' : '',
  });
}

function populateMacro(state) {
  const macroData = state.macroFacts;
  const gdpData = macroData.filter(r => r.indicator_code === 'NY.GDP.MKTP.CD');
  const fxData = macroData.filter(r => r.indicator_code?.startsWith('FX_'));

  renderGDPChart(gdpData);
  renderFXChart(fxData);

  renderProvenance('gdp-provenance', {
    source: 'World Bank',
    dataset: 'NY.GDP.MKTP.CD',
    retrieval_ts: gdpData.length > 0 ? gdpData[0].retrieval_ts : new Date().toISOString(),
    url: 'https://api.worldbank.org/v2/country/IND;CHN/indicator/NY.GDP.MKTP.CD?format=json',
  });

  setupCorrelationExplorer();
}

function setupCorrelationExplorer() {
  const lagSlider = document.getElementById('corr-lag');
  const lagVal = document.getElementById('corr-lag-val');
  if (!lagSlider) return;

  const update = () => {
    const lag = parseInt(lagSlider.value);
    lagVal.textContent = lag;

    // Re-read state on every update to get latest data
    const currentState = getState();
    const macroData = currentState.macroFacts;
    const fxAnnual = annualiseFX(macroData.filter(r => r.indicator_code === 'FX_USD_INR'));
    const tradeYearly = aggregateByYear(currentState.tradeFacts.filter(r => r.flow === 'EXPORT' && r.product_level === 'TOTAL'));

    const xData = [], yData = [];
    for (const t of tradeYearly) {
      const fxYear = String(parseInt(t.date) - lag);
      const fx = fxAnnual.find(f => f.date === fxYear);
      if (fx && t.value_usd !== null) {
        xData.push(fx.value);
        yData.push(t.value_usd);
      }
    }

    renderCorrelationChart(xData, yData, `USD/INR (lag ${lag}yr)`, 'Export Value (USD)');
  };

  lagSlider.addEventListener('input', update);
  update();
}

function populateForecast(filteredTrade, state) {
  // Filter to TOTAL-level rows only to prevent double-counting with composition GROUP rows
  const totalTrade = filteredTrade.filter(r => r.product_level === 'TOTAL');
  const yearly = aggregateByYear(totalTrade);
  const exportSeries = yearly
    .filter(r => r.flow === state.filters.flow)
    .sort((a, b) => a.date.localeCompare(b.date));

  const values = exportSeries.map(r => r.value_usd);
  const years = exportSeries.map(r => r.date);

  if (values.filter(v => v !== null).length < 3) {
    const fcEl = document.getElementById('forecast-chart');
    if (fcEl) fcEl.innerHTML = '<div style="text-align:center;padding:60px;color:#999;">Insufficient trade data for forecasting. At least 3 years of data required.</div>';
    renderDiagnostics(null);
    return;
  }

  // Use model worker with proper message handling
  const worker = new Worker('./assets/workers/model.worker.js');

  worker.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === 'result') {
      const forecastYears = [];
      const lastYear = parseInt(years[years.length - 1]);
      for (let i = 1; i <= 5; i++) forecastYears.push(String(lastYear + i));

      renderForecastChart(
        values,
        msg.naive.forecast,
        msg.holtWinters.forecast,
        [...years, ...forecastYears]
      );

      renderDiagnostics({
        naive: msg.naive.diagnostics,
        hw: msg.holtWinters.diagnostics,
        residualSummary: {
          naive_residuals: msg.naive.diagnostics.residuals,
          hw_residuals: msg.holtWinters.diagnostics.residuals,
        },
      });

      // Now run regression on the same worker
      runRegressionOnWorker(worker, years, values);
    }

    if (msg.type === 'regression_result') {
      const actual = worker._regressionActual || msg.fitted;
      const yearLabels = worker._regressionYears || [];
      renderRegressionChart(actual, msg.fitted, yearLabels);
      worker.terminate();
    }

    if (msg.type === 'error') {
      renderDiagnostics({ error: msg.message });
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    console.error('Model worker error:', err);
    worker.terminate();
  };

  worker.postMessage({ type: 'forecast', values, params: { horizon: 5, seasonPeriod: 1 } });
}

function runRegressionOnWorker(worker, years, tradeValues) {
  const currentState = getState();
  const macroData = currentState.macroFacts;
  const fxAnnual = annualiseFX(macroData.filter(r => r.indicator_code === 'FX_USD_INR'));
  const gdpData = macroData.filter(r => r.country_iso3 === 'IND' && r.indicator_code === 'NY.GDP.MKTP.CD');

  const y = [], X = [], yearLabels = [];
  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    const tv = tradeValues[i];
    if (tv === null) continue;

    const lagYr = String(parseInt(yr) - 1);
    const fx = fxAnnual.find(f => f.date === lagYr);
    const gdp = gdpData.find(g => g.date === yr);

    if (fx && gdp && gdp.value !== null) {
      y.push(tv);
      X.push([fx.value, gdp.value]);
      yearLabels.push(yr);
    }
  }

  if (y.length >= 3) {
    // Store y and yearLabels for use in onmessage handler
    worker._regressionActual = y;
    worker._regressionYears = yearLabels;
    worker.postMessage({ type: 'regression', y, X, labels: ['lag(USD/INR)', 'GDP_IND'] });
  } else {
    worker.terminate();
  }
}

// ── Start ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
