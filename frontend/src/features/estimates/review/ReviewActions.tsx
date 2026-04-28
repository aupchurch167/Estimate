import { useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
} from '@/features/auth/useAuth';
import {
  canReviewEstimate,
  canSubmitEstimateForReview,
  canUnlockApprovedEstimate,
} from '@/lib/permissions';
import type { EstimateDetail } from '@/features/estimates/types';
import {
  useApproveEstimate,
  useRequestChanges,
  useSubmitForReview,
  useUnlockEstimate,
} from './useReviewWorkspace';

/**
 * Drafter-side affordance: "Submit for review" or "Resubmit for review"
 * (when the estimate has been bounced back as REVISED). Visibility is
 * gated by canSubmitEstimateForReview; rendering returns null when the
 * viewer cannot see the button.
 */
export function SubmitForReviewButton({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const submit = useSubmitForReview(estimate.id);
  if (!user) return null;
  const allowed = canSubmitEstimateForReview(
    { id: user.id, role: user.role },
    {
      drafterId: estimate.drafterId,
      reviewerId: estimate.reviewerId,
      status: estimate.status,
    },
  );
  if (!allowed) return null;
  const label =
    estimate.status === 'REVISED' ? 'Resubmit for review' : 'Submit for review';
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => submit.mutate({})}
        disabled={submit.isPending}
        data-testid="submit-for-review"
        className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submit.isPending ? 'Submitting…' : label}
      </button>
      {submit.error ? (
        <p
          role="alert"
          className="font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {mapTransitionError(submit.error as AxiosError, 'Could not submit.')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reviewer-side affordances on an IN_REVIEW estimate: Approve and
 * Request changes. The drafter (or anyone who isn't the reviewer or an
 * admin) sees nothing.
 */
export function ReviewerActions({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const approve = useApproveEstimate(estimate.id);
  const requestChanges = useRequestChanges(estimate.id);
  const [requesting, setRequesting] = useState(false);

  if (!user) return null;
  const allowed = canReviewEstimate(
    { id: user.id, role: user.role },
    {
      drafterId: estimate.drafterId,
      reviewerId: estimate.reviewerId,
      status: estimate.status,
    },
  );
  if (!allowed) return null;

  const onApprove = () => approve.mutate({});
  const onRequest = () => setRequesting(true);
  const submitChange = async (note: string) => {
    requestChanges.reset();
    try {
      await requestChanges.mutateAsync({ note });
      setRequesting(false);
    } catch {
      // banner inside the modal
    }
  };

  const error = approve.error ?? requestChanges.error;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={approve.isPending || requestChanges.isPending}
          data-testid="approve-estimate"
          className="border border-mark-green bg-mark-green/10 px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-green hover:bg-mark-green hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approve.isPending ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onRequest}
          disabled={approve.isPending || requestChanges.isPending}
          data-testid="request-changes"
          className="border border-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red hover:bg-mark-red hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
        >
          Request changes
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {mapTransitionError(error as AxiosError, 'Could not record review action.')}
        </p>
      ) : null}
      {requesting ? (
        <NoteDialog
          title="Request changes"
          submitLabel={requestChanges.isPending ? 'Sending…' : 'Send back to drafter'}
          placeholder="What needs to change before approval?"
          required
          pending={requestChanges.isPending}
          error={
            requestChanges.error
              ? mapTransitionError(
                  requestChanges.error as AxiosError,
                  'Could not request changes.',
                )
              : null
          }
          onCancel={() => {
            requestChanges.reset();
            setRequesting(false);
          }}
          onSubmit={submitChange}
        />
      ) : null}
    </>
  );
}

/**
 * Admin-only affordance on an APPROVED estimate: Unlock to REVISED.
 */
export function UnlockButton({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const unlock = useUnlockEstimate(estimate.id);
  const [open, setOpen] = useState(false);
  if (!user) return null;
  if (estimate.status !== 'APPROVED') return null;
  if (!canUnlockApprovedEstimate(user.role)) return null;

  const submit = async (note: string) => {
    unlock.reset();
    try {
      await unlock.mutateAsync({ note: note.trim().length > 0 ? note : null });
      setOpen(false);
    } catch {
      // banner inside the modal
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="unlock-estimate"
        className="border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink hover:border-ink"
      >
        Unlock for revision
      </button>
      {open ? (
        <NoteDialog
          title="Unlock for revision"
          submitLabel={unlock.isPending ? 'Unlocking…' : 'Unlock'}
          placeholder="Optional note for the drafter…"
          required={false}
          pending={unlock.isPending}
          error={
            unlock.error
              ? mapTransitionError(unlock.error as AxiosError, 'Could not unlock.')
              : null
          }
          onCancel={() => {
            unlock.reset();
            setOpen(false);
          }}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}

// ─── Note dialog ──────────────────────────────────────────────────────────

function NoteDialog({
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
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const disabled = pending || (required && trimmed.length === 0);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      data-testid="note-dialog"
    >
      <div className="w-full max-w-[480px] border border-ink bg-paper-elevated">
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">{title}</p>
        </header>
        <div className="flex flex-col gap-2 p-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={placeholder}
            rows={4}
            maxLength={2000}
            disabled={pending}
            data-testid="note-input"
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
            data-testid="note-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(trimmed)}
            disabled={disabled}
            data-testid="note-submit"
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Error mapping ────────────────────────────────────────────────────────

function mapTransitionError(err: AxiosError, fallback: string): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (code === 'invalid_status_transition') {
    return 'Estimate state changed — refresh and try again.';
  }
  if (status === 403) {
    return 'You no longer have permission to do that.';
  }
  return backendErrorMessage(err, fallback);
}
