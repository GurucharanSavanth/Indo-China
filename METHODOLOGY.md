# Methodology

## Data Pipeline

### 1. Data Acquisition
- **Live fetch**: On page load, the dashboard attempts to fetch live data from all configured APIs (WITS, World Bank, Frankfurter).
- **Snapshot fallback**: If live fetch fails (CORS, network, rate-limit), pre-shipped snapshot files in `assets/data/processed/` are used.
- **Retry policy**: Exponential backoff with jitter; max 3 retries; respects Retry-After headers.
- **WITS QueryPlanner**: Automatically chunks requests that violate WITS API limits (max 2 ALL dimensions; no ALL reporter + ALL partner).

### 2. Normalisation
- Raw API responses are normalised into two canonical tables: `trade_fact` and `macro_fact`.
- Field mapping handles variations in WITS JSON, World Bank JSON, and Frankfurter JSON response structures.
- Every row includes `source_id`, `retrieval_ts`, and `request_fingerprint` for full provenance.

### 3. Validation
- Schema validation against `trade_fact.schema.json` and `macro_fact.schema.json`.
- Invalid rows are logged and excluded from display; raw data is preserved.
- Schema drift (unexpected fields, missing required fields) triggers a UI banner.

### 4. Transformation
- **Aggregation**: Trade facts aggregated by year (sum of value_usd per year/flow).
- **YoY growth**: (current_year - previous_year) / previous_year × 100.
- **CAGR**: (end_value / start_value)^(1/years) - 1, expressed as %.
- **Trade balance**: Exports - Imports per year.
- **FX annualisation**: Daily FX rates averaged to annual for macro correlation.

## Missing Value Handling
- Missing values are preserved as `null` in all tables.
- Charts show gaps (not interpolated) for missing data points.
- No imputation is performed unless the user explicitly toggles it (not implemented in v1).

## Forecasting Models

**All forecast outputs are MODEL OUTPUTS, not observed facts.** They are labeled as such in the UI.

### Seasonal Naive + Trend
- Baseline: Use the value from the same season in the last cycle.
- Trend: Average year-over-year difference added per forecast step.
- Suitable for annual data with simple trend patterns.

### Holt-Winters (Additive)
- Triple exponential smoothing with level (α), trend (β), and seasonal (γ) components.
- Parameters: α=0.3, β=0.1, γ=0.2 (defaults; not optimised).
- Initialisation: Level = mean of first season; Trend = (mean of season 2 - mean of season 1) / season length.
- For annual data (period=1), reduces to double exponential smoothing.

### Explanatory Regression (OLS)
- Model: trade_value = β₀ + β₁ × lag(FX_rate) + β₂ × GDP + ε
- Lag: FX rate from the previous year (1-year lag).
- GDP: Reporter country GDP (current USD).
- Solved via Gaussian elimination (no external library).
- Coefficients, fitted values, and residuals reported.

### Diagnostics
- **Rolling train/test**: Last N observations held out; model trained on remainder.
- **RMSE**: Root Mean Squared Error of test predictions.
- **MAPE**: Mean Absolute Percentage Error of test predictions.
- **Residuals**: Raw residuals (actual - predicted) for visual inspection.

## Concentration Metrics

### Herfindahl-Hirschman Index (HHI)
- HHI = Σ(share_i²) × 10000, where share_i = value_i / total_value.
- Range: 0 (perfect diversification) to 10000 (single product).
- Values > 2500 indicate high concentration.

### Top-5 Share
- Sum of value shares of the 5 largest product groups, as %.

### Shannon Entropy
- H = -Σ(share_i × log₂(share_i))
- Higher entropy = more diversified portfolio.
- Maximum entropy = log₂(N) where N is the number of products.

## Correlation Analysis
- Pearson correlation coefficient between trade values and macro variables.
- Lag slider allows shifting macro variables by 0-5 years.
- **Caveat**: Correlation does not imply causation. These are exploratory statistics, not causal estimates.

## Limitations
1. WITS API response formats may vary; normalisation handles common shapes but schema drift is possible.
2. CORS restrictions prevent live fetch from some browser environments.
3. Frankfurter provides ECB reference rates (mid-market), not transaction rates.
4. Forecasts use simple models with default parameters — not production-grade.
5. Regression assumes linear relationships and may suffer from multicollinearity.
6. All trade values are in current (nominal) USD; no real-value deflation applied.
