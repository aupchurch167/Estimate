import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EmptyState,
  ErrorState,
  SkeletonCard,
  SkeletonLine,
  SkeletonList,
} from '@/components/states';

describe('Skeleton primitives', () => {
  it('SkeletonLine renders with custom width and default height', () => {
    render(<SkeletonLine width="40%" />);
    const line = screen.getByTestId('skeleton-line');
    expect(line).toHaveStyle({ width: '40%' });
    expect(line.className).toContain('h-3');
    expect(line.getAttribute('aria-hidden')).toBe('true');
  });

  it('SkeletonList renders the requested number of rows', () => {
    render(<SkeletonList rows={5} />);
    const list = screen.getByTestId('skeleton-list');
    expect(list.querySelectorAll('li')).toHaveLength(5);
  });

  it('SkeletonCard renders header + body lines', () => {
    render(<SkeletonCard rows={3} />);
    const card = screen.getByTestId('skeleton-card');
    // 2 header lines + 3 body lines = 5 total skeleton-line entries.
    expect(card.querySelectorAll('[data-testid="skeleton-line"]')).toHaveLength(5);
  });
});

describe('EmptyState', () => {
  it('renders eyebrow + title + description and a primary CTA', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        eyebrow="No estimates yet"
        title="Quill will produce a first-draft from your sources."
        description="Add a source on the left, then ask Quill to draft."
        actionLabel="Generate draft"
        onAction={onAction}
      />,
    );
    expect(screen.getByText(/No estimates yet/i)).toBeInTheDocument();
    expect(screen.getByText(/first-draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a source/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('empty-state-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders without a CTA when none is provided', () => {
    render(<EmptyState title="Nothing here yet" />);
    expect(screen.getByText(/Nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-action')).not.toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('falls back to the literal message when no error is provided', () => {
    render(<ErrorState message="Could not load." />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load/i);
  });

  it('renders a Retry button that calls onRetry', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Boom." onRetry={onRetry} />);
    await user.click(screen.getByTestId('error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('maps an axios error into the rendered message', () => {
    const err = {
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'x', message: 'Upstream is down.' } } },
    } as unknown as Parameters<typeof ErrorState>[0]['error'];
    render(<ErrorState error={err} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Upstream is down/);
  });
});
