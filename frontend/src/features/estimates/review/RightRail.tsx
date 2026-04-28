import { useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { backendErrorMessage } from '@/features/auth/useAuth';
import type { EstimateDetail } from '@/features/estimates/types';
import {
  useActivity,
  useComments,
  useCreateComment,
  useDeleteComment,
  useResolveComment,
} from './useReviewWorkspace';
import type {
  ActivityEvent,
  ActivityEventType,
  Comment,
} from './types';

type Tab = 'assumptions' | 'comments' | 'activity';

interface RightRailProps {
  estimate: EstimateDetail;
  /** When true, hide write affordances (post comment, resolve, delete). */
  readOnly?: boolean;
}

export function RightRail({ estimate, readOnly = false }: RightRailProps) {
  const [tab, setTab] = useState<Tab>('assumptions');
  return (
    <aside className="flex h-full flex-col border border-rule bg-paper-elevated">
      <nav className="grid grid-cols-3 border-b border-rule-soft">
        <TabButton active={tab === 'assumptions'} onClick={() => setTab('assumptions')}>
          Assumptions
        </TabButton>
        <TabButton active={tab === 'comments'} onClick={() => setTab('comments')}>
          Comments
        </TabButton>
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </TabButton>
      </nav>
      <div className="flex-1 overflow-auto">
        {tab === 'assumptions' ? <AssumptionsPanel estimate={estimate} /> : null}
        {tab === 'comments' ? (
          <CommentsPanel estimate={estimate} readOnly={readOnly} />
        ) : null}
        {tab === 'activity' ? <ActivityPanel estimate={estimate} /> : null}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`rail-tab-${String(children).toLowerCase()}`}
      data-active={active ? 'true' : 'false'}
      className={`border-r border-rule-soft py-2 font-mono text-[10px] uppercase tracking-label last:border-r-0 ${
        active ? 'bg-paper text-ink' : 'text-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Assumptions ──────────────────────────────────────────────────────────

function AssumptionsPanel({ estimate }: { estimate: EstimateDetail }) {
  const lineAssumptions = useMemo(
    () =>
      estimate.lineItems
        .filter((li) => li.aiAssumption && li.aiAssumption.trim().length > 0)
        .map((li) => ({
          lineItemId: li.id,
          description: li.description,
          assumption: li.aiAssumption ?? '',
          sectionId: li.scopeSectionId,
          confidence: li.aiConfidence ? Number(li.aiConfidence) : null,
        })),
    [estimate.lineItems],
  );

  const sectionsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of estimate.scopeSections) map.set(s.id, s.name);
    return map;
  }, [estimate.scopeSections]);

  if (lineAssumptions.length === 0) {
    return (
      <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
        No assumptions yet — generate a draft or flag lines that need review.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {lineAssumptions.map((a) => (
        <li
          key={a.lineItemId}
          className="border-b border-rule-soft px-4 py-3"
          data-testid="assumption-row"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {sectionsById.get(a.sectionId) ?? 'Section'}
            {a.confidence !== null ? (
              <>
                {' · '}
                <span className={confidenceClass(a.confidence)}>
                  {Math.round(a.confidence * 100)}% confidence
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1 font-sans text-[13px] text-ink">{a.description}</p>
          <p className="mt-1 border-l-2 border-mark-amber/70 pl-3 font-sans text-[12px] text-ink/80">
            {a.assumption}
          </p>
        </li>
      ))}
    </ul>
  );
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.85) return 'text-mark-green';
  if (confidence >= 0.6) return 'text-mark-amber';
  return 'text-mark-red';
}

// ─── Comments ─────────────────────────────────────────────────────────────

function CommentsPanel({
  estimate,
  readOnly,
}: {
  estimate: EstimateDetail;
  readOnly: boolean;
}) {
  const { user } = useAuthContext();
  const list = useComments(estimate.id);
  const create = useCreateComment(estimate.id);
  const resolve = useResolveComment(estimate.id);
  const remove = useDeleteComment(estimate.id);
  const [draft, setDraft] = useState('');

  const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const isReviewer = estimate.reviewerId === user?.id;

  if (list.isLoading) {
    return (
      <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
        Loading…
      </p>
    );
  }
  if (list.isError) {
    return (
      <p
        role="alert"
        className="m-4 border border-mark-red/60 bg-paper p-3 font-mono text-[10px] uppercase tracking-label text-mark-red"
      >
        {backendErrorMessage(list.error as AxiosError, 'Could not load comments.')}
      </p>
    );
  }
  const comments = list.data?.comments ?? [];

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || create.isPending) return;
    create.reset();
    try {
      await create.mutateAsync({ body });
      setDraft('');
    } catch {
      // banner shown inline below the form
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 overflow-auto">
        {comments.length === 0 ? (
          <li className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
            No comments yet.
          </li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className={`border-b border-rule-soft px-4 py-3 ${
                c.isResolved ? 'opacity-60' : ''
              }`}
              data-testid="comment-row"
              data-resolved={c.isResolved ? 'true' : 'false'}
            >
              <CommentRow
                comment={c}
                canResolve={
                  !readOnly &&
                  (c.author.id === user?.id || isReviewer || isAdmin)
                }
                canDelete={!readOnly && (c.author.id === user?.id || isAdmin)}
                onToggleResolved={() =>
                  resolve.mutate({ commentId: c.id, isResolved: !c.isResolved })
                }
                onDelete={() => remove.mutate({ commentId: c.id })}
              />
            </li>
          ))
        )}
      </ul>
      {!readOnly ? (
        <form
          onSubmit={onSubmit}
          className="border-t border-rule-soft bg-paper p-3 flex flex-col gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={create.isPending}
            rows={2}
            maxLength={4000}
            placeholder="Add a comment…"
            data-testid="comment-input"
            className="w-full border border-rule bg-paper-elevated px-3 py-2 font-sans text-[13px] text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {create.error ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {backendErrorMessage(create.error as AxiosError, 'Could not post comment.')}
            </p>
          ) : null}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={create.isPending || draft.trim().length === 0}
              data-testid="comment-submit"
              className="border border-ink bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {create.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CommentRow({
  comment,
  canResolve,
  canDelete,
  onToggleResolved,
  onDelete,
}: {
  comment: Comment;
  canResolve: boolean;
  canDelete: boolean;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        {comment.author.firstName} {comment.author.lastName} · {formatStamp(comment.createdAt)}
        {comment.isResolved ? ' · Resolved' : null}
      </p>
      <p className="font-sans text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
        {comment.body}
      </p>
      {canResolve || canDelete ? (
        <div className="flex items-center gap-3 pt-1">
          {canResolve ? (
            <button
              type="button"
              onClick={onToggleResolved}
              data-testid="comment-resolve"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              {comment.isResolved ? 'Reopen' : 'Resolve'}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              data-testid="comment-delete"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-mark-red"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────

function ActivityPanel({ estimate }: { estimate: EstimateDetail }) {
  const list = useActivity(estimate.id);
  if (list.isLoading) {
    return (
      <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
        Loading…
      </p>
    );
  }
  if (list.isError) {
    return (
      <p
        role="alert"
        className="m-4 border border-mark-red/60 bg-paper p-3 font-mono text-[10px] uppercase tracking-label text-mark-red"
      >
        {backendErrorMessage(list.error as AxiosError, 'Could not load activity.')}
      </p>
    );
  }
  const events = list.data?.events ?? [];
  if (events.length === 0) {
    return (
      <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
        No activity yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {events.map((e) => (
        <li
          key={e.id}
          className="border-b border-rule-soft px-4 py-3"
          data-testid="activity-row"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {actorLabel(e)} · {formatStamp(e.createdAt)} ·{' '}
            <span className="text-ink">{eventLabel(e.eventType)}</span>
          </p>
          <p className="mt-1 font-sans text-[12px] text-ink">{e.summary}</p>
        </li>
      ))}
    </ul>
  );
}

function actorLabel(e: ActivityEvent): string {
  if (!e.actor) return 'System';
  return `${e.actor.firstName} ${e.actor.lastName}`.trim() || e.actor.email;
}

function eventLabel(t: ActivityEventType): string {
  switch (t) {
    case 'ESTIMATE_SUBMITTED_FOR_REVIEW':
      return 'Submitted for review';
    case 'ESTIMATE_APPROVED':
      return 'Approved';
    case 'ESTIMATE_CHANGES_REQUESTED':
      return 'Changes requested';
    case 'ESTIMATE_SENT':
      return 'Sent';
    case 'ESTIMATE_WON':
      return 'Lease won';
    case 'ESTIMATE_LOST':
      return 'Lease lost';
    case 'ESTIMATE_REVISED':
      return 'Revised';
    case 'ESTIMATE_CREATED':
      return 'Created';
    case 'ESTIMATE_UPDATED':
      return 'Updated';
    case 'COMMENT_ADDED':
      return 'Comment added';
    case 'COMMENT_RESOLVED':
      return 'Comment resolved';
    case 'AI_RUN_SUCCEEDED':
      return 'AI run succeeded';
    case 'AI_RUN_FAILED':
      return 'AI run failed';
    case 'SOURCE_INPUT_ADDED':
      return 'Source added';
    case 'SOURCE_INPUT_REMOVED':
      return 'Source removed';
    case 'LINE_ITEM_CREATED':
      return 'Line added';
    case 'LINE_ITEM_UPDATED':
      return 'Line updated';
    case 'LINE_ITEM_DELETED':
      return 'Line deleted';
    case 'LINE_ITEM_FLAGGED':
      return 'Line flagged';
    default:
      return t.replace(/_/g, ' ').toLowerCase();
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}
