import { TitleBlock } from './TitleBlock';
import { LineItemGrid } from '@/features/estimates/grid/LineItemGrid';
import type { EstimateDetail, EstimateStatus } from '@/features/estimates/types';

interface ReviewModeLayoutProps {
  estimate: EstimateDetail;
  readOnly: boolean;
  modeSwitch?: React.ReactNode;
}

export function ReviewModeLayout({ estimate, readOnly, modeSwitch }: ReviewModeLayoutProps) {
  const modeLabel = readOnly ? readOnlyLabel(estimate.status) : 'Reviewer · Workspace';
  return (
    <div className="min-h-screen bg-paper">
      <TitleBlock
        estimate={estimate}
        modeLabel={modeLabel}
        actions={
          <>
            {modeSwitch}
            {readOnly ? (
              <ReadOnlyActions status={estimate.status} />
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  title="Approve action lands in Phase 4.3"
                  className="border border-mark-green bg-mark-green/10 px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-green hover:bg-mark-green hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled
                  title="Request changes lands in Phase 4.3"
                  className="border border-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red hover:bg-mark-red hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Request changes
                </button>
              </>
            )}
          </>
        }
      />

      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="grid grid-cols-[1fr_320px] gap-4 h-[calc(100vh-180px)]">
          <section className="flex flex-col border border-rule bg-paper-elevated">
            <header className="border-b border-rule-soft px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                Schedule of Values
              </p>
              <p className="mt-1 font-sans text-[12px] text-dim">
                {readOnly
                  ? 'Read-only view of the approved schedule.'
                  : 'Inline review of every line — fix prices, flag assumptions, leave comments.'}
              </p>
            </header>
            <div className="flex-1 overflow-hidden p-4">
              <LineItemGrid estimate={estimate} />
            </div>
          </section>

          <aside className="border border-rule bg-paper-elevated">
            <nav className="grid grid-cols-3 border-b border-rule-soft">
              <Tab label="Assumptions" active />
              <Tab label="Comments" />
              <Tab label="Activity" />
            </nav>
            <div className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                Right rail content lands in 4.2 (assumptions / comments / activity).
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Tab({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      disabled
      className={`border-r border-rule-soft py-2 font-mono text-[10px] uppercase tracking-label last:border-r-0 ${
        active ? 'bg-paper text-ink' : 'text-dim'
      }`}
    >
      {label}
    </button>
  );
}

function ReadOnlyActions({ status }: { status: EstimateStatus }) {
  const actions: { label: string; tone: 'primary' | 'neutral' }[] = [
    { label: 'Export PDF', tone: 'neutral' },
  ];
  if (status === 'APPROVED') actions.push({ label: 'Mark as sent', tone: 'primary' });
  if (status === 'SENT') {
    actions.push({ label: 'Mark won', tone: 'primary' });
    actions.push({ label: 'Mark lost', tone: 'neutral' });
    actions.push({ label: 'Revise', tone: 'neutral' });
  }
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled
          title={`${a.label} lands in Phase 5.x`}
          className={`border px-4 py-2 font-mono text-[11px] uppercase tracking-label disabled:cursor-not-allowed disabled:opacity-50 ${
            a.tone === 'primary'
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-rule text-ink hover:border-ink'
          }`}
        >
          {a.label}
        </button>
      ))}
    </>
  );
}

function readOnlyLabel(status: EstimateStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'Approved · Read-only';
    case 'SENT':
      return 'Sent · Read-only';
    case 'WON':
      return 'Won · Read-only';
    case 'LOST':
      return 'Lost · Read-only';
    default:
      return 'Read-only';
  }
}
