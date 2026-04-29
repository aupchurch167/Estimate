import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import type { EstimateDetail } from '@/features/estimates/types';

/**
 * Estimate workspace header (Phase 8.1).
 *
 * Shared AppHeader on top, then a per-estimate title row with
 * estimate metadata (number, project, client) on the left and
 * mode-specific actions on the right.
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
    <>
      <AppHeader />
      <div className="border-b border-border-primary bg-bg-primary">
        <div className="mx-auto max-w-[1280px] px-6 py-4">
          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Link to="/app/estimates" className="hover:text-text-primary">
              Estimates
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-[12px]">{estimate.number}</span>
            <span aria-hidden="true" className="text-text-tertiary">·</span>
            <span className="text-text-tertiary">{modeLabel}</span>
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[22px] font-semibold leading-7 text-text-primary">
                  {estimate.title}
                </h1>
                <Badge status={estimate.status} size="md">
                  {estimate.status === 'IN_REVIEW'
                    ? 'In review'
                    : estimate.status.charAt(0) + estimate.status.slice(1).toLowerCase()}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-text-secondary">
                {estimate.clientCompanyName ? (
                  <span>{estimate.clientCompanyName}</span>
                ) : (
                  <span className="text-text-tertiary">No client</span>
                )}
                <span aria-hidden="true" className="text-text-tertiary">·</span>
                <span>Issued {issueDate}</span>
                <span aria-hidden="true" className="text-text-tertiary">·</span>
                <span className="font-medium tabular-nums text-text-primary">
                  ${Number(estimate.totalSellPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
              {actions}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
