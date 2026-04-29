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
import { QuickCommentComposer } from '@/features/estimates/review/QuickCommentComposer';
import { Card } from '@/components/ui';
import type { EstimateDetail, EstimateStatus } from '@/features/estimates/types';

interface ReviewModeLayoutProps {
  estimate: EstimateDetail;
  readOnly: boolean;
  modeSwitch?: React.ReactNode;
}

export function ReviewModeLayout({ estimate, readOnly, modeSwitch }: ReviewModeLayoutProps) {
  const modeLabel = readOnly ? readOnlyLabel(estimate.status) : 'Reviewing';
  return (
    <div className="min-h-screen bg-bg-secondary">
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
        {!readOnly ? (
          <Card className="mb-4">
            <QuickCommentComposer estimateId={estimate.id} />
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:[grid-template-rows:minmax(560px,calc(100vh-260px))]">
          <Card
            title="Schedule of Values"
            actions={
              <p className="text-[12px] text-text-secondary">
                {readOnly
                  ? 'Read-only view of the approved schedule.'
                  : 'Edit inline — Tab walks the cells, Enter starts editing.'}
              </p>
            }
            className="!p-0 flex h-full flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-hidden p-4">
              <LineItemGrid estimate={estimate} />
            </div>
          </Card>

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
      return 'Won · Read-only';
    case 'LOST':
      return 'Lost · Read-only';
    default:
      return 'Read-only';
  }
}
