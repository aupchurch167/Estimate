import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PricingPage } from '@/pages/Pricing';
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
    settings: { id: 's1', estimateNumberPrefix: 'ACM' },
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe('PricingPage RoleGate', () => {
  it('shows access denied for non-admin roles', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: meAs('PM') });
      return Promise.reject(new Error(`unexpected: ${url}`));
    });
    renderWithProviders(<PricingPage />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Manage categories/i)).not.toBeInTheDocument();
  });
});
