# Data Sources

## Primary Sources (Mandatory)

### 1. WITS — World Integrated Trade Solution (World Bank)
- **API Introduction & Limits**: https://wits.worldbank.org/witsapiintro.aspx?lang=en
- **API User Guide (PDF)**: https://wits.worldbank.org/data/public/WITSAPI_UserGuide.pdf
- **Coverage**: Bilateral trade flows, tariff indicators, product composition
- **Format**: JSON (URL-based endpoints) and SDMX 2.1 XML (metadata)
- **Limitations**: Max 2 dimensions as ALL; reporter=ALL + partner=ALL not permitted

### 2. World Bank Indicators API (V2)
- **Basic Call Structures**: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
- **Indicator Queries**: https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries
- **About V2**: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
- **Coverage**: GDP (current USD), GDP growth, trade % of GDP, inflation
- **Indicators used**:
  - NY.GDP.MKTP.CD — GDP (current US$)
  - NY.GDP.MKTP.KD.ZG — GDP growth (annual %)
  - NE.TRD.GNFS.ZS — Trade (% of GDP)
  - FP.CPI.TOTL.ZG — Inflation, consumer prices (annual %)

### 3. Frankfurter FX API
- **Documentation**: https://frankfurter.dev/
- **API Base**: https://api.frankfurter.dev
- **Coverage**: ECB reference exchange rates, updated daily ~16:00 CET
- **Currencies**: USD/INR, USD/CNY
- **Note**: Keyless, browser-friendly, no authentication required

## Optional Sources (Feature-Flagged)

### 4. UN Comtrade
- **Developer Portal**: https://comtradedeveloper.un.org/
- **Reference Codes**: https://comtradeplus.un.org/ListOfReferences
- **Coverage**: HS-level bilateral trade (HS2/HS4 product detail)
- **Status**: Disabled by default. May require API key and is subject to CORS/quota restrictions.
- **Enable**: Set `comtrade.enabled = true` in `assets/config/local.js`
