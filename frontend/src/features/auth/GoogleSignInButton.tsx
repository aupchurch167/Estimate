import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import type { AxiosError } from 'axios';
import { env } from '@/lib/env';
import { backendErrorCode, backendErrorMessage, useGoogleLogin } from './useAuth';

function mapGoogleError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 429 || code === 'rate_limited') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (code === 'no_account') {
    return 'No Quill account uses this Google email. Ask an admin to invite you first.';
  }
  if (code === 'google_email_unverified') {
    return 'That Google account has an unverified email. Verify it with Google and try again.';
  }
  if (code === 'google_not_configured') {
    return 'Google sign-in is not configured on the server.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return backendErrorMessage(err, 'Google sign-in failed. Please try again.');
}

/**
 * "Sign in with Google" button. Renders nothing unless VITE_GOOGLE_CLIENT_ID
 * is set, so the app degrades cleanly to email/password when Google isn't
 * configured. On success the backend sets the same auth cookies as a normal
 * login, so we just refetch the current user and navigate into the app.
 */
export function GoogleSignInButton() {
  const clientId = env.VITE_GOOGLE_CLIENT_ID;
  const navigate = useNavigate();
  const googleLogin = useGoogleLogin();
  const [error, setError] = useState<string | null>(null);

  if (!clientId) return null;

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border-primary" />
          <span className="text-[12px] uppercase tracking-wide text-text-secondary">or</span>
          <span className="h-px flex-1 bg-border-primary" />
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-light px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              setError(null);
              const credential = credentialResponse.credential;
              if (!credential) {
                setError('Google did not return a credential. Please try again.');
                return;
              }
              try {
                await googleLogin.mutateAsync({ credential });
                navigate('/app', { replace: true });
              } catch (err) {
                setError(mapGoogleError(err as AxiosError));
              }
            }}
            onError={() => {
              setError('Google sign-in was cancelled or failed. Please try again.');
            }}
            width="320"
          />
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
