# India–China Trade Modeling & Dashboard

A browser-only (static) dashboard for analysing India–China bilateral trade using free, public data from the World Bank, WITS, and Frankfurter FX APIs.

## Quick Start

Serve the project directory with any static HTTP server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .

# PHP
php -S localhost:8000
```

Open `http://localhost:8000` in a browser.

## Features

- **Overview**: KPIs (exports, imports, balance, YoY%, CAGR), annual trade bar charts
- **Composition**: Product group treemap, concentration metrics (HHI, Top-5 share, entropy)
- **Tariffs**: WITS tariff indicators (if available from API)
- **Macro**: GDP series, USD/INR and USD/CNY exchange rates, correlation explorer with lag slider
- **Forecast**: Seasonal naive, Holt-Winters, and OLS regression (labeled as model outputs)
- **Methods**: Full methodology and source documentation

## Data Sources

| Source | Data | Auth | Status |
|--------|------|------|--------|
| WITS TradeStats | Bilateral trade flows | None | Mandatory |
| World Bank V2 | GDP, macro indicators | None | Mandatory |
| Frankfurter | USD/INR, USD/CNY rates | None | Mandatory |
| UN Comtrade | HS-level products | API key | Optional (disabled) |

See [SOURCES.md](SOURCES.md) for full API documentation links.

## File Structure

```
/index.html
/assets/
  styles.css
  app.js                    # Entry point
  router.js                 # Hash-based SPA router
  state.js                  # Centralised state + pub/sub
  ui.js                     # DOM rendering
  charts.js                 # ECharts chart rendering
  workers/
    etl.worker.js           # ETL web worker
    model.worker.js         # Forecasting web worker
  services/
    errors.js               # Error types + UI mapping
    telemetry.js             # Client-side event tracking
    cache.js                # In-memory + sessionStorage cache
    fetchers.js             # Fetch wrapper with retry/backoff
    wits.js                 # WITS API client + QueryPlanner
    worldbank.js            # World Bank Indicators client
    fx.js                   # Frankfurter FX client
    comtrade.js             # UN Comtrade client (optional)
    validators.js           # Schema validation
    transformers.js         # Data transformation utilities
    modeling.js             # Statistical models
    exporters.js            # CSV/PNG/SVG export
  config/
    endpoints.js            # All API endpoint definitions
    featureFlags.js         # Feature flag system
    local.example.js        # Local config template
  data/
    data_catalog.json       # Dataset catalog
    schema_version.json     # Schema version tracking
    raw/                    # Raw API responses (populated at runtime)
    processed/              # Normalised snapshot datasets
    schemas/                # JSON schemas
/SOURCES.md
/DATA_DICTIONARY.md
/METHODOLOGY.md
/README.md
```

## Configuration

Copy `assets/config/local.example.js` to `assets/config/local.js` and customise:

```js
export default {
  comtrade: {
    enabled: true,
    apiKey: 'your-key-here',
  },
  liveRefresh: true,
  maxRetries: 3,
};
```

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Offline | Snapshot data; banner |
| CORS blocked | Snapshot fallback; "Live refresh unavailable" banner |
| 429 rate limit | Exponential backoff with jitter; respects Retry-After |
| 5xx server error | Retry (max 3); then snapshot fallback |
| Payload too large | Auto-chunk via WITS QueryPlanner |
| Schema drift | Raw data stored; display limited; banner |
| Missing values | Gaps preserved; no imputation |

## Export

- **CSV**: Click "Export CSV" in the filter bar to download current filtered dataset.
- **PNG/SVG**: Click PNG/SVG buttons on chart headers.

## Technology

- **Charts**: ECharts 5.x (CDN)
- **No build step**: Pure ES modules, runs directly in browser
- **No backend**: Fully static; all API calls from browser
