// assets/services/validators.js
/**
 * Schema validation for canonical data models.
 * Validates against JSON schemas at runtime.
 */

import { SchemaValidationError, logError } from './errors.js';

// Inline schema rules (mirrors the JSON schema files)
const TRADE_FACT_REQUIRED = ['date','frequency','reporter_iso3','partner_iso3','flow','product_level','product_code','value_usd','source_id','retrieval_ts','request_fingerprint'];
const MACRO_FACT_REQUIRED = ['date','country_iso3','indicator_code','indicator_name','value','unit','source_id','retrieval_ts','request_fingerprint'];

const VALID_FREQUENCIES = ['A','M'];
const VALID_FLOWS = ['IMPORT','EXPORT'];
const VALID_PRODUCT_LEVELS = ['TOTAL','GROUP','HS2','HS4'];

/**
 * Validate a trade_fact row. Returns { valid, errors }.
 */
export function validateTradeFact(row) {
  const errors = [];
  for (const field of TRADE_FACT_REQUIRED) {
    if (row[field] === undefined || row[field] === '') {
      // value_usd can be null
      if (field === 'value_usd' && row[field] === null) continue;
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (row.frequency && !VALID_FREQUENCIES.includes(row.frequency)) {
    errors.push(`Invalid frequency: ${row.frequency}`);
  }
  if (row.flow && !VALID_FLOWS.includes(row.flow)) {
    errors.push(`Invalid flow: ${row.flow}`);
  }
  if (row.product_level && !VALID_PRODUCT_LEVELS.includes(row.product_level)) {
    errors.push(`Invalid product_level: ${row.product_level}`);
  }
  if (row.reporter_iso3 && row.reporter_iso3.length !== 3) {
    errors.push(`reporter_iso3 must be 3 chars: ${row.reporter_iso3}`);
  }
  if (row.partner_iso3 && row.partner_iso3.length !== 3) {
    errors.push(`partner_iso3 must be 3 chars: ${row.partner_iso3}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a macro_fact row. Returns { valid, errors }.
 */
export function validateMacroFact(row) {
  const errors = [];
  for (const field of MACRO_FACT_REQUIRED) {
    if (row[field] === undefined || row[field] === '') {
      if (field === 'value' && row[field] === null) continue;
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (row.country_iso3 && row.country_iso3.length !== 3) {
    errors.push(`country_iso3 must be 3 chars: ${row.country_iso3}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of rows, returning valid rows and logging invalid ones.
 */
export function validateBatch(rows, type = 'trade_fact') {
  const validator = type === 'trade_fact' ? validateTradeFact : validateMacroFact;
  const valid = [];
  const invalid = [];

  for (const row of rows) {
    const result = validator(row);
    if (result.valid) {
      valid.push(row);
    } else {
      invalid.push({ row, errors: result.errors });
    }
  }

  if (invalid.length > 0) {
    const err = new SchemaValidationError(type, { count: invalid.length, sample: invalid.slice(0, 3) });
    logError(err);
  }

  return { valid, invalid, totalValid: valid.length, totalInvalid: invalid.length };
}
