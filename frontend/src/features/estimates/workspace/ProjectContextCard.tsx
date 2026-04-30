import { useState } from 'react';
import type { EstimateDetail } from '@/features/estimates/types';
import { Badge } from '@/components/ui';
import { ProjectDetailsPanel } from './ProjectDetailsPanel';
import { SourcesPanel } from './SourcesPanel';
import { AssumptionsPanel } from './AssumptionsPanel';
import {
  ActivityPanel,
  CommentsPanel,
  VersionsPanel,
} from '@/features/estimates/review/ContextPanels';

type TabId =
  | 'details'
  | 'sources'
  | 'assumptions'
  | 'comments'
  | 'versions'
  | 'activity';

interface ProjectContextCardProps {
  estimate: EstimateDetail;
  /** True when the estimate is locked (SENT/WON/LOST/APPROVED). Hides write
   *  affordances inside the Comments panel. */
  readOnly?: boolean;
}

/**
 * Single context card spanning the top of the workspace. Holds every
 * panel that used to live in the right rail (Comments, Versions,
 * Activity) plus the project-side panels (Details, Sources,
 * Assumptions). Body height is capped so the card stays out of the
 * way of the schedule below.
 */
export function ProjectContextCard({ estimate, readOnly = false }: ProjectContextCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<TabId>('details');

  const flaggedCount = estimate.lineItems.filter((li) => {
    return (
      li.status === 'NO_PRICE' ||
      li.status === 'NEEDS_REVIEW' ||
      li.status === 'PENDING_SUB_QUOTE' ||
      Boolean(li.aiAssumption)
    );
  }).length;
  const sourceCount = estimate.sourceInputs.length;

  return (
    <section
      data-testid="project-context-card"
      className="rounded-lg border border-border-primary bg-bg-primary shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-primary px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <p className="text-[15px] font-medium text-text-primary">Project context</p>
          {collapsed ? (
            <p className="text-[12px] text-text-secondary">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
              {flaggedCount > 0 ? (
                <>
                  {' · '}
                  <Badge variant="warning" size="sm">
                    {flaggedCount} flagged
                  </Badge>
                </>
              ) : null}
            </p>
          ) : (
            <nav className="flex items-center gap-1 overflow-x-auto">
              <TabButton id="details" active={tab} onClick={setTab}>
                Details
              </TabButton>
              <TabButton id="sources" active={tab} onClick={setTab} count={sourceCount}>
                Sources
              </TabButton>
              <TabButton
                id="assumptions"
                active={tab}
                onClick={setTab}
                count={flaggedCount}
                countVariant={flaggedCount > 0 ? 'warning' : 'neutral'}
              >
                Assumptions
              </TabButton>
              <TabButton id="comments" active={tab} onClick={setTab}>
                Comments
              </TabButton>
              <TabButton id="versions" active={tab} onClick={setTab}>
                Versions
              </TabButton>
              <TabButton id="activity" active={tab} onClick={setTab}>
                Activity
              </TabButton>
            </nav>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          data-testid="project-context-toggle"
          className="rounded-md px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>
      {collapsed ? null : (
        <div
          data-testid={`project-context-tab-${tab}`}
          className="flex h-[280px] flex-col overflow-hidden"
        >
          {tab === 'details' ? <DetailsTab estimate={estimate} /> : null}
          {tab === 'sources' ? <SourcesTab estimate={estimate} /> : null}
          {tab === 'assumptions' ? <AssumptionsTab estimate={estimate} /> : null}
          {tab === 'comments' ? (
            <CommentsPanel estimate={estimate} readOnly={readOnly} />
          ) : null}
          {tab === 'versions' ? <VersionsPanel estimate={estimate} /> : null}
          {tab === 'activity' ? <ActivityPanel estimate={estimate} /> : null}
        </div>
      )}
    </section>
  );
}

function TabButton({
  id,
  active,
  onClick,
  count,
  countVariant = 'neutral',
  children,
}: {
  id: TabId;
  active: TabId;
  onClick: (id: TabId) => void;
  count?: number;
  countVariant?: 'neutral' | 'warning';
  children: React.ReactNode;
}) {
  const isActive = id === active;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      data-testid={`project-context-tab-btn-${id}`}
      data-active={isActive ? 'true' : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
        isActive
          ? 'bg-primary-light text-primary'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      }`}
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className={`inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums ${
            countVariant === 'warning' && count > 0
              ? 'bg-warning text-text-inverse'
              : 'bg-neutral-light text-text-secondary'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

// ─── Project-side tabs — re-use the existing panels but render them
// without their own card chrome since we now share a single card.

function DetailsTab({ estimate }: { estimate: EstimateDetail }) {
  return (
    <div className="overflow-auto p-4">
      <ProjectDetailsPanel estimate={estimate} bare />
    </div>
  );
}

function SourcesTab({ estimate }: { estimate: EstimateDetail }) {
  return (
    <div className="overflow-auto">
      <SourcesPanel estimate={estimate} bare />
    </div>
  );
}

function AssumptionsTab({ estimate }: { estimate: EstimateDetail }) {
  return (
    <div className="overflow-auto">
      <AssumptionsPanel estimate={estimate} bare />
    </div>
  );
}
