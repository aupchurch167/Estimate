import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type {
  ImportResult,
  PaginatedEntries,
  PriceBook,
  PriceBookCategory,
  PriceBookEntry,
  UnitOfMeasure,
} from './types';

export const PRICE_BOOKS_KEY = ['price-books'] as const;
const categoriesKey = (priceBookId: string) =>
  ['price-books', priceBookId, 'categories'] as const;
const entriesKey = (
  priceBookId: string,
  args: { search?: string; categoryId?: string; page: number; pageSize: number },
) => ['price-books', priceBookId, 'entries', args] as const;

export function usePriceBooks() {
  return useQuery<PriceBook[], AxiosError>({
    queryKey: PRICE_BOOKS_KEY,
    queryFn: async () => {
      const res = await api.get<{ priceBooks: PriceBook[] }>('/api/price-books');
      return res.data.priceBooks;
    },
  });
}

export function useCategories(priceBookId: string | undefined) {
  return useQuery<PriceBookCategory[], AxiosError>({
    queryKey: priceBookId ? categoriesKey(priceBookId) : ['price-books', '_', 'categories'],
    queryFn: async () => {
      const res = await api.get<{ categories: PriceBookCategory[] }>(
        `/api/price-books/${priceBookId}/categories`,
      );
      return res.data.categories;
    },
    enabled: Boolean(priceBookId),
  });
}

export interface EntriesQueryArgs {
  search?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export function useEntries(priceBookId: string | undefined, args: EntriesQueryArgs = {}) {
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 50;
  return useQuery<PaginatedEntries, AxiosError>({
    queryKey: priceBookId
      ? entriesKey(priceBookId, {
          search: args.search,
          categoryId: args.categoryId,
          page,
          pageSize,
        })
      : ['price-books', '_', 'entries'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (args.search) params.set('search', args.search);
      if (args.categoryId) params.set('category', args.categoryId);
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      const res = await api.get<PaginatedEntries>(
        `/api/price-books/${priceBookId}/entries?${params.toString()}`,
      );
      return res.data;
    },
    enabled: Boolean(priceBookId),
    placeholderData: (prev) => prev,
  });
}

export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Mutations ────────────────────────────────────────────────────────────

export interface CreateCategoryInput {
  name: string;
  defaultMarkupPercent?: string | null;
  csiDivision?: string | null;
}

export function useCreateCategory(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<PriceBookCategory, AxiosError, CreateCategoryInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ category: PriceBookCategory }>(
        `/api/price-books/${priceBookId}/categories`,
        input,
      );
      return res.data.category;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) }),
  });
}

export function useUpdateCategory(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<
    PriceBookCategory,
    AxiosError,
    { id: string; patch: Partial<CreateCategoryInput> & { order?: number } }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await api.patch<{ category: PriceBookCategory }>(
        `/api/categories/${id}`,
        patch,
      );
      return res.data.category;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) }),
  });
}

export function useDeleteCategory(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, { id: string; force?: boolean }>({
    mutationFn: async ({ id, force }) => {
      const url = force ? `/api/categories/${id}?force=true` : `/api/categories/${id}`;
      await api.delete(url);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) });
      qc.invalidateQueries({ queryKey: ['price-books', priceBookId, 'entries'] });
    },
  });
}

export interface EntryInput {
  categoryId: string;
  code?: string | null;
  description: string;
  longDescription?: string | null;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  defaultMarkupPercent?: string | null;
  aiKeywords?: string | null;
}

export function useCreateEntry(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<PriceBookEntry, AxiosError, EntryInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ entry: PriceBookEntry }>(
        `/api/price-books/${priceBookId}/entries`,
        input,
      );
      return res.data.entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-books', priceBookId, 'entries'] });
      qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) });
    },
  });
}

export function useUpdateEntry(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<
    PriceBookEntry,
    AxiosError,
    { id: string; patch: Partial<EntryInput> & { isActive?: boolean } }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await api.patch<{ entry: PriceBookEntry }>(`/api/entries/${id}`, patch);
      return res.data.entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-books', priceBookId, 'entries'] });
    },
  });
}

export function useDeleteEntry(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await api.delete(`/api/entries/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-books', priceBookId, 'entries'] });
      qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) });
    },
  });
}

// ─── CSV import ────────────────────────────────────────────────────────────

export function useCsvImport(priceBookId: string) {
  const qc = useQueryClient();
  return useMutation<ImportResult, AxiosError, { file: File; dryRun: boolean }>({
    mutationFn: async ({ file, dryRun }) => {
      const fd = new FormData();
      fd.append('file', file);
      const url = `/api/price-books/${priceBookId}/import${dryRun ? '?dryRun=true' : ''}`;
      const res = await api.post<ImportResult>(url, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (result) => {
      if (result.committed) {
        qc.invalidateQueries({ queryKey: ['price-books', priceBookId, 'entries'] });
        qc.invalidateQueries({ queryKey: categoriesKey(priceBookId) });
      }
    },
  });
}
