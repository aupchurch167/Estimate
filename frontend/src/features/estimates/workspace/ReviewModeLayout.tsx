import { TitleBlock } from './TitleBlock';
import { LineItemGrid } from '@/features/estimates/grid/LineItemGrid';
import { RightRail } from '@/features/estimates/review/RightRail';
import {
  ReviewerActions,
  UnlockButton,
} from '@/features/estimates/review/ReviewActions';
import { ExportPdfButton } from '@/features/estimates/review/ExportPdfButton';
import { SendButton } from '@/features/estimates/review/SendButton';
import { CloseOutActions } from '@/features/estimates/review/CloseOutActions';
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
              <>
                <UnlockButton estimate={estimate} />
                <ExportPdfButton estimate={estimate} />
                <SendButton estimate={estimate} />
                {estimate.status === 'SENT' ? (
                  <CloseOutActions estimate={estimate} />
                ) : null}
              </>
            ) : (
              <>
                <ExportPdfButton estimate={estimate} />
                <ReviewerActions estimate={estimate} />
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

          <RightRail estimate={estimate} readOnly={readOnly} />
        </div>
      </main>
    </div>
  );
}

function readOnlyLabel(status: EstimateStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'Approved · Read-only';
    case 'SENT':
      return 'Sent · Read-only';
    case 'WON':
      return 'Leased · Read-only';
    case 'LOST':
      return 'Lost · Read-only';
    default:
      return 'Read-only';
  }
}
