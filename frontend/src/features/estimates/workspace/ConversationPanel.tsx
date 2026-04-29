import { useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import {
  conversationKey,
  useApplyConversationActions,
  useAskFollowup,
  useConversation,
  useGenerateLineItems,
} from '@/features/estimates/conversation/useConversation';
import type {
  AIMessage,
  AIRun,
  GenerateLineItemsOutput,
  ProposedAction,
} from '@/features/estimates/conversation/types';
import type { EstimateDetail } from '@/features/estimates/types';
import { useAuthContext } from '@/context/useAuthContext';
import { useQueryClient } from '@tanstack/react-query';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

export function ConversationPanel({ estimate }: { estimate: EstimateDetail }) {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const { data, isLoading } = useConversation(estimate.id);
  const generate = useGenerateLineItems(estimate.id);
  const ask = useAskFollowup(estimate.id);
  const applyActions = useApplyConversationActions(estimate.id);
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const [draft, setDraft] = useState('');
  const sectionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of estimate.scopeSections) m.set(s.id, s.name);
    return m;
  }, [estimate.scopeSections]);
  const lineDescriptionsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const li of estimate.lineItems) m.set(li.id, li.description);
    return m;
  }, [estimate.lineItems]);

  const messages = data?.messages ?? [];
  const runById = useMemo(() => {
    const runs = data?.runs ?? [];
    return new Map(runs.map((r) => [r.id, r]));
  }, [data?.runs]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== 'function') return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages.length, generate.isPending, ask.isPending]);

  const isEmpty = !isLoading && messages.length === 0;
  const banner = generate.error
    ? mapGenerateError(generate.error as AxiosError)
    : ask.error
      ? mapAskError(ask.error as AxiosError)
      : null;

  // Optimistic re-fetch handle for the manual retry button.
  const onGenerate = async () => {
    await generate.mutateAsync().catch(() => {});
    qc.invalidateQueries({ queryKey: conversationKey(estimate.id) });
  };

  const onSubmitFollowup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || ask.isPending || readOnly) return;
    ask.reset();
    try {
      await ask.mutateAsync(text);
      setDraft('');
    } catch {
      // banner surfaces the error; preserve the draft so the user can retry.
    }
  };

  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="flex items-baseline justify-between border-b border-rule-soft px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            B · Draft Session
          </p>
          <p className="mt-1 font-sans text-[12px] text-dim">
            Generate + refine line items with Quill
          </p>
        </div>
        {!isEmpty && !readOnly ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generate.isPending}
            className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-dim hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generate.isPending ? 'Drafting…' : 'Regenerate'}
          </button>
        ) : null}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4">
        {banner ? (
          <div className="mb-4">
            <ErrorBubble message={banner} onRetry={onGenerate} />
          </div>
        ) : null}
        {isLoading ? (
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
        ) : isEmpty ? (
          <EmptyState
            disabled={generate.isPending || readOnly}
            pending={generate.isPending}
            onClick={onGenerate}
            hasSources={estimate.sourceInputs.length > 0}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id}>
                <MessageBubble
                  message={m}
                  run={m.runId ? runById.get(m.runId) : undefined}
                  authorIsMe={m.authorUserId === user?.id}
                  onRegenerate={!readOnly && !generate.isPending ? onGenerate : null}
                  sectionNamesById={sectionNamesById}
                  lineDescriptionsById={lineDescriptionsById}
                  onApplyActions={
                    !readOnly && m.runId
                      ? () => applyActions.mutateAsync(m.runId!).catch(() => {})
                      : null
                  }
                  applyPending={applyActions.isPending}
                  applyError={applyActions.error as AxiosError | null}
                  pendingRunId={applyActions.variables ?? null}
                />
              </li>
            ))}
            {generate.isPending || ask.isPending ? (
              <li>
                <Pending />
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <footer className="border-t border-rule-soft px-4 py-3">
        <FollowupForm
          value={draft}
          onChange={setDraft}
          onSubmit={onSubmitFollowup}
          disabled={readOnly || generate.isPending}
          pending={ask.isPending}
        />
      </footer>
    </section>
  );
}

