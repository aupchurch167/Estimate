import './lib/env';
import { initSentry } from './lib/sentry';
import { StrictMode } from 'react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui';

// Sentry must init before the React tree mounts so it can catch
// errors thrown during initial render. No-ops when VITE_SENTRY_DSN is
// empty (dev / preview builds).
initSentry();

// Accessibility audit (Phase 8.4) — load @axe-core/react in dev only.
// It runs after every render and logs WCAG-A/AA violations to the
// console with a stack trace pointing at the offending element. Zero
// runtime cost in production builds (Vite dead-strips the import).
if (import.meta.env.DEV) {
  void import('@axe-core/react').then(({ default: axe }) => {
    axe(React, ReactDOM, 1000);
  });
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
