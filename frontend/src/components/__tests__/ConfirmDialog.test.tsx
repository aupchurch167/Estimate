import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('does not render when open=false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="hidden"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and confirm/cancel buttons', () => {
    render(
      <ConfirmDialog
        open
        title="Remove cap?"
        body="extra context"
        confirmLabel="Yes do it"
        cancelLabel="No back out"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/remove cap/i)).toBeInTheDocument();
    expect(screen.getByText(/extra context/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes do it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no back out/i })).toBeInTheDocument();
  });

  it('fires onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Confirm"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Confirm"
        cancelLabel="No"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /no/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel on Escape', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Confirm"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});
