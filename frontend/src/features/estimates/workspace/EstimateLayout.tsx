import { useState } from 'react';
import { TitleBlock } from './TitleBlock';
import { ProjectContextCard } from './ProjectContextCard';
import { ConversationPanel } from './ConversationPanel';
import { LineItemGrid } from '@/features/estimates/grid/LineItemGrid';
import { SubmitForReviewButton } from '@/features/estimates/review/ReviewActions';
import {
  ReviewerActions,
  UnlockButton,
} from '@/features/estimates/review/ReviewActions';
import { ExportPdfButton } from '@/features/estimates/review/ExportPdfButton';
import { SendButton } from '@/features/estimates/review/SendButton';
import { CloseOutActions } from '@/features/estimates/review/CloseOutActions';
import { Card } from '@/components/ui';
import type { EstimateDetail, EstimateStatus } from '@/features/estimates/types';

type Mode = 'draft' | 'review' | 'review-readonly';

interface EstimateLayoutProps {
  estimate: EstimateDetail;
  mode: Mode;
  /** Optional reviewer "Peek as reviewer" toggle injected by the page. */
  modeSwitch?: React.ReactNode;
}

/**
 * Unified workspace layout for every estimate mode (draft, review,
 * read-only). Shape:
 *
 *   1. TitleBlock        — header with mode-specific actions.
 *   2. ProjectContext    — single card holding Details / Sources /
 *                          Assumptions / Comments / Versions / Activity.
 *                          Body height is capped so it doesn't crowd
 *                          the schedule.
 *   3. Two-column band:
 *      a. Chat (left)    — Quill conversation, collapsible to a
 *                          44px strip.
 *      b. Schedule       — full Schedule of Values grid.
 *
 * Mode-specific actions still fork in the title block: drafts get
 * Submit for review, in-review gets the reviewer actions, read-only
 * gets Unlock / Export / Send / close-out.
 */
export function EstimateLayout({ estimate, mode, modeSwitch }: EstimateLayoutProps) {
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const readOnly = mode === 'review-readonly';
  const modeLabel = labelForMode(mode, estimate.status);

  // Tailwind JIT only emits utilities it can see literally in source —
  // the two collapse states are spelled out below.
  const colsClass = chatCollapsed
    ? 'lg:[grid-template-columns:44px_1fr]'
    : 'lg:[grid-template-columns:320px_1fr]';

  return (
    <div className="min-h-screen bg-bg-secondary">
      <TitleBlock
        estimate={estimate}
        modeLabel={modeLabel}
        actions={
          <>
            {modeSwitch}
            <ActionsForMode mode={mode} estimate={estimate} />
          </>
        }
      />
      <main className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-6">
        <ProjectContextCard estimate={estimate} readOnly={readOnly} />

        <section
          className={`grid grid-cols-1 gap-4 ${colsClass} lg:[grid-template-rows:minmax(560px,calc(100vh-340px))]`}
        >
          <div className="lg:h-full">
            {chatCollapsed ? (
              <CollapsedStrip
                label="Conversation"
                onExpand={() => setChatCollapsed(false)}
              />
            ) : (
              <ConversationShell onCollapse={() => setChatCollapsed(true)}>
                <ConversationPanel estimate={estimate} />
              </ConversationShell>
            )}
          </div>

          <div className="lg:h-full">
            <Card
              title="Schedule of Values"
              actions={
                <p className="text-[12px] text-text-secondary">
                  {readOnly
                    ? 'Read-only view of the approved schedule.'
                    : 'Edit inline — Tab walks the cells, Enter starts editing.'}
                </p>
              }
              className="flex h-full flex-col overflow-hidden"
              bodyClassName="flex-1 min-h-0 overflow-hidden flex flex-col"
            >
              <LineItemGrid estimate={estimate} />
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

function ActionsForMode({ mode, estimate }: { mode: Mode; estimate: EstimateDetail }) {
  if (mode === 'draft') {
    return <SubmitForReviewButton estimate={estimate} />;
  }
  if (mode === 'review-readonly') {
    return (
      <>
        <UnlockButton estimate={estimate} />
        <ExportPdfButton estimate={estimate} />
        <SendButton estimate={estimate} />
        {estimate.status === 'SENT' ? <CloseOutActions estimate={estimate} /> : null}
      </>
    );
  }
  // review
  return (
    <>
      <ExportPdfButton estimate={estimate} />
      <ReviewerActions estimate={estimate} />
    </>
  );
}

function ConversationShell({
  children,
  onCollapse,
}: {
  children: React.ReactNode;
  onCollapse: () => void;
}) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-lg border border-border-primary bg-bg-primary shadow-sm">
      <header className="flex items-center justify-between border-b border-border-primary px-3 py-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
          Conversation
        </p>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide conversation"
          data-testid="conversation-toggle"
          className="rounded-md p-1.5 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M11 4L6 9l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}

function CollapsedStrip({
  label,
  onExpand,
}: {
  label: string;
  onExpand: () => void;
}) {
  return (
    <aside
      data-testid={`${label.toLowerCase()}-collapsed`}
      className="flex h-full flex-col items-center gap-3 rounded-lg border border-border-primary bg-bg-primary px-2 py-3 shadow-sm"
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Show ${label.toLowerCase()}`}
        data-testid={`${label.toLowerCase()}-toggle`}
        className="rounded-md p-1.5 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M7 4l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="flex flex-1 flex-col items-center [writing-mode:vertical-rl] rotate-180">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
          {label}
        </span>
      </div>
    </aside>
  );
}

function labelForMode(mode: Mode, status: EstimateStatus): string {
  if (mode === 'draft') {
    return status === 'REVISED' ? 'Revising' : 'Drafting';
  }
  if (mode === 'review-readonly') {
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
  return 'Reviewing';
}
