import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { SectionShell } from './SectionShell';
import {
  useAiUsage,
  type AiRunStatus,
  type UsageDailyPoint,
  type UsageRecentRun,
} from './useAiUsage';

/**
 * Admin-only "AI usage" panel rendered below the cost-cap form. Shows
 * month-to-date spend with a progress bar against the cap, top
 * contributors + estimates over the last 30 days, a tiny daily
 * sparkline, and the 25 most recent runs with status + per-line cost
 * (FAILED runs surface their errorMessage so admins can debug
 * without grepping logs).
 */
export function AiUsageSection() {
  const q = useAiUsage();

  if (q.isLoading) {
    return (
      <SectionShell index="E" label="ai usage">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Loading usage…
        </p>
      </SectionShell>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SectionShell index="E" label="ai usage">
        <p
          role="alert"
          className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {backendErrorMessage(q.error as AxiosError, 'Could not load AI usage.')}
        </p>
      </SectionShell>
    );
  }

  const u = q.data;
  const cap = u.capUsd === null ? null : Number(u.capUsd);
  const mtd = Number(u.monthToDateUsd);
  const pct = cap === null || cap === 0 ? null : Math.min(100, (mtd / cap) * 100);

  return (
    <SectionShell index="E" label="ai usage">
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              Month to date
            </p>
            <p className="mt-1 font-mono text-[18px] tabular-nums text-ink">
              {formatMoney(mtd)}{' '}
              {cap !== null ? (
                <span className="text-dim">/ {formatMoney(cap)} cap</span>
              ) : (
                <span className="text-dim">/ unlimited</span>
              )}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              {u.monthToDateRunCount} runs this month
            </p>
          </div>
          {pct !== null ? (
            <div className="w-full max-w-[260px]">
              <div
                className="h-1 w-full bg-rule-soft"
                aria-label={`${Math.round(pct)}% of monthly cap used`}
                data-testid="ai-usage-cap-bar"
              >
                <div
                  className={`h-full ${
                    pct >= 90
                      ? 'bg-mark-red'
                      : pct >= 60
                        ? 'bg-mark-amber'
                        : 'bg-mark-green'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-dim">
                {Math.round(pct)}% of cap used
              </p>
            </div>
          ) : null}
        </header>

        <Sparkline series={u.dailySeries} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-label text-dim">
              Top users (last {u.windowDays} days)
            </p>
            {u.byUser.length === 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                No runs yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {u.byUser.map((row) => (
                  <li
                    key={row.userId}
                    data-testid="ai-usage-user-row"
                    className="flex items-baseline justify-between border-b border-rule-soft py-2 last:border-b-0"
                  >
                    <span className="font-sans text-[13px] text-ink">
                      {row.firstName} {row.lastName}{' '}
                      <span className="font-mono text-[10px] uppercase tracking-label text-dim">
                        · {row.runCount} runs
                      </span>
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-ink">
                      {formatMoney(Number(row.costUsd))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-label text-dim">
              Top estimates (last {u.windowDays} days)
            </p>
            {u.byEstimate.length === 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                No runs yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {u.byEstimate.map((row) => (
                  <li
                    key={row.estimateId}
                    data-testid="ai-usage-estimate-row"
                    className="flex items-baseline justify-between border-b border-rule-soft py-2 last:border-b-0"
                  >
                    <Link
                      to={`/app/estimates/${row.estimateId}`}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="font-mono text-[12px] tabular-nums text-ink">
                        {row.number}{' '}
                        <span className="font-mono text-[10px] uppercase tracking-label text-dim">
                          · {row.runCount} runs
                        </span>
                      </span>
                      <span className="font-sans text-[12px] text-dim">{row.title}</span>
                    </Link>
                    <span className="font-mono text-[12px] tabular-nums text-ink">
                      {formatMoney(Number(row.costUsd))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-label text-dim">
            Recent runs
          </p>
          {u.recentRuns.length === 0 ? (
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              No runs yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {u.recentRuns.map((r) => (
                <li
                  key={r.id}
                  data-testid="ai-usage-recent-row"
                  data-status={r.status}
                  className="flex flex-col gap-1 border-b border-rule-soft py-2 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                      {formatStamp(r.createdAt)}
                      {r.estimate ? (
                        <>
                          {' · '}
                          <Link
                            to={`/app/estimates/${r.estimate.id}`}
                            className="text-ink hover:underline"
                          >
                            {r.estimate.number}
                          </Link>
                        </>
                      ) : null}
                      {' · '}
                      {r.triggeredBy
                        ? `${r.triggeredBy.firstName} ${r.triggeredBy.lastName}`.trim()
                        : 'system'}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-label tabular-nums text-ink">
                      <StatusChip status={r.status} />{' '}
                      <span className="text-dim">{r.runType}</span>{' '}
                      <span className="text-dim">·</span>{' '}
                      {r.costUsd !== null ? formatMoney(Number(r.costUsd)) : '—'}
                    </p>
                  </div>
                  {r.errorMessage ? (
                    <p className="border-l-2 border-mark-red/60 pl-2 font-mono text-[11px] text-mark-red">
                      {r.errorMessage}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ series }: { series: UsageDailyPoint[] }) {
  const max = Math.max(0, ...series.map((p) => Number(p.costUsd)));
  if (max === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        No spend in the last {series.length} days.
      </p>
    );
  }
  return (
    <div
      className="flex h-12 items-end gap-[2px]"
      data-testid="ai-usage-sparkline"
      aria-label={`Daily AI spend, last ${series.length} days`}
    >
      {series.map((p) => {
        const v = Number(p.costUsd);
        const h = Math.max(1, Math.round((v / max) * 100));
        return (
          <div
            key={p.date}
            title={`${p.date}: ${formatMoney(v)} · ${p.runCount} runs`}
            className="flex-1 bg-ink/70"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: AiRunStatus }) {
  const cls =
    status === 'SUCCEEDED'
      ? 'border-mark-green text-mark-green'
      : status === 'FAILED'
        ? 'border-mark-red text-mark-red'
        : status === 'CANCELLED'
          ? 'border-rule text-dim'
          : 'border-mark-amber/60 text-mark-amber';
  return (
    <span
      className={`inline-block border px-1 font-mono text-[10px] uppercase tracking-label ${cls}`}
    >
      {status}
    </span>
  );
}

function formatMoney(v: number): string {
  if (!Number.isFinite(v)) return '$0.00';
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

// `UsageRecentRun` import is only used as a type but kept for re-export.
export type { UsageRecentRun };