interface FollowupFormProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
  pending: boolean;
}

function FollowupForm({ value, onChange, onSubmit, disabled, pending }: FollowupFormProps) {
  const trimmed = value.trim();
  const sendDisabled = disabled || pending || trimmed.length === 0;
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={disabled ? 'Conversation locked' : 'Ask a follow-up…'}
        disabled={disabled || pending}
        maxLength={2000}
        data-testid="followup-input"
        className="flex-1 border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={sendDisabled}
        data-testid="followup-send"
        className="border border-ink bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

// ─── Components ───────────────────────────────────────────────────────────

interface EmptyStateProps {
  hasSources: boolean;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}

function EmptyState({ hasSources, disabled, pending, onClick }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">Draft an estimate</p>
      <h2 className="mt-2 max-w-[40ch] font-sans text-[18px] text-ink">
        {hasSources
          ? "Quill will produce an 80% first-draft from your sources. You'll review and finalize."
          : 'Add at least one source on the left, then ask Quill to draft an estimate.'}
      </h2>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !hasSources}
        title={!hasSources ? 'Add a source on the left first' : ''}
        data-testid="generate-draft"
        className="mt-6 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Drafting…' : 'Generate draft'}
      </button>
    </div>
  );
}

interface MessageBubbleProps {
  message: AIMessage;
  run: AIRun | undefined;
  authorIsMe: boolean;
  /** Re-run GENERATE_LINE_ITEMS. null when the action is not allowed
   * (read-only estimate, generation already in flight). */
  onRegenerate: (() => void) | null;
  sectionNamesById: Map<string, string>;
  lineDescriptionsById: Map<string, string>;
  onApplyActions: (() => void) | null;
  applyPending: boolean;
  applyError: AxiosError | null;
  pendingRunId: string | null;
}

