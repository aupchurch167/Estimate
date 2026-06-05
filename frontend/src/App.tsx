import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/Login';
import { SignupPage } from '@/pages/Signup';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicRoute } from '@/components/PublicRoute';

// Heavier authenticated views are code-split so first paint of /login
// (the only route an unauthenticated visitor sees) doesn't have to ship
// the workspace, dashboard, AI panels, or admin settings. Each becomes
// a separate chunk that loads on first navigation.
const AppShell = lazy(() =>
  import('@/pages/AppShell').then((m) => ({ default: m.AppShell })),
);
const AccountPage = lazy(() =>
  import('@/pages/Account').then((m) => ({ default: m.AccountPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })),
);
const TeamPage = lazy(() =>
  import('@/pages/Team').then((m) => ({ default: m.TeamPage })),
);
const PricingPage = lazy(() =>
  import('@/pages/Pricing').then((m) => ({ default: m.PricingPage })),
);
const EstimatesPage = lazy(() =>
  import('@/pages/Estimates').then((m) => ({ default: m.EstimatesPage })),
);
const EstimateWorkspace = lazy(() =>
  import('@/pages/EstimateWorkspace').then((m) => ({ default: m.EstimateWorkspace })),
);
const InvitationAcceptPage = lazy(() =>
  import('@/pages/InvitationAccept').then((m) => ({
    default: m.InvitationAcceptPage,
  })),
);
const BidPackagesPage = lazy(() =>
  import('@/pages/BidPackages').then((m) => ({ default: m.BidPackagesPage })),
);
const BidPackageDetailPage = lazy(() =>
  import('@/pages/BidPackageDetail').then((m) => ({ default: m.BidPackageDetailPage })),
);
const BidPortalPage = lazy(() =>
  import('@/pages/BidPortal').then((m) => ({ default: m.BidPortalPage })),
);

function RouteFallback() {
  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <SignupPage />
            </PublicRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/team"
          element={
            <ProtectedRoute>
              <TeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/pricing"
          element={
            <ProtectedRoute>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/estimates"
          element={
            <ProtectedRoute>
              <EstimatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/estimates/:id"
          element={
            <ProtectedRoute>
              <EstimateWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/bid-packages"
          element={
            <ProtectedRoute>
              <BidPackagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/bid-packages/:id"
          element={
            <ProtectedRoute>
              <BidPackageDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="/bid/:token" element={<BidPortalPage />} />
        <Route path="/invite/:token" element={<InvitationAcceptPage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  );
}
