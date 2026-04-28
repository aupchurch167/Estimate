import { TitleBlock } from './TitleBlock';
import { SourcesPanel } from './SourcesPanel';
import { ConversationPanel } from './ConversationPanel';
import { SchedulePanel } from './SchedulePanel';
import { SubmitForReviewButton } from '@/features/estimates/review/ReviewActions';
import type { EstimateDetail } from '@/features/estimates/types';

interface DraftModeLayoutProps {
  estimate: EstimateDetail;
  /**
   * When the viewer is the assigned reviewer of a DRAFT, they can flip
   * the layout into a read-only Review-mode peek. The toggle button and
   * actual swap happens in 4.3; this prop lets the parent expose the
   * flip control here.
   */
  modeSwitch?: React.ReactNode;
}

export function DraftModeLayout({ estimate, modeSwitch }: DraftModeLayoutProps) {
  return (
    <div className="min-h-screen bg-paper">
      <TitleBlock
        estimate={estimate}
        modeLabel={estimate.status === 'REVISED' ? 'Revising · Draft' : 'Drafter · Workspace'}
        actions={
          <>
            {modeSwitch}
            <SubmitForReviewButton estimate={estimate} />
          </>
        }
      />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="grid grid-cols-[280px_1fr_360px] gap-4 h-[calc(100vh-180px)]">
          <SourcesPanel estimate={estimate} />
          <ConversationPanel estimate={estimate} />
          <SchedulePanel estimate={estimate} />
        </div>
      </main>
    </div>
  );
}
