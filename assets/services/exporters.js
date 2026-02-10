// assets/services/exporters.js
/**
 * Export utilities: CSV download, chart image export.
 */

/**
 * Convert an array of objects to CSV string.
 */
export function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]);
  const header = cols.join(',');
  const body = rows.map(row =>
    cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      const s = String(v);
      // Quote if contains comma, newline, or quote
      if (s.includes(',') || s.includes('\n') || s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
  return header + '\n' + body;
}

/**
 * Trigger browser download of a string as a file.
 */
export function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download filtered dataset as CSV.
 */
export function exportDatasetCSV(rows, filename = 'trade_data.csv') {
  const csv = toCSV(rows);
  downloadFile(csv, filename);
}

/**
 * Export an ECharts instance as PNG.
 * @param {object} chartInstance - ECharts instance
 * @param {string} filename
 */
export function exportChartPNG(chartInstance, filename = 'chart.png') {
  if (!chartInstance) return;
  const url = chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export an ECharts instance as SVG.
 */
export function exportChartSVG(chartInstance, filename = 'chart.svg') {
  if (!chartInstance) return;
  const url = chartInstance.getDataURL({ type: 'svg' });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
