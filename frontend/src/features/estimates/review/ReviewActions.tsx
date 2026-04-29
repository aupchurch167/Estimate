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
import { Button, Modal, Textarea } from '@/components/ui';
import {
  useApproveEstimate,
  useRequestChanges,
  useSubmitForReview,
  useUnlockEstimate,
} from './useReviewWorkspace';

/**
 * Drafter-side affordance: "Submit for review" or "Resubmit for review"
 * when the estimate has been bounced back as REVISED.
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
  const label = estimate.status === 'REVISED' ? 'Resubmit for review' : 'Submit for review';
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={() => submit.mutate({})}
        loading={submit.isPending}
        data-testid="submit-for-review"
      >
        {label}
      </Button>
      {submit.error ? (
        <p role="alert" className="text-[12px] text-danger">
          {mapTransitionError(submit.error as AxiosError, 'Could not submit.')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reviewer-side affordances on an IN_REVIEW estimate: Approve and
 * Request changes.
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
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onRequest}
          disabled={approve.isPending || requestChanges.isPending}
          data-testid="request-changes"
        >
          Request changes
        </Button>
        <Button
          onClick={onApprove}
          loading={approve.isPending}
          disabled={requestChanges.isPending}
          data-testid="approve-estimate"
        >
          Approve
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {mapTransitionError(error as AxiosError, 'Could not record review action.')}
        </p>
      ) : null}
      <NoteDialog
        open={requesting}
        title="Request changes"
        description="What needs to change before you can approve?"
        submitLabel="Send back to drafter"
        placeholder="Required — be specific so the drafter can act."
        required
        primaryVariant="primary"
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
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="unlock-estimate">
        Unlock for revision
      </Button>
      <NoteDialog
        open={open}
        title="Unlock for revision"
        description="The drafter will be able to make changes and resubmit."
        submitLabel="Unlock"
        placeholder="Optional note for the drafter…"
        required={false}
        primaryVariant="primary"
        pending={unlock.isPending}
        error={
          unlock.error ? mapTransitionError(unlock.error as AxiosError, 'Could not unlock.') : null
        }
        onCancel={() => {
          unlock.reset();
          setOpen(false);
        }}
        onSubmit={submit}
      />
    </>
  );
}

// ─── Note dialog ──────────────────────────────────────────────────────────

interface NoteDialogProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  placeholder: string;
  required: boolean;
  primaryVariant: 'primary' | 'danger';
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}

function NoteDialog({
  open,
  title,
  description,
  submitLabel,
  placeholder,
  required,
  primaryVariant,
  pending,
  error,
  onCancel,
  onSubmit,
}: NoteDialogProps) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const disabled = pending || (required && trimmed.length === 0);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={() => {
        setNote('');
        onCancel();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <Modal.Footer
          onCancel={() => {
            setNote('');
            onCancel();
          }}
          onPrimary={() => {
            onSubmit(trimmed);
            setNote('');
          }}
          primaryLabel={submitLabel}
          primaryVariant={primaryVariant}
          primaryLoading={pending}
          primaryDisabled={disabled}
        />
      }
    >
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        rows={4}
        maxLength={2000}
        disabled={pending}
        data-testid="note-input"
        error={error}
      />
    </Modal>
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
