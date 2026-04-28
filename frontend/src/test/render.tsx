/**
 * Test render helper: wraps a UI in QueryClientProvider + MemoryRouter so
 * components depending on TanStack Query and react-router work in isolation.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

interface Options {
  initialEntries?: string[];
  routes?: { path: string; element: ReactElement }[];
}

export function renderWithProviders(ui: ReactElement, options: Options = {}, rtlOptions?: RenderOptions) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
          <Routes>
            <Route path="/" element={ui} />
            {options.routes?.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
      rtlOptions,
    ),
  };
}
