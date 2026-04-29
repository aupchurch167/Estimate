import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
} from '@/components/ui';
import { ErrorState } from '@/components/states';
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
 *   1. Pipeline KPIs — 4 numeric tiles.
 *   2. Needs Attention — consolidated list of items waiting on the viewer.
 *   3. Pipeline strip — counts per status with click-through.
 *   4. AI Usage — admin-only spend + cap + per-user breakdown.
 *   5. Recent activity — last 12 org-wide events.
 */
export function Dashboard() {
  const q = useDashboard();

  if (q.isLoading) {
    return (
      <div data-testid="dashboard-loading" className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
        <SkeletonCard rows={5} />
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
      <PipelineKpiTiles pipeline={pipeline} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <NeedsAttentionPanel rows={needsAttention} />
        </div>
        <ActivityPanel rows={recentActivity} />
      </div>
      <PipelineStrip pipeline={pipeline} />
      {aiUsage ? <AiUsageCard usage={aiUsage} /> : null}
    </div>
  );
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
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {tiles.map((t) => (
        <Card
          key={t.label}
          data-testid={`dashboard-kpi-${t.label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`}
          className="!border-border-primary"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            {t.label}
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-9 tabular-nums text-text-primary">
            {t.value}
          </p>
          <p className="mt-1 text-[12px] text-text-tertiary">{t.hint}</p>
        </Card>
      ))}
    </section>
  );
}

// ─── Needs attention ──────────────────────────────────────────────────────

function NeedsAttentionPanel({ rows }: { rows: NeedsAttentionItem[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Needs your attention">
        <EmptyState
          title="Nothing waiting on you"
          description="When teammates submit work or your drafts go stale, they'll show up here."
        />
      </Card>
    );
  }
  return (
    <Card
      title="Needs your attention"
      data-testid="dashboard-needs-attention"
      className="!p-0"
    >
      <ul className="-mx-5 -my-4">
        {rows.map((r) => (
          <li
            key={r.id}
            data-testid="needs-attention-row"
            data-reason={r.reason}
            className="border-b border-border-primary last:border-b-0"
          >
            <Link
              to={`/app/estimates/${r.id}`}
              className="flex items-center gap-4 px-5 py-3 transition-colors duration-fast hover:bg-bg-tertiary"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-mono text-[12px] tabular-nums text-text-secondary">
                    {r.number}
                  </p>
                  <Badge status={r.status} size="sm">
                    {r.status.replace('_', ' ')}
                  </Badge>
                  <p className="text-[12px] text-text-tertiary">{ageLabel(r.ageDays)}</p>
                </div>
                <p className="mt-1 truncate text-[14px] font-medium text-text-primary">
                  {r.title}
                </p>
                <p className="text-[12px] text-text-tertiary">
                  {r.clientCompanyName ?? 'No client'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  data-testid="needs-attention-cta"
                  className="text-[12px] font-medium text-primary"
                >
                  {ctaLabel(r.reason)} →
                </span>
                <span className="font-mono text-[13px] tabular-nums text-text-primary">
                  {formatMoney(r.totalSellPrice)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
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
    <Card
      data-testid="dashboard-pipeline"
      title="Pipeline"
      actions={
        <p className="text-[12px] tabular-nums text-text-secondary">
          {formatMoney(pipeline.totalApprovedSellPrice)} approved ·{' '}
          {formatMoney(pipeline.totalSentSellPrice)} sent ·{' '}
          {formatMoney(pipeline.wonThisMonthSellPrice)} won this month
        </p>
      }
      className="!p-0"
    >
      <div className="grid grid-cols-2 gap-px bg-border-primary sm:grid-cols-4 lg:grid-cols-7">
        {cells.map((c) => (
          <Link
            key={c.label}
            to={c.status ? `/app/estimates?status=${c.status}` : '/app/estimates'}
            data-testid={`pipeline-cell-${c.status ?? 'all'}`}
            className="flex flex-col gap-1 bg-bg-primary px-4 py-4 transition-colors duration-fast hover:bg-bg-tertiary"
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
              {c.label}
            </p>
            <p className="text-[24px] font-semibold tabular-nums text-text-primary">{c.value}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ─── AI Usage (admin only) ────────────────────────────────────────────────

function AiUsageCard({ usage }: { usage: AiUsagePayload }) {
  const cap = usage.capUsd ? Number(usage.capUsd) : null;
  const mtd = Number(usage.monthToDateUsd);
  const pct = cap && cap > 0 ? Math.min(1, mtd / cap) : null;
  const top = [...usage.byUser].sort((a, b) => Number(b.costUsd) - Number(a.costUsd)).slice(0, 5);
  const barColor =
    pct === null ? '' : pct >= 0.9 ? 'bg-danger' : pct >= 0.7 ? 'bg-warning' : 'bg-primary';

  return (
    <Card
      data-testid="dashboard-ai-usage"
      title="AI usage · this month"
      actions={
        <p className="text-[12px] tabular-nums text-text-secondary">
          {formatMoney(usage.monthToDateUsd)} spent
          {cap !== null
            ? ` of ${formatMoney(usage.capUsd ?? '0')} cap${
                pct !== null ? ` · ${Math.round(pct * 100)}%` : ''
              }`
            : ' · no cap set'}{' '}
          · {usage.monthToDateRunCount} runs
        </p>
      }
    >
      {pct !== null ? (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            data-testid="ai-usage-bar"
            data-pct={Math.round(pct * 100)}
            style={{ width: `${pct * 100}%` }}
            className={`h-full transition-all duration-slow ${barColor}`}
          />
        </div>
      ) : null}
      {top.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">No AI runs this month.</p>
      ) : (
        <ul className="flex flex-col">
          {top.map((u) => (
            <li
              key={u.userId}
              data-testid="ai-usage-user-row"
              className="flex items-center justify-between gap-3 border-b border-border-primary py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={`${u.firstName} ${u.lastName}`} size="sm" />
                <p className="truncate text-[13px] text-text-primary">
                  {`${u.firstName} ${u.lastName}`.trim() || u.email}
                </p>
              </div>
              <p className="text-[12px] tabular-nums text-text-secondary">
                {u.runCount} {u.runCount === 1 ? 'run' : 'runs'} ·{' '}
                <span className="text-text-primary font-medium">{formatMoney(u.costUsd)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Activity panel ───────────────────────────────────────────────────────

function ActivityPanel({ rows }: { rows: DashboardActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Recent activity">
        <p className="text-[13px] text-text-tertiary">No activity yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Recent activity" className="!p-0">
      <ul className="-mx-5 -my-4">
        {rows.map((a) => (
          <li
            key={a.id}
            data-testid="dashboard-activity-row"
            className="border-b border-border-primary px-5 py-3 last:border-b-0"
          >
            <div className="flex items-start gap-3">
              <Avatar
                name={a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : 'System'}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-text-primary">
                  <span className="font-medium">
                    {a.actor ? `${a.actor.firstName} ${a.actor.lastName}`.trim() : 'System'}
                  </span>{' '}
                  <span className="text-text-secondary">{a.summary}</span>
                </p>
                <p className="mt-1 text-[12px] text-text-tertiary">
                  {formatStamp(a.createdAt)}
                  {a.estimate ? (
                    <>
                      {' '}
                      ·{' '}
                      <Link
                        to={`/app/estimates/${a.estimate.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.estimate.number}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
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

void Skeleton;

// `DashboardEstimateRow` is exported via types.ts but not used in this file.
// Suppress unused-import noise without removing the symbol from the module.
export type { DashboardEstimateRow };
