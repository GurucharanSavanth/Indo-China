// assets/charts.js
/**
 * ECharts chart rendering for all dashboard pages.
 * Each function creates/updates an ECharts instance on a DOM element.
 */

import { exportChartPNG, exportChartSVG } from './services/exporters.js';

const _instances = new Map();

function getOrCreate(domId) {
  const dom = document.getElementById(domId);
  if (!dom) return null;
  if (_instances.has(domId)) {
    const inst = _instances.get(domId);
    inst.resize();
    return inst;
  }
  /* global echarts */
  const inst = echarts.init(dom, null, { renderer: 'canvas' });
  _instances.set(domId, inst);
  return inst;
}

function disposeAll() {
  for (const [id, inst] of _instances) {
    inst.dispose();
  }
  _instances.clear();
}

// ── Resize handler ───────────────────────────────────────────
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    for (const inst of _instances.values()) inst.resize();
  }, 200);
});

// ── Export button wiring ─────────────────────────────────────
export function wireExportButtons() {
  document.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const chartId = btn.dataset.export;
      const fmt = btn.dataset.fmt;
      const inst = _instances.get(chartId);
      if (!inst) return;
      if (fmt === 'svg') exportChartSVG(inst, `${chartId}.svg`);
      else exportChartPNG(inst, `${chartId}.png`);
    });
  });
}

// ── Overview: annual trade flow ──────────────────────────────
export function renderOverviewChart(yearlyData) {
  const chart = getOrCreate('overview-chart');
  if (!chart) return;

  const years = [...new Set(yearlyData.map(d => d.date))].sort();
  const exports = years.map(y => {
    const r = yearlyData.find(d => d.date === y && d.flow === 'EXPORT');
    return r ? r.value_usd : null;
  });
  const imports = years.map(y => {
    const r = yearlyData.find(d => d.date === y && d.flow === 'IMPORT');
    return r ? r.value_usd : null;
  });

  chart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: v => v !== null ? '$' + (v / 1e9).toFixed(2) + 'B' : 'N/A' },
    legend: { data: ['Exports', 'Imports'] },
    grid: { left: 80, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value', name: 'USD', axisLabel: { formatter: v => (v / 1e9).toFixed(0) + 'B' } },
    series: [
      { name: 'Exports', type: 'bar', data: exports, itemStyle: { color: '#2563eb' } },
      { name: 'Imports', type: 'bar', data: imports, itemStyle: { color: '#dc2626' } },
    ],
  }, true);
}

// ── Overview: trade balance ──────────────────────────────────
export function renderBalanceChart(balanceData) {
  const chart = getOrCreate('balance-chart');
  if (!chart) return;

  const years = balanceData.map(d => d.date);
  const balance = balanceData.map(d => d.balance);

  chart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: v => '$' + (v / 1e9).toFixed(2) + 'B' },
    grid: { left: 80, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value', name: 'USD', axisLabel: { formatter: v => (v / 1e9).toFixed(0) + 'B' } },
    series: [{
      name: 'Balance',
      type: 'bar',
      data: balance.map(v => ({
        value: v,
        itemStyle: { color: v >= 0 ? '#16a34a' : '#dc2626' },
      })),
    }],
  }, true);
}

// ── Composition: treemap ─────────────────────────────────────
export function renderCompositionTreemap(productData) {
  const chart = getOrCreate('comp-treemap');
  if (!chart) return;

  if (!productData || productData.length === 0) {
    chart.setOption({
      title: { text: 'No composition data available', left: 'center', top: 'center', textStyle: { color: '#999' } },
      series: [],
    }, true);
    return;
  }

  const treeData = productData.map(p => ({
    name: p.product_name || p.product_code,
    value: p.value_usd || 0,
  })).filter(d => d.value > 0);

  chart.setOption({
    tooltip: { formatter: info => `${info.name}: $${(info.value / 1e6).toFixed(1)}M` },
    series: [{
      type: 'treemap',
      data: treeData,
      label: { show: true, formatter: '{b}' },
      breadcrumb: { show: false },
    }],
  }, true);
}

