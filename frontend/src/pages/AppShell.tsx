import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { AppHeader } from '@/components/AppHeader';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { useShortcut, useShortcutSequence } from '@/hooks/useShortcut';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { TitleBlock } from '@/components/ui';

export function AppShell() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // App-wide keyboard shortcuts (Phase 8.3).
  useShortcut('?', () => setShortcutsOpen(true));
  useShortcutSequence('g d', () => navigate('/app'));
  useShortcutSequence('g e', () => navigate('/app/estimates'));

  return (
    <div className="min-h-screen bg-bg-secondary">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <AppHeader />
      <main id="main" className="mx-auto max-w-[1280px] px-6 py-6" tabIndex={-1}>
        <TitleBlock
          title={user ? `Welcome back, ${user.firstName}.` : 'Welcome to Quill.'}
          subtitle="Here's what's happening across your pipeline."
          noBorder
          className="mb-6 pb-0"
        />
        <Dashboard />
      </main>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
