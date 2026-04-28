import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusStamp } from '@/features/estimates/StatusStamp';
import { ESTIMATE_STATUSES } from '@/features/estimates/types';

describe('StatusStamp', () => {
  it.each(ESTIMATE_STATUSES)('renders a distinct stamp for %s', (status) => {
    render(<StatusStamp status={status} />);
    expect(screen.getByTestId(`status-stamp-${status}`)).toBeInTheDocument();
  });

  it('renders human-friendly labels (DRAFT → Draft, IN_REVIEW → In Review)', () => {
    render(<StatusStamp status="DRAFT" />);
    expect(screen.getByText(/^Draft$/)).toBeInTheDocument();
  });

  it('renders IN_REVIEW with two-word label', () => {
    render(<StatusStamp status="IN_REVIEW" />);
    expect(screen.getByText(/in review/i)).toBeInTheDocument();
  });
});
