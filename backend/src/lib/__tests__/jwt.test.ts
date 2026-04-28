import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../jwt.js';
import { env } from '../env.js';

describe('JWT helpers', () => {
  it('access token round-trip preserves payload', () => {
    const token = signAccessToken({ sub: 'user_123', organizationId: 'org_abc' });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user_123');
    expect(decoded.organizationId).toBe('org_abc');
  });

  it('refresh token round-trip preserves tokenVersion', () => {
    const token = signRefreshToken({ sub: 'user_123', tokenVersion: 4 });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe('user_123');
    expect(decoded.tokenVersion).toBe(4);
  });

  it('verifyAccessToken throws on invalid signature', () => {
    const token = jwt.sign({ sub: 'x', organizationId: 'y' }, 'wrong-secret');
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('verifyRefreshToken rejects access tokens (different secret)', () => {
    const accessToken = signAccessToken({ sub: 'u', organizationId: 'o' });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it('access and refresh secrets are distinct', () => {
    expect(env.JWT_ACCESS_SECRET).not.toBe(env.JWT_REFRESH_SECRET);
  });
});