// ── Composition: rank shift (bump chart) ─────────────────────
export function renderRankShiftChart(rankData) {
  const chart = getOrCreate('comp-rank');
  if (!chart) return;

  if (!rankData || rankData.length === 0) {
    chart.setOption({
      title: { text: 'No rank shift data available', left: 'center', top: 'center', textStyle: { color: '#999' } },
      series: [],
    }, true);
    return;
  }

  // rankData: array of { product_name, rankings: [{year, rank}] }
  const years = [...new Set(rankData.flatMap(d => d.rankings.map(r => r.year)))].sort();
  const series = rankData.map(d => ({
    name: d.product_name,
    type: 'line',
    data: years.map(y => {
      const r = d.rankings.find(rr => rr.year === y);
      return r ? r.rank : null;
    }),
    smooth: true,
  }));

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 50, right: 30, bottom: 60, top: 30 },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value', name: 'Rank', inverse: true, min: 1 },
    series,
  }, true);
}

// ── Tariffs chart ────────────────────────────────────────────
export function renderTariffChart(tariffData) {
  const chart = getOrCreate('tariff-chart');
  if (!chart) return;

  if (!tariffData || tariffData.length === 0) {
    chart.setOption({
      title: { text: 'Not available from configured sources', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } },
      series: [],
    }, true);
    document.getElementById('tariff-status')?.insertAdjacentHTML('beforeend',
      '<p class="info-box">Tariff indicators are not available from the configured sources. Enable live refresh or provide tariff data manually.</p>');
    return;
  }

  // Generic indicator line chart
  const years = [...new Set(tariffData.map(d => d.date))].sort();
  const indicators = [...new Set(tariffData.map(d => d.indicator_name))];
  const series = indicators.map(ind => ({
    name: ind,
    type: 'line',
    data: years.map(y => {
      const r = tariffData.find(d => d.date === y && d.indicator_name === ind);
      return r ? r.value : null;
    }),
    connectNulls: true,
  }));

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 60, right: 30, bottom: 60 },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value', name: '%' },
    series,
  }, true);
}

// ── GDP chart ────────────────────────────────────────────────
export function renderGDPChart(macroData) {
  const chart = getOrCreate('gdp-chart');
  if (!chart) return;

  const indGDP = macroData.filter(d => d.country_iso3 === 'IND' && d.indicator_code === 'NY.GDP.MKTP.CD')
    .sort((a, b) => a.date.localeCompare(b.date));
  const chnGDP = macroData.filter(d => d.country_iso3 === 'CHN' && d.indicator_code === 'NY.GDP.MKTP.CD')
    .sort((a, b) => a.date.localeCompare(b.date));

  const years = [...new Set([...indGDP.map(d => d.date), ...chnGDP.map(d => d.date)])].sort();

  if (years.length === 0) {
    chart.setOption({
      title: { text: 'No GDP data available. Attempting live fetch...', left: 'center', top: 'center', textStyle: { color: '#999' } },
      series: [],
    }, true);
    return;
  }

  chart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: v => v !== null ? '$' + (v / 1e12).toFixed(2) + 'T' : 'N/A' },
    legend: { data: ['India GDP', 'China GDP'] },
    grid: { left: 80, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value', name: 'USD', axisLabel: { formatter: v => (v / 1e12).toFixed(1) + 'T' } },
    series: [
      {
        name: 'India GDP', type: 'line', smooth: true,
        data: years.map(y => { const r = indGDP.find(d => d.date === y); return r ? r.value : null; }),
        itemStyle: { color: '#f97316' },
      },
      {
        name: 'China GDP', type: 'line', smooth: true,
        data: years.map(y => { const r = chnGDP.find(d => d.date === y); return r ? r.value : null; }),
        itemStyle: { color: '#dc2626' },
      },
    ],
  }, true);
}

