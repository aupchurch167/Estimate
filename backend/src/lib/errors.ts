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
