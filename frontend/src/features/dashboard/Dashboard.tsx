import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { StatusStamp } from '@/features/estimates/StatusStamp';
import type { EstimateStatus } from '@/features/estimates/types';
import { useDashboard } from './useDashboard';
import type {
  DashboardActivityRow,
  DashboardEstimateRow,
  PipelineSummary,
} from './types';

/**
 * Landing-page dashboard. Renders four panels:
 *   1. Pipeline strip — counts per status + key dollar totals.
 *   2. Pending your review — IN_REVIEW estimates assigned to viewer.
 *   3. Your drafts — DRAFT/REVISED estimates where viewer is drafter.
 *   4. Recent activity — last 12 org-wide events.
 *
 * Uses one round-trip (`GET /api/dashboard`) so first paint is a single
 * waterfall.
 */
export function Dashboard() {
  const q = useDashboard();

  if (q.isLoading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        Loading dashboard…
      </p>
    );
  }
  if (q.isError || !q.data) {
    return (
      <p
        role="alert"
        className="border border-mark-red/60 bg-paper-elevated p-4 font-mono text-[10px] uppercase tracking-label text-mark-red"
      >
        {backendErrorMessage(q.error as AxiosError, 'Could not load the dashboard.')}
      </p>
    );
  }

  const { pipeline, assignedReviews, myDrafts, recentActivity } = q.data;

  return (
    <div className="flex flex-col gap-6">
      <PipelineStrip pipeline={pipeline} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Pending your review"
          empty="Nothing waiting on you."
          rows={assignedReviews}
        />
        <Panel title="Your drafts" empty="No drafts in flight." rows={myDrafts} />
      </div>
      <ActivityPanel rows={recentActivity} />
    </div>
  );
}

// ─── Pipeline strip ───────────────────────────────────────────────────────

function PipelineStrip({ pipeline }: { pipeline: PipelineSummary }) {
  const cells: { label: string; status?: EstimateStatus; value: string | number }[] = [
    { label: 'Drafts', status: 'DRAFT', value: pipeline.counts.DRAFT },
    { label: 'In review', status: 'IN_REVIEW', value: pipeline.counts.IN_REVIEW },
    { label: 'Revised', status: 'REVISED', value: pipeline.counts.REVISED },
    { label: 'Approved', status: 'APPROVED', value: pipeline.counts.APPROVED },
    { label: 'Sent', status: 'SENT', value: pipeline.counts.SENT },
    { label: 'Won', status: 'WON', value: pipeline.counts.WON },
    { label: 'Lost', status: 'LOST', value: pipeline.counts.LOST },
  ];
  return (
    <section
      data-testid="dashboard-pipeline"
      className="border border-rule bg-paper-elevated"
    >
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Pipeline
        </p>
        <p className="mt-1 font-mono text-[12px] tabular-nums text-ink">
          {formatMoney(pipeline.totalApprovedSellPrice)} approved ·{' '}
          {formatMoney(pipeline.totalSentSellPrice)} sent ·{' '}
          {formatMoney(pipeline.wonThisMonthSellPrice)} won this month (
          {pipeline.wonThisMonthCount})
        </p>
      </header>
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 lg:grid-cols-7">
        {cells.map((c) => (
          <Link
            key={c.label}
            to={c.status ? `/app/estimates?status=${c.status}` : '/app/estimates'}
            data-testid={`pipeline-cell-${c.status ?? 'all'}`}
            className="flex flex-col items-start gap-2 border-b border-rule-soft px-4 py-3 last:border-b-0 hover:bg-paper sm:border-r sm:[&:nth-child(4)]:border-r-0 lg:[&:nth-child(4)]:border-r lg:[&:nth-child(7)]:border-r-0"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              {c.label}
            </p>
            <p className="font-mono text-[24px] tabular-nums text-ink">{c.value}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Estimates panel ──────────────────────────────────────────────────────

function Panel({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: DashboardEstimateRow[];
}) {
  return (
    <section className="flex flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          {title}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="dashboard-estimate-row"
              className="border-b border-rule-soft last:border-b-0"
            >
              <Link
                to={`/app/estimates/${r.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-paper"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[12px] tabular-nums text-ink">{r.number}</p>
                  <StatusStamp status={r.status} />
                </div>
                <p className="font-sans text-[14px] text-ink">{r.title}</p>
                <p className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-label text-dim">
                  <span>{r.clientCompanyName ?? 'No client'}</span>
                  <span className="tabular-nums text-ink">
                    {formatMoney(r.totalSellPrice)}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Activity panel ───────────────────────────────────────────────────────

function ActivityPanel({ rows }: { rows: DashboardActivityRow[] }) {
  return (
    <section className="flex flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Recent activity
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
          No activity yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => (
            <li
              key={a.id}
              data-testid="dashboard-activity-row"
              className="border-b border-rule-soft last:border-b-0 px-4 py-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                {a.actor
                  ? `${a.actor.firstName} ${a.actor.lastName}`.trim()
                  : 'System'}{' '}
                · {formatStamp(a.createdAt)}
                {a.estimate ? (
                  <>
                    {' '}
                    ·{' '}
                    <Link
                      to={`/app/estimates/${a.estimate.id}`}
                      className="text-ink hover:underline"
                    >
                      {a.estimate.number}
                    </Link>
                  </>
                ) : null}
              </p>
              <p className="mt-1 font-sans text-[12px] text-ink">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMoney(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '$0';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}
