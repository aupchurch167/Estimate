import { useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
} from '@/features/auth/useAuth';
import type { EstimateDetail } from '@/features/estimates/types';
import { useUsers } from '@/features/team/useTeam';
import type { SafeUser } from '@/features/auth/types';
import {
  useActivity,
  useComments,
  useCreateComment,
  useCreateExport,
  useDeleteComment,
  useEditComment,
  useResolveComment,
  useSnapshots,
  type SnapshotMeta,
} from './useReviewWorkspace';
import type {
  ActivityEvent,
  ActivityEventType,
  Comment,
} from './types';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

// ─── Comments ─────────────────────────────────────────────────────────────

interface ThreadedComment {
  parent: Comment;
  replies: Comment[];
}

function buildThreads(flat: Comment[]): ThreadedComment[] {
  const parents = flat.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of flat) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }
  for (const list of repliesByParent.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return parents.map((p) => ({
    parent: p,
    replies: repliesByParent.get(p.id) ?? [],
  }));
}

export function CommentsPanel({
  estimate,
  readOnly,
}: {
  estimate: EstimateDetail;
  readOnly: boolean;
}) {
  const { user } = useAuthContext();
  const list = useComments(estimate.id);
  const orgUsers = useUsers();
  const create = useCreateComment(estimate.id);
  const resolve = useResolveComment(estimate.id);
  const remove = useDeleteComment(estimate.id);
  const edit = useEditComment(estimate.id);

  const members = useMemo(
    () => (orgUsers.data ?? []).filter((u) => u.id !== user?.id && u.isActive),
    [orgUsers.data, user?.id],
  );

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
  const threads = buildThreads(comments);

  const submit = async (input: {
    body: string;
    mentions: string[];
    parentCommentId?: string | null;
  }) => {
    create.reset();
    await create.mutateAsync({
      body: input.body,
      mentions: input.mentions,
      parentCommentId: input.parentCommentId ?? null,
    });
  };

  return (
    <div className="flex h-full flex-col">
      {!readOnly ? (
        <CommentComposer
          members={members}
          isPending={create.isPending}
          error={create.error as AxiosError | null}
          onSubmit={async (body, mentions) =>
            submit({ body, mentions, parentCommentId: null })
          }
          placeholder="Add a comment…"
          submitLabel="Post"
          testId="comment-input"
          submitTestId="comment-submit"
        />
      ) : null}
      <ul className="flex-1 overflow-auto">
        {threads.length === 0 ? (
          <li className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
            No comments yet.
          </li>
        ) : (
          threads.map((t) => (
            <li
              key={t.parent.id}
              className={`border-b border-rule-soft px-4 py-3 ${
                t.parent.isResolved ? 'opacity-60' : ''
              }`}
              data-testid="comment-row"
              data-resolved={t.parent.isResolved ? 'true' : 'false'}
            >
              <CommentRow
                comment={t.parent}
                meId={user?.id ?? null}
                isAdmin={isAdmin}
                isReviewer={isReviewer}
                readOnly={readOnly}
                members={members}
                onToggleResolved={() =>
                  resolve.mutate({
                    commentId: t.parent.id,
                    isResolved: !t.parent.isResolved,
                  })
                }
                onDelete={() => remove.mutate({ commentId: t.parent.id })}
                onSubmitReply={async (body, mentions) =>
                  submit({ body, mentions, parentCommentId: t.parent.id })
                }
                onEdit={async (body, mentions) =>
                  edit.mutateAsync({ commentId: t.parent.id, body, mentions })
                }
                editError={
                  edit.error && edit.variables?.commentId === t.parent.id
                    ? (edit.error as AxiosError)
                    : null
                }
              />
              {t.replies.length > 0 ? (
                <ul
                  className="mt-2 ml-4 flex flex-col border-l border-rule-soft pl-3"
                  data-testid={`comment-replies-${t.parent.id}`}
                >
                  {t.replies.map((r) => (
                    <li key={r.id} className="py-2" data-testid="comment-reply">
                      <CommentRow
                        comment={r}
                        meId={user?.id ?? null}
                        isAdmin={isAdmin}
                        isReviewer={isReviewer}
                        readOnly={readOnly}
                        members={members}
                        onToggleResolved={null}
                        onDelete={() => remove.mutate({ commentId: r.id })}
                        onSubmitReply={null}
                        onEdit={async (body, mentions) =>
                          edit.mutateAsync({ commentId: r.id, body, mentions })
                        }
                        editError={
                          edit.error && edit.variables?.commentId === r.id
                            ? (edit.error as AxiosError)
                            : null
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

interface CommentRowProps {
  comment: Comment;
  meId: string | null;
  isAdmin: boolean;
  isReviewer: boolean;
  readOnly: boolean;
  members: SafeUser[];
  onToggleResolved: (() => void) | null;
  onDelete: () => void;
  onSubmitReply: ((body: string, mentions: string[]) => Promise<void>) | null;
  onEdit: (body: string, mentions: string[]) => Promise<unknown>;
  editError: AxiosError | null;
}

function CommentRow({
  comment,
  meId,
  isAdmin,
  isReviewer,
  readOnly,
  members,
  onToggleResolved,
  onDelete,
  onSubmitReply,
  onEdit,
  editError,
}: CommentRowProps) {
  const isMine = comment.author.id === meId;
  const canResolve =
    !readOnly &&
    onToggleResolved !== null &&
    (isMine || isReviewer || isAdmin);
  const canDelete = !readOnly && (isMine || isAdmin);
  const editable = !readOnly && isMine && withinEditWindow(comment.createdAt);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        {comment.author.firstName} {comment.author.lastName} · {formatStamp(comment.createdAt)}
        {comment.lastEditedAt ? ' · edited' : null}
        {comment.isResolved ? ' · Resolved' : null}
      </p>
      {editing ? (
        <CommentComposer
          initialBody={comment.body}
          members={members}
          isPending={false}
          error={editError}
          onSubmit={async (body, mentions) => {
            await onEdit(body, mentions);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          testId="comment-edit-input"
          submitTestId="comment-edit-submit"
          autoFocus
        />
      ) : (
        <CommentBody body={comment.body} />
      )}
      {!editing ? (
        <div className="flex items-center gap-3 pt-1">
          {canResolve ? (
            <button
              type="button"
              onClick={onToggleResolved ?? undefined}
              data-testid="comment-resolve"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              {comment.isResolved ? 'Reopen' : 'Resolve'}
            </button>
          ) : null}
          {!readOnly && onSubmitReply ? (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              data-testid="comment-reply-toggle"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              {replying ? 'Cancel' : 'Reply'}
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              data-testid="comment-edit"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Edit
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
      {replying && onSubmitReply ? (
        <div className="mt-2">
          <CommentComposer
            members={members}
            isPending={false}
            error={null}
            onSubmit={async (body, mentions) => {
              await onSubmitReply(body, mentions);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
            placeholder="Reply…"
            submitLabel="Reply"
            testId="comment-reply-input"
            submitTestId="comment-reply-submit"
            autoFocus
          />
        </div>
      ) : null}
    </div>
  );
}

interface CommentComposerProps {
  initialBody?: string;
  members: SafeUser[];
  isPending: boolean;
  error: AxiosError | null;
  onSubmit: (body: string, mentions: string[]) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel: string;
  testId: string;
  submitTestId: string;
  autoFocus?: boolean;
}

function CommentComposer({
  initialBody = '',
  members,
  isPending,
  error,
  onSubmit,
  onCancel,
  placeholder = 'Add a comment…',
  submitLabel,
  testId,
  submitTestId,
  autoFocus,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [mentions, setMentions] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const onPickMention = (u: SafeUser) => {
    const token = `@${u.firstName}`;
    const ta = textareaRef.current;
    const insertAt = ta?.selectionStart ?? body.length;
    const before = body.slice(0, insertAt);
    const after = body.slice(insertAt);
    const sep = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const next = `${before}${sep}${token} ${after}`;
    setBody(next);
    setMentions((prev) => new Set(prev).add(u.id));
    setPickerOpen(false);
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await onSubmit(trimmed, Array.from(mentions));
      setBody('');
      setMentions(new Set());
    } catch {
      // banner displays the error
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-rule-soft bg-paper p-3 flex flex-col gap-2"
    >
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isPending}
        rows={2}
        maxLength={4000}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full border border-rule bg-paper-elevated px-3 py-2 font-sans text-[13px] text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {pickerOpen && members.length > 0 ? (
        <ul
          data-testid="mention-picker"
          className="max-h-40 overflow-auto border border-rule bg-paper-elevated"
        >
          {members.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPickMention(u)}
                data-testid={`mention-pick-${u.id}`}
                className="flex w-full items-baseline justify-between px-3 py-1 text-left font-sans text-[12px] text-ink hover:bg-paper"
              >
                <span>
                  {u.firstName} {u.lastName}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-dim">
                  {u.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {mapCommentEditError(error)}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={members.length === 0}
          data-testid="mention-toggle"
          className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-label text-dim hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pickerOpen ? 'Close mentions' : 'Mention…'}
        </button>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              data-testid="composer-cancel"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            data-testid={submitTestId}
            className="border border-ink bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Posting…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

const MENTION_TOKEN_RE = /(@\w[\w.-]*)/g;

function CommentBody({ body }: { body: string }) {
  // Highlight any @token without trying to verify it resolves — the mention
  // notifications already went through; this is purely visual.
  const parts = body.split(MENTION_TOKEN_RE);
  return (
    <p className="font-sans text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
      {parts.map((part, i) =>
        MENTION_TOKEN_RE.test(part) ? (
          <span key={i} className="text-ink font-medium" data-testid="mention-token">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function withinEditWindow(createdAtIso: string): boolean {
  const t = Date.parse(createdAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < EDIT_WINDOW_MS;
}

function mapCommentEditError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'edit_window_expired') {
    return 'The 15-minute edit window has passed.';
  }
  return backendErrorMessage(err, 'Could not post.');
}

// ─── Versions ─────────────────────────────────────────────────────────────

export function VersionsPanel({ estimate }: { estimate: EstimateDetail }) {
  const list = useSnapshots(estimate.id);
  const create = useCreateExport(estimate.id);
  const [pendingId, setPendingId] = useState<string | null>(null);

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
        {backendErrorMessage(list.error as AxiosError, 'Could not load versions.')}
      </p>
    );
  }
  const snapshots = list.data?.snapshots ?? [];
  if (snapshots.length === 0) {
    return (
      <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
        No versions yet — approve or send the estimate to take its first snapshot.
      </p>
    );
  }

  const onDownload = async (snap: SnapshotMeta) => {
    setPendingId(snap.id);
    create.reset();
    try {
      const result = await create.mutateAsync({ snapshotId: snap.id });
      if (typeof window !== 'undefined') {
        window.open(result.downloadUrl, '_blank', 'noopener');
      }
    } finally {
      setPendingId(null);
    }
  };

  const errorMsg = create.error
    ? mapVersionExportError(create.error as AxiosError)
    : null;

  return (
    <div className="flex flex-col">
      {errorMsg ? (
        <p
          role="alert"
          className="m-3 border border-mark-red/60 bg-paper p-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {errorMsg}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {snapshots.map((s) => (
          <li
            key={s.id}
            data-testid="version-row"
            data-snapshot-type={s.snapshotType}
            className="border-b border-rule-soft px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                v{s.sequence} · {labelSnapshotType(s.snapshotType)}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                {formatStamp(s.createdAt)}
              </p>
            </div>
            <p className="mt-1 font-mono text-[12px] tabular-nums text-ink">
              {formatMoney(s.totalSellPrice)}
            </p>
            <button
              type="button"
              onClick={() => onDownload(s)}
              disabled={pendingId === s.id}
              data-testid={`version-download-${s.id}`}
              className="mt-2 border border-rule px-3 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingId === s.id ? 'Preparing…' : 'Download PDF'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelSnapshotType(t: 'APPROVAL' | 'SEND' | 'REVISION'): string {
  switch (t) {
    case 'APPROVAL':
      return 'Approved';
    case 'SEND':
      return 'Sent to client';
    case 'REVISION':
      return 'Revision';
    default:
      return t;
  }
}

function formatMoney(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mapVersionExportError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'no_snapshot_to_export') {
    return 'No snapshot to export — approve the estimate first.';
  }
  if (code === 'unsupported_export_format') {
    return 'That export format is not supported yet.';
  }
  return backendErrorMessage(err, 'Could not export PDF.');
}

// ─── Activity ─────────────────────────────────────────────────────────────

export function ActivityPanel({ estimate }: { estimate: EstimateDetail }) {
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
      return 'Won';
    case 'ESTIMATE_LOST':
      return 'Lost';
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
