import type { EstimateDetail } from '@/features/estimates/types';
import { Card } from '@/components/ui';

/**
 * Project details summary card (Phase 8.1 layout).
 *
 * Sits in the top row of the draft workspace alongside Sources and
 * Assumptions. Shows the at-a-glance "what is this estimate for"
 * fields so the drafter doesn't have to leave the workspace to see
 * the basics.
 */
export function ProjectDetailsPanel({ estimate }: { estimate: EstimateDetail }) {
  const issued = new Date(estimate.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  const addressParts = [
    estimate.projectAddressLine1,
    estimate.projectAddressLine2,
    [estimate.projectCity, estimate.projectState].filter(Boolean).join(', '),
    estimate.projectPostalCode,
  ].filter((s): s is string => Boolean(s && s.trim().length > 0));

  return (
    <Card title="Project details" className="flex h-full flex-col">
      <dl className="flex flex-col gap-3 text-[13px]">
        <Row label="Estimate">
          <span className="font-mono tabular-nums text-text-primary">{estimate.number}</span>
        </Row>
        <Row label="Issued">
          <span className="tabular-nums text-text-primary">{issued}</span>
        </Row>
        <Row label="Total">
          <span className="font-mono font-semibold tabular-nums text-text-primary">
            ${Number(estimate.totalSellPrice).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </Row>
        <div className="border-t border-border-primary pt-3">
          <Row label="Client">
            <span className="text-text-primary">{estimate.clientCompanyName ?? '—'}</span>
          </Row>
          {estimate.clientContactName ? (
            <Row label="Contact">
              <span className="text-text-primary">{estimate.clientContactName}</span>
            </Row>
          ) : null}
          {estimate.clientContactEmail ? (
            <Row label="Email">
              <a
                href={`mailto:${estimate.clientContactEmail}`}
                className="font-medium text-primary hover:underline"
              >
                {estimate.clientContactEmail}
              </a>
            </Row>
          ) : null}
          {estimate.clientContactPhone ? (
            <Row label="Phone">
              <span className="font-mono tabular-nums text-text-primary">
                {estimate.clientContactPhone}
              </span>
            </Row>
          ) : null}
        </div>
        {addressParts.length > 0 ? (
          <div className="border-t border-border-primary pt-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Site address
            </p>
            <div className="mt-1 text-text-primary">
              {addressParts.map((line, i) => (
                <p key={i} className="text-[13px]">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
