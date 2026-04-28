/**
 * Pagination helper.
 *
 * Reads `page` and `limit` from a query-string object, sanitizes them
 * (defaults, clamps, ignores garbage), and returns Prisma-friendly
 * { skip, take } alongside the resolved page/pageSize.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function getPagination(query: Record<string, unknown> | undefined): Pagination {
  const rawPage = toPositiveInt(query?.page, 1);
  const rawSize = toPositiveInt(query?.limit ?? query?.pageSize, DEFAULT_PAGE_SIZE);
  const page = rawPage;
  const pageSize = Math.min(MAX_PAGE_SIZE, rawSize);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
