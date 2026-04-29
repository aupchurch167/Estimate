import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from './useNotifications';
import type { AppNotification, NotificationType } from './types';

/**
 * Header bell with an unread count badge. Clicking opens a dropdown that
 * lists the most recent notifications. Entries that point at an estimate
 * navigate there on click; all clicked entries are marked read.
 *
 * Click-outside closes the panel; Esc also closes it.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const list = useNotifications({ enabled: open, limit: 20 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unread.data?.unreadCount ?? 0;
  const items = list.data?.notifications ?? [];

  // Click-outside + Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onItemClick = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.entityType === 'Estimate' && n.entityId) {
      navigate(`/app/estimates/${n.entityId}`);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="Notifications"
        data-testid="notification-bell"
        className="relative border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-label text-dim hover:border-ink hover:text-ink"
      >
        Inbox
        {count > 0 ? (
          <span
            data-testid="notification-badge"
            className="ml-1 inline-flex min-w-[18px] items-center justify-center border border-mark-red bg-mark-red px-1 text-[10px] font-mono text-ink-inverse"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications panel"
          data-testid="notification-panel"
          className="absolute right-0 z-30 mt-2 w-[360px] border border-ink bg-paper-elevated shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              Notifications
            </p>
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={count === 0 || markAllRead.isPending}
              data-testid="notification-read-all"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
            </button>
          </header>
          {list.isLoading ? (
            <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="p-4 font-mono text-[10px] uppercase tracking-label text-dim">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-[420px] overflow-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-rule-soft last:border-b-0 ${
                    n.readAt ? '' : 'bg-paper'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onItemClick(n)}
                    data-testid="notification-item"
                    data-unread={n.readAt ? 'false' : 'true'}
                    className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-paper"
                  >
                    <p className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-label text-dim">
                      <span>{labelForType(n.type)}</span>
                      <span>{formatStamp(n.createdAt)}</span>
                    </p>
                    <p
                      className={`font-sans text-[13px] ${
                        n.readAt ? 'text-dim' : 'text-ink'
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="font-sans text-[12px] text-dim line-clamp-2">{n.body}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function labelForType(t: NotificationType): string {
  switch (t) {
    case 'ESTIMATE_ASSIGNED':
      return 'Reviewer assigned';
    case 'REVIEW_REQUESTED':
      return 'Review requested';
    case 'REVIEW_APPROVED':
      return 'Approved';
    case 'REVIEW_CHANGES_REQUESTED':
      return 'Changes requested';
    case 'COMMENT_MENTION':
      return 'Comment';
    case 'ESTIMATE_WON':
      return 'Won';
    case 'ESTIMATE_LOST':
      return 'Lost';
    case 'AI_RUN_FAILED':
      return 'AI run failed';
    case 'INVITATION_ACCEPTED':
      return 'Invitation accepted';
    default:
      return t;
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
