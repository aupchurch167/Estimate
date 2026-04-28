import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SettingsPage } from '@/pages/Settings';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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
    settings: defaultSettings(),
  };
}

function defaultSettings() {
  return {
    id: 's1',
    organizationId: 'o1',
    primaryColorHex: '#1A1A1A',
    estimateNumberPrefix: 'ACM',
    defaultMarkupPercent: '0.20',
    drafterCanSend: true,
    timezone: 'America/New_York',
    monthlyAiCostCapUsd: '100',
    companyLegalName: null,
    logoUrl: null,
    contactPhone: null,
    contactEmail: null,
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe('SettingsPage RoleGate', () => {
  it('shows access denied for non-admin roles', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: meAs('ESTIMATOR') });
      if (url === '/api/organizations/current')
        return Promise.resolve({
          data: { organization: { id: 'o1', name: 'Acme' }, settings: defaultSettings() },
        });
      return Promise.reject(new Error(`unexpected: ${url}`));
    });

    renderWithProviders(<SettingsPage />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/A · identity/i)).not.toBeInTheDocument();
  });

  it('renders all five sections for OWNER', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: meAs('OWNER') });
      if (url === '/api/organizations/current')
        return Promise.resolve({
          data: { organization: { id: 'o1', name: 'Acme' }, settings: defaultSettings() },
        });
      return Promise.reject(new Error(`unexpected: ${url}`));
    });

    renderWithProviders(<SettingsPage />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByText(/A · identity/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/B · branding/i)).toBeInTheDocument();
    expect(screen.getByText(/C · workflow/i)).toBeInTheDocument();
    expect(screen.getByText(/D · ai cost cap/i)).toBeInTheDocument();
    expect(screen.getByText(/E · defaults/i)).toBeInTheDocument();
  });
});