// ── FX chart ─────────────────────────────────────────────────
export function renderFXChart(fxData) {
  const chart = getOrCreate('fx-chart');
  if (!chart) return;

  const inr = fxData.filter(d => d.indicator_code === 'FX_USD_INR').sort((a, b) => a.date.localeCompare(b.date));
  const cny = fxData.filter(d => d.indicator_code === 'FX_USD_CNY').sort((a, b) => a.date.localeCompare(b.date));

  const dates = [...new Set([...inr.map(d => d.date), ...cny.map(d => d.date)])].sort();

  if (dates.length === 0) {
    chart.setOption({
      title: { text: 'No FX data available. Attempting live fetch...', left: 'center', top: 'center', textStyle: { color: '#999' } },
      series: [],
    }, true);
    return;
  }

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['USD/INR', 'USD/CNY'] },
    grid: { left: 60, right: 60, bottom: 40 },
    xAxis: { type: 'category', data: dates },
    yAxis: [
      { type: 'value', name: 'INR', position: 'left' },
      { type: 'value', name: 'CNY', position: 'right' },
    ],
    series: [
      {
        name: 'USD/INR', type: 'line', yAxisIndex: 0,
        data: dates.map(d => { const r = inr.find(x => x.date === d); return r ? r.value : null; }),
        itemStyle: { color: '#f97316' },
      },
      {
        name: 'USD/CNY', type: 'line', yAxisIndex: 1,
        data: dates.map(d => { const r = cny.find(x => x.date === d); return r ? r.value : null; }),
        itemStyle: { color: '#dc2626' },
      },
    ],
  }, true);
}

// ── Correlation scatter ──────────────────────────────────────
export function renderCorrelationChart(xData, yData, xLabel, yLabel) {
  const chart = getOrCreate('corr-chart');
  if (!chart) return;

  const pairs = [];
  for (let i = 0; i < Math.min(xData.length, yData.length); i++) {
    if (xData[i] !== null && yData[i] !== null) {
      pairs.push([xData[i], yData[i]]);
    }
  }

  chart.setOption({
    tooltip: { formatter: p => `${xLabel}: ${p.value[0].toFixed(2)}<br>${yLabel}: ${p.value[1].toFixed(2)}` },
    xAxis: { type: 'value', name: xLabel },
    yAxis: { type: 'value', name: yLabel },
    series: [{
      type: 'scatter',
      data: pairs,
      symbolSize: 10,
      itemStyle: { color: '#6366f1' },
    }],
  }, true);
}

// ── Forecast chart ───────────────────────────────────────────
export function renderForecastChart(historical, naiveForecast, hwForecast, labels) {
  const chart = getOrCreate('forecast-chart');
  if (!chart) return;

  const histLabels = labels.slice(0, historical.length);
  const fcLabels = labels.slice(historical.length);
  const allLabels = [...histLabels, ...fcLabels];

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['Historical', 'Seasonal Naive (Model)', 'Holt-Winters (Model)'] },
    grid: { left: 80, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: allLabels },
    yAxis: { type: 'value', name: 'USD', axisLabel: { formatter: v => (v / 1e9).toFixed(1) + 'B' } },
    series: [
      {
        name: 'Historical', type: 'line',
        data: [...historical, ...new Array(fcLabels.length).fill(null)],
        itemStyle: { color: '#2563eb' },
      },
      {
        name: 'Seasonal Naive (Model)', type: 'line', lineStyle: { type: 'dashed' },
        data: [...new Array(histLabels.length).fill(null), ...naiveForecast],
        itemStyle: { color: '#16a34a' },
      },
      {
        name: 'Holt-Winters (Model)', type: 'line', lineStyle: { type: 'dashed' },
        data: [...new Array(histLabels.length).fill(null), ...hwForecast],
        itemStyle: { color: '#f97316' },
      },
    ],
    markArea: {
      data: fcLabels.length > 0 ? [[
        { xAxis: fcLabels[0], itemStyle: { color: 'rgba(0,0,0,0.04)' } },
        { xAxis: fcLabels[fcLabels.length - 1] },
      ]] : [],
    },
  }, true);
}

// ── Regression chart ─────────────────────────────────────────
export function renderRegressionChart(actual, fitted, labels) {
  const chart = getOrCreate('regression-chart');
  if (!chart) return;

  chart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: v => v !== null ? '$' + (v / 1e9).toFixed(2) + 'B' : 'N/A' },
    legend: { data: ['Actual', 'Fitted (Model)'] },
    grid: { left: 80, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value', name: 'USD', axisLabel: { formatter: v => (v / 1e9).toFixed(1) + 'B' } },
    series: [
      { name: 'Actual', type: 'line', data: actual, itemStyle: { color: '#2563eb' } },
      { name: 'Fitted (Model)', type: 'line', data: fitted, lineStyle: { type: 'dashed' }, itemStyle: { color: '#f97316' } },
    ],
  }, true);
}

export { disposeAll };
