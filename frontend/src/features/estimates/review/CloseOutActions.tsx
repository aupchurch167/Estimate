import { useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
} from '@/features/auth/useAuth';
import { canCloseOutEstimate } from '@/lib/permissions';
import type { EstimateDetail } from '@/features/estimates/types';
import {
  useMarkLost,
  useMarkWon,
  useReviseFromSent,
} from './useReviewWorkspace';

/**
 * SENT-state close-out actions: Mark won, Mark lost (reason required),
 * Revise.
 *
 * Visibility: admin always; ESTIMATOR drafter or reviewer. Backend
 * canCloseOutEstimate is the source of truth; this is just the
 * client-side mirror.
 */
export function CloseOutActions({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const won = useMarkWon(estimate.id);
  const lost = useMarkLost(estimate.id);
  const revise = useReviseFromSent(estimate.id);
  const [lostOpen, setLostOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);

  if (!user) return null;
  if (
    !canCloseOutEstimate(
      { id: user.id, role: user.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    return null;
  }

  const onWon = () => won.mutate({});
  const submitLost = async (lostReason: string) => {
    lost.reset();
    try {
      await lost.mutateAsync({ lostReason });
      setLostOpen(false);
    } catch {
      // banner inside the modal
    }
  };
  const submitRevise = async (note: string) => {
    revise.reset();
    try {
      await revise.mutateAsync({ note: note.length > 0 ? note : null });
      setReviseOpen(false);
    } catch {
      // banner inside the modal
    }
  };

  const error = won.error;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onWon}
          disabled={won.isPending}
          data-testid="mark-won"
          className="border border-mark-green bg-mark-green/10 px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-green hover:bg-mark-green hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
        >
          {won.isPending ? 'Saving…' : 'Mark won'}
        </button>
        <button
          type="button"
          onClick={() => setLostOpen(true)}
          disabled={lost.isPending}
          data-testid="mark-lost"
          className="border border-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red hover:bg-mark-red hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark lost
        </button>
        <button
          type="button"
          onClick={() => setReviseOpen(true)}
          disabled={revise.isPending}
          data-testid="revise-from-sent"
          className="border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          Revise
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {mapCloseOutError(error as AxiosError, 'Could not mark as won.')}
        </p>
      ) : null}

      {lostOpen ? (
        <CloseOutDialog
          title="Mark as lost"
          submitLabel={lost.isPending ? 'Saving…' : 'Mark as lost'}
          placeholder="Why did this lose? Price, scope, timing, competitor…"
          required
          pending={lost.isPending}
          error={
            lost.error
              ? mapCloseOutError(lost.error as AxiosError, 'Could not mark as lost.')
              : null
          }
          onCancel={() => {
            lost.reset();
            setLostOpen(false);
          }}
          onSubmit={submitLost}
        />
      ) : null}

      {reviseOpen ? (
        <CloseOutDialog
          title="Revise after send"
          submitLabel={revise.isPending ? 'Reopening…' : 'Reopen for revision'}
          placeholder="Optional note for the activity log…"
          required={false}
          pending={revise.isPending}
          error={
            revise.error
              ? mapCloseOutError(
                  revise.error as AxiosError,
                  'Could not reopen for revision.',
                )
              : null
          }
          onCancel={() => {
            revise.reset();
            setReviseOpen(false);
          }}
          onSubmit={submitRevise}
        />
      ) : null}
    </>
  );
}

function CloseOutDialog({
  title,
  submitLabel,
  placeholder,
  required,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  placeholder: string;
  required: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const disabled = pending || (required && trimmed.length === 0);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      data-testid="closeout-dialog"
    >
      <div className="w-full max-w-[480px] border border-ink bg-paper-elevated">
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">{title}</p>
        </header>
        <div className="flex flex-col gap-2 p-5">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={4}
            maxLength={2000}
            disabled={pending}
            data-testid="closeout-input"
            className="w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {error ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="closeout-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(trimmed)}
            disabled={disabled}
            data-testid="closeout-submit"
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function mapCloseOutError(err: AxiosError, fallback: string): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (code === 'invalid_status_transition') {
    return 'Estimate state changed — refresh and try again.';
  }
  if (status === 403) {
    return 'You do not have permission to do that.';
  }
  return backendErrorMessage(err, fallback);
}
