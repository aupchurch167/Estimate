/**
 * Standard JSON response shapes.
 *
 * Routes return these so the API surface is uniform: success bodies are the
 * raw data (or `{ data, total, page, pageSize, totalPages }` for paginated
 * lists). Error bodies use the `{ error: { code, message, details? } }`
 * envelope assembled by the global error handler.
 */

import type { Response } from 'express';

export function ok<T>(res: Response, data: T): Response {
  return res.status(200).json(data);
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json(data);
}

export interface PaginatedBody<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Response {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const body: PaginatedBody<T> = { data, total, page, pageSize, totalPages };
  return res.status(200).json(body);
}
