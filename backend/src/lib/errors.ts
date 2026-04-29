/**
 * Custom error classes used throughout the backend.
 *
 * Throw these from services and routes; the global error handler
 * (middleware/errorHandler.ts) catches `AppError` instances and renders
 * the standard envelope `{ error: { code, message, details? } }`. Anything
 * else gets logged and returned as a generic 500.
 */

export type ErrorDetails = Record<string, unknown>;

export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public readonly details?: ErrorDetails;

  constructor(message: string, details?: ErrorDetails) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly code = 'validation_error';
}

export class AuthError extends AppError {
  public readonly statusCode = 401;
  public readonly code: string;

  constructor(message = 'Not authenticated', code = 'not_authenticated', details?: ErrorDetails) {
    super(message, details);
    this.code = code;
  }
}

export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly code = 'forbidden';

  constructor(message = 'Forbidden', details?: ErrorDetails) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly code = 'not_found';

  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, {
      resource,
      ...(id !== undefined ? { id } : {}),
    });
  }
}

export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code: string;

  constructor(message: string, code = 'conflict', details?: ErrorDetails) {
    super(message, details);
    this.code = code;
  }
}

/**
 * The Anthropic API (or any other AI provider) returned an error we
 * mapped to a known cause. We render these as 502 so the client knows
 * it's an upstream-dependency problem, not a request problem on their
 * side. Specific causes are surfaced via `code` so the UI can render
 * targeted copy ("AI key invalid — admin needs to update it", etc.).
 */
export class AiUpstreamError extends AppError {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    statusCode = 502,
    details?: ErrorDetails,
  ) {
    super(message, details);
    this.code = code;
    this.statusCode = statusCode;
  }
}
