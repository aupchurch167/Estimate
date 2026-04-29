import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { RoleGate } from '@/components/RoleGate';
import { useUsers } from '@/features/team/useTeam';
import { CreateEstimateModal } from '@/features/estimates/CreateEstimateModal';
import { EstimateTable, type SortField, type SortOrder } from '@/features/estimates/EstimateTable';
import { FilterBar, type FilterValues } from '@/features/estimates/FilterBar';
import { useEstimates } from '@/features/estimates/useEstimates';
import { ESTIMATE_STATUSES, type EstimateStatus } from '@/features/estimates/types';

export function EstimatesPage() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();
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
      p.delete('page'); // reset to page 1 on filter change
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

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  const Header = (
    <header className="border-b-[1.5px] border-ink bg-paper">
      <div className="mx-auto flex max-w-[1280px] items-stretch justify-between px-6">
        <div className="flex items-center gap-6 py-4">
          <Link to="/app" className="font-mono text-[16px] uppercase tracking-title text-ink">
            Quill
          </Link>
          {organization ? (
            <span className="border-l border-rule-soft pl-6 font-mono text-[10px] uppercase tracking-label text-dim">
              {organization.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4 py-4">
          <Link
            to="/app/estimates"
            className="font-mono text-[10px] uppercase tracking-label text-ink"
          >
            Estimates
          </Link>
          <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
            <Link
              to="/app/pricing"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Pricing
            </Link>
            <Link
              to="/app/team"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Team
            </Link>
            <Link
              to="/app/settings"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Settings
            </Link>
          </RoleGate>
          <NotificationBell />
          {user ? (
            <Link
              to="/app/account"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              {user.firstName} {user.lastName}
              <span className="mx-2 text-rule-soft">·</span>
              {user.role}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink transition hover:bg-ink hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-paper">
      {Header}
      <main className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="flex items-end justify-between border-b border-rule pb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Pipeline</p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">Estimates</h1>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreateEstimate}
            title={canCreateEstimate ? '' : 'Your role cannot create estimates'}
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            New estimate
          </button>
        </div>

        <div className="mt-6">
          <FilterBar value={filters} onChange={onFilterChange} members={usersQuery.data ?? []} />
        </div>

        <div className="mt-6">
          {estimatesQuery.isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
          ) : estimatesQuery.isError || !estimatesQuery.data ? (
            <p
              role="alert"
              className="border border-mark-red/60 bg-paper-elevated p-6 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              Could not load estimates.
            </p>
          ) : (
            <>
              <EstimateTable
                estimates={estimatesQuery.data.data}
                members={usersQuery.data ?? []}
                sort={sort}
                order={order}
                onSortChange={onSortChange}
              />
              {estimatesQuery.data.totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between border-t border-rule-soft pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                    Page {estimatesQuery.data.page} of {estimatesQuery.data.totalPages} —{' '}
                    {estimatesQuery.data.total} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={estimatesQuery.data.page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={estimatesQuery.data.page >= estimatesQuery.data.totalPages}
                      onClick={() => setPage(page + 1)}
                      className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
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
