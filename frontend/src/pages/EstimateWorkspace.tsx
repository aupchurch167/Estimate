import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { useEstimateDetail } from '@/features/estimates/useEstimates';
import { DraftModeLayout } from '@/features/estimates/workspace/DraftModeLayout';
import { ReviewModeLayout } from '@/features/estimates/workspace/ReviewModeLayout';
import type { EstimateStatus } from '@/features/estimates/types';

type Mode = 'draft' | 'review' | 'review-readonly';

const READ_ONLY_STATUSES: EstimateStatus[] = ['APPROVED', 'SENT', 'WON', 'LOST'];

function defaultMode(status: EstimateStatus): Mode {
  if (status === 'DRAFT' || status === 'REVISED') return 'draft';
  if (status === 'IN_REVIEW') return 'review';
  if (READ_ONLY_STATUSES.includes(status)) return 'review-readonly';
  return 'review';
}

export function EstimateWorkspace() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const query = useEstimateDetail(id);
  const [peeking, setPeeking] = useState(false);

  if (query.isLoading) {
    return <Skeleton />;
  }

  if (query.isError) {
    const status = (query.error as AxiosError | undefined)?.response?.status;
    if (status === 404) return <NotFound />;
    return <ErrorState />;
  }

  if (!query.data) return <NotFound />;
  const estimate = query.data;

  const baseMode = defaultMode(estimate.status);
  const isReviewerOfDraft =
    estimate.status === 'DRAFT' &&
    estimate.reviewerId !== null &&
    user?.id === estimate.reviewerId;

  const effectiveMode: Mode =
    baseMode === 'draft' && peeking && isReviewerOfDraft ? 'review-readonly' : baseMode;

  const peekToggle = isReviewerOfDraft ? (
    <PeekToggle peeking={peeking} onToggle={() => setPeeking((p) => !p)} />
  ) : undefined;

  if (effectiveMode === 'draft') {
    return <DraftModeLayout estimate={estimate} modeSwitch={peekToggle} />;
  }
  return (
    <ReviewModeLayout
      estimate={estimate}
      readOnly={effectiveMode === 'review-readonly'}
      modeSwitch={peekToggle}
    />
  );
}

function PeekToggle({ peeking, onToggle }: { peeking: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-dim hover:border-ink hover:text-ink"
    >
      {peeking ? 'Back to draft' : 'Peek as reviewer'}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b-[1.5px] border-ink bg-paper">
        <div className="mx-auto max-w-[1280px] px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
        </div>
      </header>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-[760px] px-6 py-24 text-center">
        <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
          Not found
        </p>
        <h1 className="mt-2 font-sans text-[20px] text-ink">
          That estimate doesn't exist or you don't have access.
        </h1>
        <Link
          to="/app/estimates"
          className="mt-6 inline-block border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
        >
          Back to estimates
        </Link>
      </main>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-[760px] px-6 py-24">
        <p
          role="alert"
          className="border border-mark-red/60 bg-paper-elevated p-6 font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          Could not load this estimate.
        </p>
      </main>
    </div>
  );
}
