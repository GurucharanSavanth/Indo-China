// assets/services/errors.js
/**
 * Centralised error types and UI-mapping for the dashboard.
 */

export class AppError extends Error {
  constructor(message, { code, source, recoverable = false, uiMessage, retryable = false } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.source = source;
    this.recoverable = recoverable;
    this.uiMessage = uiMessage || message;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
  }
}

export class NetworkError extends AppError {
  constructor(message, opts = {}) {
    super(message, { code: 'NETWORK', recoverable: true, retryable: true, ...opts });
    this.name = 'NetworkError';
  }
}

export class CorsError extends AppError {
  constructor(source) {
    super(`CORS blocked for ${source}`, {
      code: 'CORS',
      source,
      recoverable: true,
      retryable: false,
      uiMessage: `Live refresh unavailable (CORS) for ${source}. Displaying pre-fetched WITS data.`,
    });
    this.name = 'CorsError';
  }
}

export class RateLimitError extends AppError {
  constructor(source, retryAfter) {
    super(`Rate limited by ${source}`, {
      code: 'RATE_LIMIT',
      source,
      recoverable: true,
      retryable: true,
      uiMessage: `Rate limited by ${source}. Retrying...`,
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends AppError {
  constructor(source, status) {
    super(`Server error ${status} from ${source}`, {
      code: 'SERVER_ERROR',
      source,
      recoverable: true,
      retryable: true,
      uiMessage: `Server error from ${source}. Retrying...`,
    });
    this.name = 'ServerError';
    this.status = status;
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(source) {
    super(`Payload too large from ${source}`, {
      code: 'PAYLOAD_TOO_LARGE',
      source,
      recoverable: true,
      retryable: false,
      uiMessage: `Request to ${source} returned too much data. Auto-chunking...`,
    });
    this.name = 'PayloadTooLargeError';
  }
}

export class SchemaValidationError extends AppError {
  constructor(datasetId, details) {
    super(`Schema validation failed for ${datasetId}`, {
      code: 'SCHEMA_DRIFT',
      source: datasetId,
      recoverable: true,
      retryable: false,
      uiMessage: `Data schema changed for ${datasetId}. Raw data stored; display may be limited.`,
    });
    this.name = 'SchemaValidationError';
    this.details = details;
  }
}

export class WitsLimitError extends AppError {
  constructor(detail) {
    super(`WITS request limit: ${detail}`, {
      code: 'WITS_LIMIT',
      source: 'wits',
      recoverable: true,
      retryable: false,
      uiMessage: 'WITS query too broad. Splitting into smaller requests...',
    });
    this.name = 'WitsLimitError';
  }
}

/**
 * Map an error to a UI banner config.
 */
export function errorToBanner(err) {
  if (err instanceof CorsError) return { level: 'warn', text: err.uiMessage, dismissible: true };
  if (err instanceof RateLimitError) return { level: 'info', text: err.uiMessage, dismissible: false };
  if (err instanceof ServerError) return { level: 'warn', text: err.uiMessage, dismissible: true };
  if (err instanceof NetworkError) return { level: 'error', text: 'You appear to be offline. Showing pre-fetched WITS data.', dismissible: true };
  if (err instanceof SchemaValidationError) return { level: 'warn', text: err.uiMessage, dismissible: true };
  if (err instanceof PayloadTooLargeError) return { level: 'info', text: err.uiMessage, dismissible: true };
  return { level: 'error', text: err.message || 'An unexpected error occurred.', dismissible: true };
}

/** Global error log (in-memory, capped). */
const _log = [];
const MAX_LOG = 200;

export function logError(err) {
  _log.push({ ts: new Date().toISOString(), name: err.name, message: err.message, code: err.code });
  if (_log.length > MAX_LOG) _log.shift();
  console.error(`[${err.name}]`, err.message);
}

export function getErrorLog() {
  return [..._log];
}
