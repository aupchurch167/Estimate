import { useState } from 'react';
import type { EstimateDetail } from '@/features/estimates/types';
import { Badge } from '@/components/ui';
import { ProjectDetailsPanel } from './ProjectDetailsPanel';
import { SourcesPanel } from './SourcesPanel';
import { AssumptionsPanel } from './AssumptionsPanel';

type TabId = 'details' | 'sources' | 'assumptions';

interface ProjectContextCardProps {
  estimate: EstimateDetail;
}

/**
 * A single collapsible card combining Project Details, Sources, and
 * Assumptions into a tabbed interface (Phase 8.1, layout iteration 2).
 *
 * Default: expanded with the Details tab active. The header has a
 * Hide / Show toggle on the right; collapsed state shows just the
 * header strip with a flagged-count summary so the drafter sees what
 * needs attention at a glance.
 */
export function ProjectContextCard({ estimate }: ProjectContextCardProps) {
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
            <nav className="flex items-center gap-1">
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
        <div data-testid={`project-context-tab-${tab}`}>
          {tab === 'details' ? <DetailsTab estimate={estimate} /> : null}
          {tab === 'sources' ? <SourcesTab estimate={estimate} /> : null}
          {tab === 'assumptions' ? <AssumptionsTab estimate={estimate} /> : null}
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
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
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

// ─── Tab bodies — re-use the existing panels but render them
// without their own card chrome since we now share a single card.

function DetailsTab({ estimate }: { estimate: EstimateDetail }) {
  return (
    <div className="p-4">
      <ProjectDetailsPanel estimate={estimate} bare />
    </div>
  );
}

function SourcesTab({ estimate }: { estimate: EstimateDetail }) {
  return <SourcesPanel estimate={estimate} bare />;
}

function AssumptionsTab({ estimate }: { estimate: EstimateDetail }) {
  return <AssumptionsPanel estimate={estimate} bare />;
}
