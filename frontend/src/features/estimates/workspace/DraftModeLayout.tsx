import { TitleBlock } from './TitleBlock';
import { ProjectContextCard } from './ProjectContextCard';
import { ConversationPanel } from './ConversationPanel';
import { SchedulePanel } from './SchedulePanel';
import { SubmitForReviewButton } from '@/features/estimates/review/ReviewActions';
import type { EstimateDetail } from '@/features/estimates/types';

interface DraftModeLayoutProps {
  estimate: EstimateDetail;
  /**
   * When the viewer is the assigned reviewer of a DRAFT, they can flip
   * the layout into a read-only Review-mode peek. The toggle button +
   * actual swap happen in the workspace; this prop lets the parent
   * inject the flip control here.
   */
  modeSwitch?: React.ReactNode;
}

/**
 * Draft-mode layout (Phase 8.1, layout iteration 2).
 *
 * Two horizontal bands:
 *   1. Top — single collapsible "Project context" card with tabs for
 *      Details / Sources / Assumptions. Reference info the drafter
 *      glances at; can be hidden to give the work area more room.
 *   2. Bottom — 1/3 width chat on the left, 2/3 width schedule on the
 *      right. Chat is for talking to Quill; schedule is the work
 *      output.
 *
 * Stacks vertically below the lg breakpoint so the layout still works
 * on a narrow window or tablet.
 */
export function DraftModeLayout({ estimate, modeSwitch }: DraftModeLayoutProps) {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <TitleBlock
        estimate={estimate}
        modeLabel={estimate.status === 'REVISED' ? 'Revising' : 'Drafting'}
        actions={
          <>
            {modeSwitch}
            <SubmitForReviewButton estimate={estimate} />
          </>
        }
      />
      <main className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-6">
        <ProjectContextCard estimate={estimate} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:[grid-template-rows:minmax(560px,calc(100vh-340px))]">
          <div className="lg:col-span-1 lg:h-full">
            <ConversationPanel estimate={estimate} />
          </div>
          <div className="lg:col-span-2 lg:h-full">
            <SchedulePanel estimate={estimate} />
          </div>
        </section>
      </main>
    </div>
  );
}
