import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { ErrorState, SkeletonCard, SkeletonList } from '@/components/states';
import { StatusStamp } from '@/features/estimates/StatusStamp';
import type { EstimateStatus } from '@/features/estimates/types';
import { useDashboard } from './useDashboard';
import type {
  AiUsagePayload,
  DashboardActivityRow,
  DashboardEstimateRow,
  NeedsAttentionItem,
  PipelineSummary,
} from './types';

/**
 * Landing-page dashboard. Renders, top to bottom:
 *   1. Needs attention — consolidated list of items waiting on the viewer.
 *   2. Pipeline KPIs — 4 numeric tiles (active value, win rate, avg days, won this month).
 *   3. Pipeline strip — counts per status with click-through.
 *   4. AI Usage — admin-only spend + cap + per-user breakdown.
 *   5. Recent activity — last 12 org-wide events.
 */
export function Dashboard() {
  const q = useDashboard();

  if (q.isLoading) {
    return (
      <div data-testid="dashboard-loading" className="flex flex-col gap-6">
        <SkeletonCard rows={2} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard rows={1} />
          <SkeletonCard rows={1} />
          <SkeletonCard rows={1} />
          <SkeletonCard rows={1} />
        </div>
        <SkeletonList rows={5} twoColumn />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <ErrorState
        error={q.error as AxiosError | null}
        fallback="Could not load the dashboard."
        onRetry={() => q.refetch()}
      />
    );
  }

  const { pipeline, needsAttention, recentActivity, aiUsage } = q.data;

  return (
    <div className="flex flex-col gap-6">
      <NeedsAttentionPanel rows={needsAttention} />
      <PipelineKpiTiles pipeline={pipeline} />
      <PipelineStrip pipeline={pipeline} />
      {aiUsage ? <AiUsageCard usage={aiUsage} /> : null}
      <ActivityPanel rows={recentActivity} />
    </div>
  );
}

// ─── Needs attention ──────────────────────────────────────────────────────

