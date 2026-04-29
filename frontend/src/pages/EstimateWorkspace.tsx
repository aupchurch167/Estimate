import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { useEstimateDetail } from '@/features/estimates/useEstimates';
import { DraftModeLayout } from '@/features/estimates/workspace/DraftModeLayout';
import { ReviewModeLayout } from '@/features/estimates/workspace/ReviewModeLayout';
import type { EstimateStatus } from '@/features/estimates/types';
import { AppHeader } from '@/components/AppHeader';
import { Button, EmptyState, SkeletonCard } from '@/components/ui';
import { ErrorState as SharedErrorState } from '@/components/states';

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
    return <ErrorWrapper error={query.error as AxiosError} />;
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
    <Button variant="secondary" size="sm" onClick={onToggle}>
      {peeking ? 'Back to draft' : 'Peek as reviewer'}
    </Button>
  );
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="mb-6">
          <SkeletonCard rows={1} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
        </div>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <EmptyState
          title="Estimate not found"
          description="That estimate doesn't exist or you don't have access. It may have been deleted."
          action={
            <Link
              to="/app/estimates"
              className="rounded-md border border-border-secondary bg-bg-primary px-4 py-2 text-[14px] font-medium text-text-primary hover:bg-bg-tertiary"
            >
              Back to estimates
            </Link>
          }
        />
      </main>
    </div>
  );
}

function ErrorWrapper({ error }: { error: AxiosError }) {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <SharedErrorState error={error} fallback="Could not load this estimate." />
      </main>
    </div>
  );
}
