import { useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { canCloseOutEstimate } from '@/lib/permissions';
import type { EstimateDetail } from '@/features/estimates/types';
import { Button, Modal, Textarea } from '@/components/ui';
import { useMarkLost, useMarkWon, useReviseFromSent } from './useReviewWorkspace';

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
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setReviseOpen(true)}
          disabled={revise.isPending}
          data-testid="revise-from-sent"
        >
          Revise
        </Button>
        <Button
          variant="danger"
          onClick={() => setLostOpen(true)}
          disabled={lost.isPending}
          data-testid="mark-lost"
        >
          Mark lost
        </Button>
        <Button onClick={onWon} loading={won.isPending} data-testid="mark-won">
          Mark won
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {mapCloseOutError(error as AxiosError, 'Could not mark as won.')}
        </p>
      ) : null}

      <CloseOutDialog
        open={lostOpen}
        title="Mark as lost"
        description="Capture why so we learn from it."
        submitLabel="Mark as lost"
        primaryVariant="danger"
        placeholder="Why did this lose? Price, scope, timing, competitor…"
        required
        pending={lost.isPending}
        error={
          lost.error ? mapCloseOutError(lost.error as AxiosError, 'Could not mark as lost.') : null
        }
        onCancel={() => {
          lost.reset();
          setLostOpen(false);
        }}
        onSubmit={submitLost}
      />

      <CloseOutDialog
        open={reviseOpen}
        title="Revise after send"
        description="Reopens the estimate for changes; the previous SEND snapshot is preserved."
        submitLabel="Reopen for revision"
        primaryVariant="primary"
        placeholder="Optional note for the activity log…"
        required={false}
        pending={revise.isPending}
        error={
          revise.error
            ? mapCloseOutError(revise.error as AxiosError, 'Could not reopen for revision.')
            : null
        }
        onCancel={() => {
          revise.reset();
          setReviseOpen(false);
        }}
        onSubmit={submitRevise}
      />
    </>
  );
}

interface CloseOutDialogProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  primaryVariant: 'primary' | 'danger';
  placeholder: string;
  required: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

function CloseOutDialog({
  open,
  title,
  description,
  submitLabel,
  primaryVariant,
  placeholder,
  required,
  pending,
  error,
  onCancel,
  onSubmit,
}: CloseOutDialogProps) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const disabled = pending || (required && trimmed.length === 0);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={() => {
        setValue('');
        onCancel();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <Modal.Footer
          onCancel={() => {
            setValue('');
            onCancel();
          }}
          onPrimary={() => {
            onSubmit(trimmed);
            setValue('');
          }}
          primaryLabel={submitLabel}
          primaryVariant={primaryVariant}
          primaryLoading={pending}
          primaryDisabled={disabled}
        />
      }
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={4}
        maxLength={2000}
        disabled={pending}
        data-testid="closeout-input"
        error={error}
      />
    </Modal>
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