function NeedsAttentionPanel({ rows }: { rows: NeedsAttentionItem[] }) {
  return (
    <section
      data-testid="dashboard-needs-attention"
      className="border border-rule bg-paper-elevated"
    >
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Needs your attention
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
          Nothing waiting on you.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="needs-attention-row"
              data-reason={r.reason}
              className="border-b border-rule-soft last:border-b-0"
            >
              <Link
                to={`/app/estimates/${r.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-paper sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="font-mono text-[12px] tabular-nums text-ink">{r.number}</p>
                    <StatusStamp status={r.status} />
                    <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                      {ageLabel(r.ageDays)}
                    </p>
                  </div>
                  <p className="mt-1 truncate font-sans text-[14px] text-ink">{r.title}</p>
                  <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                    {r.clientCompanyName ?? 'No client'}
                  </p>
                </div>
                <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-1">
                  <span
                    data-testid="needs-attention-cta"
                    className="font-mono text-[10px] uppercase tracking-label text-ink"
                  >
                    {ctaLabel(r.reason)}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ink">
                    {formatMoney(r.totalSellPrice)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ctaLabel(reason: NeedsAttentionItem['reason']): string {
  switch (reason) {
    case 'my_revised':
      return 'Revise & resubmit';
    case 'awaiting_my_review':
      return 'Review';
    case 'my_draft':
      return 'Continue drafting';
    case 'stale_in_flight':
      return 'Follow up';
  }
}

function ageLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// ─── Pipeline KPI tiles ───────────────────────────────────────────────────

function PipelineKpiTiles({ pipeline }: { pipeline: PipelineSummary }) {
  const tiles = [
    {
      label: 'Active pipeline',
      value: formatMoney(pipeline.activePipelineValue),
      hint: 'DRAFT through SENT',
    },
    {
      label: 'Win rate',
      value:
        pipeline.winRate === null
          ? '—'
          : `${Math.round(pipeline.winRate * 100)}%`,
      hint: 'WON / (WON + LOST)',
    },
    {
      label: 'Avg days in pipeline',
      value:
        pipeline.avgDaysInPipeline === null
          ? '—'
          : pipeline.avgDaysInPipeline.toString(),
      hint: 'Created → terminal',
    },
    {
      label: 'Won this month',
      value: formatMoney(pipeline.wonThisMonthSellPrice),
      hint: `${pipeline.wonThisMonthCount} ${pipeline.wonThisMonthCount === 1 ? 'estimate' : 'estimates'}`,
    },
  ];
  return (
    <section
      data-testid="dashboard-kpis"
      className="grid grid-cols-1 gap-0 border border-rule bg-paper-elevated sm:grid-cols-2 lg:grid-cols-4"
    >
      {tiles.map((t, i) => (
        <div
          key={t.label}
          data-testid={`dashboard-kpi-${t.label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`}
          className={`flex flex-col gap-2 border-b border-rule-soft px-4 py-3 last:border-b-0 ${
            i < tiles.length - 1 ? 'lg:border-r' : ''
          } sm:[&:nth-child(2n)]:border-r-0 sm:border-r sm:border-b lg:border-b-0`}
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">{t.label}</p>
          <p className="font-mono text-[24px] tabular-nums text-ink">{t.value}</p>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">{t.hint}</p>
        </div>
      ))}
    </section>
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

// ─── AI Usage (admin only) ────────────────────────────────────────────────

function AiUsageCard({ usage }: { usage: AiUsagePayload }) {
  const cap = usage.capUsd ? Number(usage.capUsd) : null;
  const mtd = Number(usage.monthToDateUsd);
  const pct = cap && cap > 0 ? Math.min(1, mtd / cap) : null;
  const top = [...usage.byUser].sort((a, b) => Number(b.costUsd) - Number(a.costUsd)).slice(0, 5);
  return (
    <section
      data-testid="dashboard-ai-usage"
      className="border border-rule bg-paper-elevated"
    >
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          AI usage · this month
        </p>
        <p className="mt-1 font-mono text-[12px] tabular-nums text-ink">
          {formatMoney(usage.monthToDateUsd)} spent
          {cap !== null
            ? ` of ${formatMoney(usage.capUsd ?? '0')} cap${pct !== null ? ` · ${Math.round(pct * 100)}%` : ''}`
            : ' · no cap set'}{' '}
          · {usage.monthToDateRunCount} runs
        </p>
      </header>
      {pct !== null ? (
        <div className="mx-4 mt-3 h-1 w-[calc(100%-2rem)] bg-rule-soft">
          <div
            data-testid="ai-usage-bar"
            data-pct={Math.round(pct * 100)}
            style={{ width: `${pct * 100}%` }}
            className={`h-1 ${pct >= 0.9 ? 'bg-mark-red' : pct >= 0.7 ? 'bg-mark-amber' : 'bg-ink'}`}
          />
        </div>
      ) : null}
      {top.length === 0 ? (
        <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
          No AI runs this month.
        </p>
      ) : (
        <ul className="flex flex-col">
          {top.map((u) => (
            <li
              key={u.userId}
              data-testid="ai-usage-user-row"
              className="flex items-baseline justify-between gap-2 border-b border-rule-soft px-4 py-2 last:border-b-0"
            >
              <p className="truncate font-sans text-[13px] text-ink">
                {`${u.firstName} ${u.lastName}`.trim() || u.email}
              </p>
              <p className="font-mono text-[12px] tabular-nums text-dim">
                {u.runCount} {u.runCount === 1 ? 'run' : 'runs'} ·{' '}
                <span className="text-ink">{formatMoney(u.costUsd)}</span>
              </p>
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

// `DashboardEstimateRow` is exported via types.ts but not used in this file.
// Suppress unused-import noise without removing the symbol from the module.
export type { DashboardEstimateRow };
