import { describe, expect, it } from 'vitest';
import {
  AppError,
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors.js';

describe('error classes', () => {
  it('ValidationError: 400 / validation_error', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('validation_error');
    expect(err.message).toBe('bad input');
    expect(err.details).toEqual({ field: 'email' });
  });

  it('AuthError: 401 / not_authenticated by default, custom code allowed', () => {
    const def = new AuthError();
    expect(def.statusCode).toBe(401);
    expect(def.code).toBe('not_authenticated');
    expect(def.message).toBe('Not authenticated');

    const custom = new AuthError('token expired', 'token_expired');
    expect(custom.code).toBe('token_expired');
    expect(custom.message).toBe('token expired');
  });

  it('ForbiddenError: 403 / forbidden', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('forbidden');
  });

  it('NotFoundError: 404 / not_found with resource + optional id', () => {
    const noId = new NotFoundError('Estimate');
    expect(noId.statusCode).toBe(404);
    expect(noId.code).toBe('not_found');
    expect(noId.message).toBe('Estimate not found');
    expect(noId.details).toEqual({ resource: 'Estimate' });

    const withId = new NotFoundError('Estimate', 'abc123');
    expect(withId.message).toBe('Estimate not found: abc123');
    expect(withId.details).toEqual({ resource: 'Estimate', id: 'abc123' });
  });

  it('ConflictError: 409, default code is conflict, custom code allowed', () => {
    const def = new ConflictError('email taken');
    expect(def.statusCode).toBe(409);
    expect(def.code).toBe('conflict');

    const custom = new ConflictError('cannot edit when SENT', 'invalid_transition', {
      from: 'SENT',
      to: 'DRAFT',
    });
    expect(custom.code).toBe('invalid_transition');
    expect(custom.details).toEqual({ from: 'SENT', to: 'DRAFT' });
  });

  it('every concrete error preserves stack and is throwable', () => {
    expect(() => {
      throw new ValidationError('x');
    }).toThrow(ValidationError);
  });
});
