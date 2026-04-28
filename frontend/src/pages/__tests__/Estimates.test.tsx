import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { EstimatesPage } from '@/pages/Estimates';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

function meAs(role: string) {
  return {
    user: {
      id: 'u1',
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      role,
      isActive: true,
    },
    organization: { id: 'o1', name: 'Acme' },
    settings: { id: 's1' },
  };
}

const sampleEstimates = [
  {
    id: 'e1',
    organizationId: 'o1',
    number: 'ACM-26-001',
    title: 'Acme Suite 400',
    status: 'DRAFT',
    drafterId: 'u1',
    reviewerId: null,
    clientCompanyName: 'Acme Corp',
    totalCost: '0',
    totalMarkup: '0',
    totalSellPrice: '12500',
    updatedAt: '2026-04-28T00:00:00.000Z',
    createdAt: '2026-04-28T00:00:00.000Z',
  },
];

function setupApiMocks({
  estimates,
  users,
}: {
  estimates: typeof sampleEstimates;
  users: { id: string; firstName: string; lastName: string }[];
}) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs('OWNER') });
    if (url === '/api/users') return Promise.resolve({ data: { users } });
    if (url.startsWith('/api/estimates')) {
      return Promise.resolve({
        data: {
          data: estimates,
          total: estimates.length,
          page: 1,
          pageSize: 25,
          totalPages: 1,
        },
      });
    }
    return Promise.reject(new Error(`unexpected: ${url}`));
  });
}

let lastUrl = '';
function LocationProbe() {
  const location = useLocation();
  lastUrl = `${location.pathname}${location.search}`;
  return null;
}

function renderAt(url: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <AuthProvider>
          <LocationProbe />
          <Routes>
            <Route path="/app/estimates" element={<EstimatesPage />} />
            <Route path="/app/estimates/:id" element={<div data-testid="workspace">workspace</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EstimatesPage', () => {
  it('renders the table and pre-fills filters from URL', async () => {
    setupApiMocks({
      estimates: sampleEstimates,
      users: [{ id: 'u1', firstName: 'Adam', lastName: 'Mark' }],
    });
    renderAt('/app/estimates?status=DRAFT&search=acme');
    await waitFor(() => {
      expect(screen.getByText('ACM-26-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Suite 400')).toBeInTheDocument();
    // Search input reflects URL.
    const searchInput = screen.getByPlaceholderText(/title, client/i) as HTMLInputElement;
    expect(searchInput.value).toBe('acme');
  });

  it('toggling a status filter updates the URL', async () => {
    setupApiMocks({ estimates: [], users: [] });
    const user = userEvent.setup();
    renderAt('/app/estimates');
    await waitFor(() => screen.getByRole('heading', { name: /^Estimates$/, level: 1 }));
    await user.click(screen.getByRole('button', { name: /^In Review$/i }));
    await waitFor(() => {
      expect(lastUrl).toContain('status=IN_REVIEW');
    });
  });

  it('clicking a row navigates to the workspace', async () => {
    setupApiMocks({
      estimates: sampleEstimates,
      users: [{ id: 'u1', firstName: 'Adam', lastName: 'Mark' }],
    });
    const user = userEvent.setup();
    renderAt('/app/estimates');
    await waitFor(() => screen.getByText('ACM-26-001'));
    await user.click(screen.getByText('ACM-26-001'));
    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toBeInTheDocument();
    });
  });

  it('opening the create modal and submitting calls POST /api/estimates and navigates', async () => {
    setupApiMocks({
      estimates: sampleEstimates,
      users: [{ id: 'u1', firstName: 'Adam', lastName: 'Mark' }],
    });
    mockedPost.mockResolvedValueOnce({
      data: { estimate: { id: 'new-1', number: 'ACM-26-002' } },
    });
    const user = userEvent.setup();
    renderAt('/app/estimates');
    await waitFor(() => screen.getByRole('heading', { name: /^Estimates$/, level: 1 }));
    await user.click(screen.getByRole('button', { name: /new estimate/i }));
    await user.type(screen.getByLabelText(/^Title$/i), 'Acme TI v2');
    await user.type(screen.getByLabelText(/client company/i), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: /create estimate/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates',
        expect.objectContaining({ title: 'Acme TI v2', clientCompanyName: 'Acme Corp' }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toBeInTheDocument();
    });
  });
});
