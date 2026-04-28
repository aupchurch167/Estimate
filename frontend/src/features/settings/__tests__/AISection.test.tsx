import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { AISection } from '@/features/settings/AISection';
import { api } from '@/lib/api';
import type { OrgSettings } from '@/features/auth/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockedPatch = vi.mocked(api.patch);

const settings: OrgSettings = {
  id: 's1',
  organizationId: 'o1',
  companyLegalName: 'Mark Allan Contracting, LLC',
  logoUrl: null,
  primaryColorHex: '#1A1A1A',
  contactPhone: null,
  contactEmail: null,
  estimateNumberPrefix: 'MAC',
  defaultMarkupPercent: '0.20',
  drafterCanSend: true,
  timezone: 'America/New_York',
  monthlyAiCostCapUsd: '200',
};

beforeEach(() => {
  mockedPatch.mockReset();
});

describe('AISection — remove-cap confirmation', () => {
  it('opens a confirm dialog when Remove cap is clicked and does NOT call the API yet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AISection settings={settings} />);
    await user.click(screen.getByRole('button', { name: /remove cap/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/remove monthly ai cap\?/i)).toBeInTheDocument();
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('cancels without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AISection settings={settings} />);
    await user.click(screen.getByRole('button', { name: /remove cap/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockedPatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirming sends { monthlyAiCostCapUsd: null, confirmUnlimited: true }', async () => {
    const user = userEvent.setup();
    mockedPatch.mockResolvedValueOnce({
      data: { settings: { ...settings, monthlyAiCostCapUsd: null } },
    });
    renderWithProviders(<AISection settings={settings} />);
    await user.click(screen.getByRole('button', { name: /remove cap/i }));
    await user.click(screen.getByRole('button', { name: /set unlimited/i }));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/organizations/current/settings', {
        monthlyAiCostCapUsd: null,
        confirmUnlimited: true,
      });
    });
  });

  it('disables Remove cap when already unlimited', () => {
    renderWithProviders(<AISection settings={{ ...settings, monthlyAiCostCapUsd: null }} />);
    expect(screen.getByRole('button', { name: /remove cap/i })).toBeDisabled();
  });
});
