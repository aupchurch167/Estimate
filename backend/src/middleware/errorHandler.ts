/**
 * Global Express error handler.
 *
 * - AppError subclasses → use their statusCode/code/message/details
 * - Anything else       → log it, return a generic 500 with code "internal_error"
 *
 * Mounted last in src/index.ts. Never throws — if formatting fails it falls
 * back to a plain text 500.
 */

import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  try {
    if (err instanceof AppError) {
      const body: ErrorBody = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      };
      res.status(err.statusCode).json(body);
      return;
    }

    logger.error({ err }, 'unhandled error');

    const body: ErrorBody = {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    };
    res.status(500).json(body);
  } catch (formatErr) {
    logger.error({ err: formatErr }, 'error handler failed to format response');
    res.status(500).type('text/plain').send('Internal error');
  }
};
