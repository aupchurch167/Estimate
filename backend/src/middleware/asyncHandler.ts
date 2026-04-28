/**
 * Wraps an async Express handler so rejected promises propagate to the
 * global error middleware via `next(err)`. Express 4 doesn't auto-forward
 * async errors otherwise.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
