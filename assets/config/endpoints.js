// assets/config/endpoints.js
/**
 * Canonical API endpoint definitions.
 * Every URL used in the application MUST be defined here.
 *
 * References:
 *  - WITS API intro + limits: https://wits.worldbank.org/witsapiintro.aspx?lang=en
 *  - WITS API User Guide PDF: https://wits.worldbank.org/data/public/WITSAPI_UserGuide.pdf
 *  - World Bank Indicators V2: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
 *  - Indicator Queries: https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries
 *  - About V2: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
 *  - Frankfurter: https://frankfurter.dev/
 *  - UN Comtrade developer portal: https://comtradedeveloper.un.org/
 *  - UN Comtrade reference codes: https://comtradeplus.un.org/ListOfReferences
 */

export const WITS = Object.freeze({
  BASE: 'https://wits.worldbank.org/API/V1/SDMX/V21',

  // Metadata (SDMX 2.1 XML)
  META: {
    DATAFLOW: 'https://wits.worldbank.org/API/V1/SDMX/V21/rest/dataflow/wbg_wits/',
    CODELISTS: 'https://wits.worldbank.org/API/V1/SDMX/V21/rest/codelist/all',
    DSD_TRADESTATS: 'https://wits.worldbank.org/API/V1/SDMX/V21/rest/datastructure/WBG_WITS/TRADESTATS/',
    DSD_TARIFF_TRAINS: 'https://wits.worldbank.org/API/V1/SDMX/V21/rest/datastructure/WBG_WITS/TARIFF_TRAINS/',
  },

  // Data — URL-based JSON endpoints
  DATA: {
    /**
     * Build a WITS URL-based data URL.
     * datasource: tradestats-trade | tradestats-tariff | tradestats-development
     */
    json(datasource, { reporter = 'all', year = 'all', partner = 'all', product = 'all', indicator = 'all' } = {}) {
      return `${WITS.BASE}/datasource/${datasource}/reporter/${reporter}/year/${year}/partner/${partner}/product/${product}/indicator/${indicator}?format=JSON`;
    },

    /**
     * SDMX data endpoint (XML fallback).
     * dataflow: df_wits_tradestats_trade | df_wits_tradestats_tariff | df_wits_tradestats_development
     */
    sdmx(dataflow, { freq = 'A', reporter = '', partner = '', productCode = '', indicator = '', startPeriod, endPeriod, detail = 'Full' } = {}) {
      const key = [freq, reporter, partner, productCode, indicator].join('.');
      let url = `${WITS.BASE}/rest/data/${dataflow}/${key}/`;
      const params = new URLSearchParams();
      if (startPeriod) params.set('startPeriod', startPeriod);
      if (endPeriod) params.set('endPeriod', endPeriod);
      params.set('detail', detail);
      return `${url}?${params.toString()}`;
    },
  },

  // Special dimension codes
  CODES: {
    PARTNER_NOT_APPLICABLE: '999',
    PRODUCT_NOT_APPLICABLE: '999999',
  },

  // Request limits
  LIMITS: {
    MAX_ALL_DIMENSIONS: 2,
    FORBIDDEN_COMBOS: [['reporter', 'partner']], // both ALL not allowed
  },
});

export const WORLDBANK = Object.freeze({
  BASE: 'https://api.worldbank.org/v2',

  /**
   * Build a World Bank Indicators URL.
   * Always requests JSON. Supports pagination and date ranges.
   */
  indicator(countryCode, indicatorCode, { date, perPage = 500, page = 1 } = {}) {
    const params = new URLSearchParams({ format: 'json', per_page: String(perPage), page: String(page) });
    if (date) params.set('date', date);
    return `${WORLDBANK.BASE}/country/${countryCode}/indicator/${indicatorCode}?${params.toString()}`;
  },

  INDICATORS: {
    GDP_CURRENT_USD: 'NY.GDP.MKTP.CD',
    GDP_GROWTH: 'NY.GDP.MKTP.KD.ZG',
    TRADE_PCT_GDP: 'NE.TRD.GNFS.ZS',
    INFLATION_CPI: 'FP.CPI.TOTL.ZG',
  },
});

export const FRANKFURTER = Object.freeze({
  BASE: 'https://api.frankfurter.dev',

  latest(base = 'USD', symbols = 'INR,CNY') {
    return `${FRANKFURTER.BASE}/v1/latest?base=${base}&symbols=${symbols}`;
  },

  historical(dateStr, base = 'USD', symbols = 'INR,CNY') {
    return `${FRANKFURTER.BASE}/v1/${dateStr}?base=${base}&symbols=${symbols}`;
  },

  series(startDate, endDate, base = 'USD', symbols = 'INR,CNY') {
    return `${FRANKFURTER.BASE}/v1/${startDate}..${endDate}?base=${base}&symbols=${symbols}`;
  },
});

export const COMTRADE = Object.freeze({
  DEFAULT_BASE: 'https://comtradeapi.un.org',

  data(baseUrl, { reporterCode, partnerCode, period, cmdCode = 'TOTAL', flowCode, includeDesc = true } = {}) {
    const params = new URLSearchParams({
      reporterCode: String(reporterCode),
      partnerCode: String(partnerCode),
      period: String(period),
      cmdCode,
      flowCode,
      includeDesc: String(includeDesc),
    });
    return `${baseUrl}/data/v1/get/C/A/HS?${params.toString()}`;
  },
});
