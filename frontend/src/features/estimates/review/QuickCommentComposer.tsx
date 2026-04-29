import { useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { Avatar, Button, Textarea } from '@/components/ui';
import { useAuthContext } from '@/context/useAuthContext';
import { useCreateComment } from './useReviewWorkspace';

interface QuickCommentComposerProps {
  estimateId: string;
}

/**
 * Top-of-review comment composer (Phase 8.1 layout).
 *
 * Lets the reviewer drop a comment without scrolling to the right
 * rail. Posts a flat comment (no parent / line attachment); for
 * threaded replies + line-attached comments the user can still use
 * the comments tab in the right rail.
 */
export function QuickCommentComposer({ estimateId }: QuickCommentComposerProps) {
  const { user } = useAuthContext();
  const create = useCreateComment(estimateId);
  const [body, setBody] = useState('');

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !create.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.reset();
    try {
      await create.mutateAsync({ body: trimmed });
      setBody('');
    } catch {
      // banner displays the error
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      data-testid="quick-comment-composer"
      className="flex flex-col gap-2"
    >
      <div className="flex gap-3">
        <div className="flex-none pt-1">
          <Avatar
            name={user ? `${user.firstName} ${user.lastName}` : 'You'}
            size="sm"
            src={user?.avatarUrl}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a comment for the team…"
            rows={2}
            maxLength={4000}
            disabled={create.isPending}
            data-testid="quick-comment-input"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {create.error ? (
          <p role="alert" className="text-[12px] text-danger">
            {backendErrorMessage(create.error as AxiosError, 'Could not post comment.')}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          loading={create.isPending}
          data-testid="quick-comment-submit"
        >
          Post comment
        </Button>
      </div>
    </form>
  );
}
