# Data Dictionary

## Canonical Tables

### trade_fact

| Field | Type | Description |
|-------|------|-------------|
| date | string | Period: YYYY (annual) or YYYY-MM (monthly) |
| frequency | enum | A = annual, M = monthly |
| reporter_iso3 | string(3) | ISO 3166-1 alpha-3 code of reporting country |
| partner_iso3 | string(3) | ISO 3166-1 alpha-3 code of partner country |
| flow | enum | IMPORT or EXPORT |
| product_level | enum | TOTAL, GROUP, HS2, HS4 |
| product_code | string | Product identifier (TOTAL, SITC group code, or HS code) |
| product_name | string | Human-readable product description |
| value_usd | number/null | Trade value in current US dollars. Null = missing. |
| unit | string | Always "USD" for this table |
| source_id | string | Source identifier (e.g. "wits:tradestats-trade", "comtrade") |
| retrieval_ts | string | ISO 8601 timestamp of data retrieval |
| request_fingerprint | string | URL or unique key for the request that produced this row |

### macro_fact

| Field | Type | Description |
|-------|------|-------------|
| date | string | Year: YYYY |
| country_iso3 | string(3) | ISO 3166-1 alpha-3 code |
| indicator_code | string | Indicator identifier (e.g. NY.GDP.MKTP.CD, FX_USD_INR) |
| indicator_name | string | Human-readable indicator name |
| value | number/null | Indicator value. Null = missing. |
| unit | string | Unit of measurement (e.g. "current USD", "%", "INR per USD") |
| source_id | string | Source identifier ("worldbank", "frankfurter") |
| retrieval_ts | string | ISO 8601 timestamp of data retrieval |
| request_fingerprint | string | URL or unique key for the request that produced this row |

## Data Catalog Entry

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique dataset identifier |
| source_id | string | Source system (wits, worldbank, frankfurter, comtrade) |
| retrieval_ts | string | ISO 8601 timestamp |
| request_url_or_file | string | Full request URL or local file path |
| sha256 | string | SHA-256 hash of raw response body |
| schema_version | string | Schema version at time of retrieval |
| coverage | string | Human-readable coverage description |
| notes | string | Additional notes |
| status | enum | "ok" or "failed" |
| error | string | Error message if status = "failed" |

## WITS Special Codes

| Code | Meaning |
|------|---------|
| 999 | Partner not applicable |
| 999999 | Product not applicable |

## Computed Metrics (Not stored; derived at runtime)

| Metric | Description |
|--------|-------------|
| YoY % | Year-over-year growth rate: (current - previous) / previous × 100 |
| CAGR | Compound annual growth rate over N years |
| HHI | Herfindahl-Hirschman Index (sum of squared shares × 10000) |
| Top-5 Share | Combined value share of top 5 product groups |
| Shannon Entropy | -Σ(share × log2(share)); higher = more diversified |
| Pearson r | Pearson correlation coefficient between two series |
