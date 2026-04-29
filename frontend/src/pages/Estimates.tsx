import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useUsers } from '@/features/team/useTeam';
import { CreateEstimateModal } from '@/features/estimates/CreateEstimateModal';
import { EstimateTable, type SortField, type SortOrder } from '@/features/estimates/EstimateTable';
import { FilterBar, type FilterValues } from '@/features/estimates/FilterBar';
import { useEstimates } from '@/features/estimates/useEstimates';
import { ESTIMATE_STATUSES, type EstimateStatus } from '@/features/estimates/types';
import { Button, Card, EmptyState, SkeletonRow, TitleBlock } from '@/components/ui';
import { ErrorState } from '@/components/states';

export function EstimatesPage() {
  const { canCreateEstimate } = usePermissions();
  const usersQuery = useUsers();

  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const sort: SortField = (params.get('sort') as SortField) || 'updatedAt';
  const order: SortOrder = (params.get('order') as SortOrder) || 'desc';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const writeParams = (mut: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mut(next);
    setParams(next, { replace: true });
  };

  const onFilterChange = (next: FilterValues) => {
    writeParams((p) => {
      p.delete('status');
      for (const s of next.status) p.append('status', s);
      setOrDelete(p, 'drafterId', next.drafterId);
      setOrDelete(p, 'reviewerId', next.reviewerId);
      setOrDelete(p, 'search', next.search);
      p.delete('page');
    });
  };

  const onSortChange = (newSort: SortField, newOrder: SortOrder) => {
    writeParams((p) => {
      p.set('sort', newSort);
      p.set('order', newOrder);
      p.delete('page');
    });
  };

  const setPage = (next: number) => {
    writeParams((p) => {
      if (next <= 1) p.delete('page');
      else p.set('page', String(next));
    });
  };

  const estimatesQuery = useEstimates({
    status: filters.status.length > 0 ? filters.status : undefined,
    drafterId: filters.drafterId || undefined,
    reviewerId: filters.reviewerId || undefined,
    search: filters.search || undefined,
    page,
    pageSize: 25,
    sort,
    order,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const hasResults = (estimatesQuery.data?.data.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <TitleBlock
          title="Estimates"
          subtitle="Drafts, reviews, and sent estimates across your pipeline."
          actions={
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={!canCreateEstimate}
              title={canCreateEstimate ? '' : 'Your role cannot create estimates'}
            >
              New estimate
            </Button>
          }
        />

        <div className="mt-6">
          <FilterBar value={filters} onChange={onFilterChange} members={usersQuery.data ?? []} />
        </div>

        <div className="mt-6">
          {estimatesQuery.isLoading ? (
            <Card className="!p-0">
              <table className="w-full border-separate border-spacing-0">
                <tbody>
                  <SkeletonRow columns={6} />
                  <SkeletonRow columns={6} />
                  <SkeletonRow columns={6} />
                  <SkeletonRow columns={6} />
                  <SkeletonRow columns={6} />
                </tbody>
              </table>
            </Card>
          ) : estimatesQuery.isError || !estimatesQuery.data ? (
            <ErrorState
              error={estimatesQuery.error}
              fallback="Could not load estimates."
              onRetry={() => estimatesQuery.refetch()}
            />
          ) : hasResults ? (
            <Card className="!p-0">
              <EstimateTable
                estimates={estimatesQuery.data.data}
                members={usersQuery.data ?? []}
                sort={sort}
                order={order}
                onSortChange={onSortChange}
              />
              {estimatesQuery.data.totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-border-primary px-5 py-3">
                  <p className="text-[13px] text-text-secondary">
                    Page {estimatesQuery.data.page} of {estimatesQuery.data.totalPages} —{' '}
                    {estimatesQuery.data.total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={estimatesQuery.data.page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={estimatesQuery.data.page >= estimatesQuery.data.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="No estimates match these filters"
                description={
                  filters.status.length > 0 || filters.search || filters.drafterId
                    ? 'Try clearing the filters or adjusting your search.'
                    : 'Create your first estimate to start drafting with Quill.'
                }
                actionLabel={canCreateEstimate ? 'New estimate' : undefined}
                onAction={canCreateEstimate ? () => setCreateOpen(true) : undefined}
              />
            </Card>
          )}
        </div>
      </main>

      <CreateEstimateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function readFilters(params: URLSearchParams): FilterValues {
  const statusValues = params.getAll('status').filter((s): s is EstimateStatus =>
    (ESTIMATE_STATUSES as string[]).includes(s),
  );
  return {
    status: statusValues,
    drafterId: params.get('drafterId') ?? '',
    reviewerId: params.get('reviewerId') ?? '',
    search: params.get('search') ?? '',
  };
}

function setOrDelete(p: URLSearchParams, key: string, value: string | undefined) {
  if (value && value.length > 0) p.set(key, value);
  else p.delete(key);
}
