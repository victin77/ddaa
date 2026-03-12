import { IS_PRODUCTION } from './config.js';

export class HttpError extends Error {
  constructor(status, code, message = code, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = Number(err?.status) || 500;
  const code = err?.code || 'internal_error';
  const details = err?.details;

  console.error(`[http] ${req.method} ${req.originalUrl}`, err?.stack || err?.message || err);

  const payload = { error: code };
  if (details !== undefined) payload.details = details;
  if (!IS_PRODUCTION && status >= 500 && err?.message) payload.message = err.message;

  res.status(status).json(payload);
}
