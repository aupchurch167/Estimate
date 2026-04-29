import type { EstimateDetail } from '@/features/estimates/types';
import { Card } from '@/components/ui';

/**
 * Project details summary (Phase 8.1 layout).
 *
 * `bare` mode skips the Card wrapper for use inside the tabbed
 * Project Context card.
 */
export function ProjectDetailsPanel({
  estimate,
  bare = false,
}: {
  estimate: EstimateDetail;
  bare?: boolean;
}) {
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

  const body = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
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
      {addressParts.length > 0 ? (
        <Row label="Site address" stack>
          <div className="text-text-primary">
            {addressParts.map((line, i) => (
              <p key={i} className="text-[13px]">
                {line}
              </p>
            ))}
          </div>
        </Row>
      ) : null}
    </dl>
  );

  if (bare) return body;
  return (
    <Card title="Project details" className="flex h-full flex-col">
      {body}
    </Card>
  );
}

function Row({
  label,
  children,
  stack = false,
}: {
  label: string;
  children: React.ReactNode;
  stack?: boolean;
}) {
  if (stack) {
    return (
      <div className="col-span-full">
        <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          {label}
        </dt>
        <dd className="mt-1">{children}</dd>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

