import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusStamp } from '@/features/estimates/StatusStamp';
import type { EstimateDetail } from '@/features/estimates/types';

/**
 * Drafting title block — vellum background, rule-line bottom, mono labels,
 * bordered metadata cells. The right side hosts mode-specific actions
 * passed in by the parent layout (Submit for review, Approve, Export, …).
 */
interface TitleBlockProps {
  estimate: EstimateDetail;
  actions: ReactNode;
  modeLabel: string;
}

export function TitleBlock({ estimate, actions, modeLabel }: TitleBlockProps) {
  const issueDate = new Date(estimate.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  return (
    <header className="border-b-[1.5px] border-ink bg-paper">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-rule-soft px-6 py-3">
        <Link to="/app" className="font-mono text-[16px] uppercase tracking-title text-ink">
          Quill
        </Link>
        <Link
          to="/app/estimates"
          className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
        >
          ← Estimates
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">{modeLabel}</p>
      </div>
      <div className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-4">
        <div className="grid grid-cols-3 gap-0 border border-ink">
          <Cell label="Estimate">
            <span className="font-mono text-[14px] tracking-title text-ink">
              {estimate.number}
            </span>
          </Cell>
          <Cell label="Issued">
            <span className="font-mono text-[12px] tabular-nums text-ink">{issueDate}</span>
          </Cell>
          <Cell label="Status" last>
            <StatusStamp status={estimate.status} />
          </Cell>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Project</p>
          <h1 className="mt-1 font-sans text-[20px] leading-tight text-ink">
            {estimate.title}
          </h1>
          {estimate.clientCompanyName ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-dim">
              {estimate.clientCompanyName}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">{actions}</div>
      </div>
    </header>
  );
}

function Cell({
  label,
  children,
  last,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2 ${last ? '' : 'border-r border-ink'}`}
    >
      <span className="font-mono text-[9px] uppercase tracking-label text-dim">{label}</span>
      {children}
    </div>
  );
}
