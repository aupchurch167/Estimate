/**
 * Axios HTTP client.
 *
 * Hits the backend at VITE_API_URL with credentials enabled so the auth
 * cookies travel automatically. On 401 from any non-auth endpoint we silently
 * call /api/auth/refresh once and retry the original request; if that also
 * fails we redirect to /login (skipping the redirect when the user is
 * already on a public auth page so we don't loop).
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { env } from './env';

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const api = axios.create({
  // Empty VITE_API_URL → relative requests (e.g. `/api/...`), which target the
  // same origin that served the app. Used in single-deployment mode where the
  // backend serves the built frontend.
  baseURL: env.VITE_API_URL || undefined,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const PUBLIC_PATHS = ['/login', '/signup', '/invite'];
function onPublicPage(): boolean {
  const path = window.location.pathname;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

const REFRESH_SKIP_PATTERNS = [/\/api\/auth\/refresh/, /\/api\/auth\/login/, /\/api\/auth\/signup/];
function shouldAttemptRefresh(url: string | undefined): boolean {
  if (!url) return false;
  return !REFRESH_SKIP_PATTERNS.some((re) => re.test(url));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;

    if (
      original &&
      !original._retry &&
      error.response?.status === 401 &&
      shouldAttemptRefresh(original.url)
    ) {
      original._retry = true;
      try {
        await api.post('/api/auth/refresh');
        return api(original);
      } catch (refreshErr) {
        if (!onPublicPage()) {
          window.location.assign('/login');
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);