function MessageBubble({
  message,
  run,
  authorIsMe,
  onRegenerate,
  sectionNamesById,
  lineDescriptionsById,
  onApplyActions,
  applyPending,
  applyError,
  pendingRunId,
}: MessageBubbleProps) {
  const isUser = message.role === 'USER';
  const stamp = formatStamp(message.createdAt);
  const askOutputs =
    run?.status === 'SUCCEEDED' && run.runType === 'ASK_FOLLOWUP'
      ? (run.outputs as {
          suggestedAction?: string;
          proposedActions?: ProposedAction[];
        } | null)
      : null;
  const followupSuggested =
    askOutputs?.suggestedAction === 'regenerate_line_items';
  const proposedActions = askOutputs?.proposedActions ?? [];
  const runInputs = (run?.inputs ?? null) as { actionsAppliedAt?: string } | null;
  const alreadyApplied = Boolean(runInputs?.actionsAppliedAt);

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-label text-dim">
        {(authorIsMe ? 'You' : labelRole(message.role))} · {stamp}
      </p>
      <div
        className={`max-w-[80%] border ${
          isUser
            ? 'border-ink bg-ink text-ink-inverse'
            : 'border-rule bg-paper text-ink'
        } px-4 py-2 font-sans text-[13px] leading-relaxed`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {run?.status === 'SUCCEEDED' &&
        run.runType === 'GENERATE_LINE_ITEMS' &&
        run.outputs ? (
          <RunSummary output={run.outputs as GenerateLineItemsOutput} />
        ) : null}
        {proposedActions.length > 0 ? (
          <ProposedActionsCard
            actions={proposedActions}
            sectionNamesById={sectionNamesById}
            lineDescriptionsById={lineDescriptionsById}
            alreadyApplied={alreadyApplied}
            onApply={onApplyActions}
            isApplying={applyPending && pendingRunId === run?.id}
            error={
              applyError && pendingRunId === run?.id ? applyError : null
            }
          />
        ) : null}
        {followupSuggested && onRegenerate ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onRegenerate}
              data-testid="followup-regenerate"
              className="border border-ink bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-ink/90"
            >
              Re-draft now
            </button>
            <span className="font-mono text-[10px] uppercase tracking-label text-dim">
              Quill suggests regenerating
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ProposedActionsCardProps {
  actions: ProposedAction[];
  sectionNamesById: Map<string, string>;
  lineDescriptionsById: Map<string, string>;
  alreadyApplied: boolean;
  onApply: (() => void) | null;
  isApplying: boolean;
  error: AxiosError | null;
}

function ProposedActionsCard({
  actions,
  sectionNamesById,
  lineDescriptionsById,
  alreadyApplied,
  onApply,
  isApplying,
  error,
}: ProposedActionsCardProps) {
  const errorText = error ? mapApplyError(error) : null;
  return (
    <div
      data-testid="proposed-actions"
      className="mt-3 border border-dashed border-mark-amber/70 bg-paper-elevated p-2"
    >
      <p className="font-mono text-[10px] uppercase tracking-label text-mark-amber">
        Quill proposes
      </p>
      <ul className="mt-1 ml-4 list-disc font-sans text-[12px] text-ink">
        {actions.map((a, i) => (
          <li key={i}>
            {describeAction(a, sectionNamesById, lineDescriptionsById)}
          </li>
        ))}
      </ul>
      {alreadyApplied ? (
        <p
          data-testid="proposed-actions-applied"
          className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim"
        >
          Applied
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onApply ?? undefined}
            disabled={!onApply || isApplying}
            data-testid="apply-proposed-actions"
            className="border border-ink bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? 'Applying…' : 'Apply'}
          </button>
          {errorText ? (
            <span
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {errorText}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function describeAction(
  a: ProposedAction,
  sectionNamesById: Map<string, string>,
  lineDescriptionsById: Map<string, string>,
): string {
  switch (a.type) {
    case 'ADD_LINE_ITEM': {
      const section = sectionNamesById.get(a.scopeSectionId) ?? a.scopeSectionId;
      return `Add to "${section}": ${a.description} — ${a.quantity} ${a.unitOfMeasure}`;
    }
    case 'UPDATE_LINE_ITEM': {
      const target = lineDescriptionsById.get(a.lineItemId) ?? a.lineItemId;
      const fields: string[] = [];
      if (a.description !== undefined) fields.push(`description → "${a.description}"`);
      if (a.quantity !== undefined) fields.push(`qty → ${a.quantity}`);
      if (a.unitOfMeasure !== undefined) fields.push(`UoM → ${a.unitOfMeasure}`);
      return `Update "${target}": ${fields.join(', ') || 'no changes'}`;
    }
    case 'REMOVE_LINE_ITEM': {
      const target = lineDescriptionsById.get(a.lineItemId) ?? a.lineItemId;
      return `Remove "${target}"`;
    }
    case 'ADD_SECTION':
      return `Add section "${a.name}"`;
  }
}

function mapApplyError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'actions_already_applied') return 'Already applied.';
  if (code === 'cannot_edit_in_current_status') return 'Estimate is locked.';
  if (code === 'unknown_line_item' || code === 'unknown_section') {
    return 'Referenced item is gone — ask Quill again.';
  }
  return backendErrorMessage(err, 'Could not apply.');
}

function RunSummary({ output }: { output: GenerateLineItemsOutput }) {
  const totalLines = output.sections.reduce((acc, s) => acc + s.lineItems.length, 0);
  const unpriced = output.sections.reduce(
    (acc, s) => acc + s.lineItems.filter((li) => li.priceBookEntryCode === null).length,
    0,
  );
  return (
    <div className="mt-3 flex flex-col gap-2">
      {output.assumptions.length > 0 ? (
        <div className="border border-dashed border-mark-amber/70 bg-paper-elevated p-2">
          <p className="font-mono text-[10px] uppercase tracking-label text-mark-amber">
            Assumptions
          </p>
          <ul className="mt-1 ml-4 list-disc font-sans text-[12px] text-ink">
            {output.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="font-mono text-[10px] uppercase tracking-label text-dim tabular-nums">
        {totalLines} {totalLines === 1 ? 'line' : 'lines'} ·{' '}
        {output.sections.length} {output.sections.length === 1 ? 'section' : 'sections'}
        {unpriced > 0 ? (
          <>
            {' '}
            ·{' '}
            <span className="text-mark-red">
              {unpriced} unpriced
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function Pending() {
  return (
    <div className="flex flex-col items-start">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-label text-dim">
        Quill · drafting…
      </p>
      <div className="border border-rule bg-paper px-4 py-2 font-mono text-[12px] text-dim">
        <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-dim" />{' '}
        <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-dim" />{' '}
        <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-dim" />
      </div>
    </div>
  );
}

function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
        Quill · error
      </p>
      <div
        role="alert"
        className="border border-mark-red/60 bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red"
      >
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="border border-rule px-3 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
      >
        Retry
      </button>
    </div>
  );
}

function labelRole(role: string): string {
  switch (role) {
    case 'USER':
      return 'You';
    case 'ASSISTANT':
      return 'Quill';
    case 'SYSTEM':
      return 'System';
    default:
      return role;
  }
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapGenerateError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  const upstream = mapAiUpstreamError(code);
  if (upstream) return upstream;
  if (code === 'monthly_ai_limit_reached') {
    return 'Monthly AI cost cap reached. Contact an admin to raise the cap.';
  }
  if (code === 'no_default_pricebook') {
    return 'No default price book set. An admin needs to mark a price book as default in /app/pricing.';
  }
  if (code === 'cannot_edit_in_current_status') {
    return 'Cannot draft while the estimate is locked.';
  }
  if (status === 403) {
    return 'Your role cannot trigger AI generation.';
  }
  return backendErrorMessage(err, 'Could not generate draft.');
}

function mapAskError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  const upstream = mapAiUpstreamError(code);
  if (upstream) return upstream;
  if (code === 'monthly_ai_limit_reached') {
    return 'Monthly AI cost cap reached. Contact an admin to raise the cap.';
  }
  if (code === 'cannot_edit_in_current_status') {
    return 'Cannot reply while the estimate is locked.';
  }
  if (status === 403) {
    return 'Your role cannot send follow-ups.';
  }
  return backendErrorMessage(err, 'Could not send the follow-up.');
}

/**
 * Shared mapping for the typed AiUpstreamError codes the backend
 * surfaces from Anthropic. Returns null when the code isn't one of
 * ours so the caller can fall through to its own defaults.
 */
function mapAiUpstreamError(code: string | null): string | null {
  switch (code) {
    case 'ai_invalid_api_key':
      return 'AI key invalid — an admin needs to update ANTHROPIC_API_KEY and restart the backend.';
    case 'ai_permission_denied':
      return 'AI key lacks access to the requested model. Check Anthropic console or pick a different model.';
    case 'ai_model_not_found':
      return 'Requested AI model not found. Check AI_MODEL_PRIMARY / AI_MODEL_LIGHT in the backend env.';
    case 'ai_rate_limited':
      return 'Anthropic rate-limited that request — wait a moment and retry.';
    case 'ai_rate_limited_local':
      return 'You are running AI requests too quickly — wait a moment and retry.';
    case 'ai_overloaded':
      return 'Anthropic is temporarily overloaded — try again shortly.';
    case 'ai_temporary_failure':
      return 'Anthropic returned a temporary error — try again shortly.';
    case 'ai_network_error':
      return 'Could not reach Anthropic — check the backend’s network connection.';
    default:
      return null;
  }
}
