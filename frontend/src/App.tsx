import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/Login';
import { SignupPage } from '@/pages/Signup';
import { AppShell } from '@/pages/AppShell';
import { AccountPage } from '@/pages/Account';
import { SettingsPage } from '@/pages/Settings';
import { TeamPage } from '@/pages/Team';
import { PricingPage } from '@/pages/Pricing';
import { EstimatesPage } from '@/pages/Estimates';
import { EstimateWorkspace } from '@/pages/EstimateWorkspace';
import { InvitationAcceptPage } from '@/pages/InvitationAccept';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicRoute } from '@/components/PublicRoute';

export default function App() {
  return (
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
      <Route path="/invite/:token" element={<InvitationAcceptPage />} />
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
