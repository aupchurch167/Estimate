import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { errorHandler } from '../errorHandler.js';

function buildApp(throwFn: () => never) {
  const app = express();
  app.get('/boom', (_req, _res, _next) => {
    throwFn();
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler middleware', () => {
  it('NotFoundError → 404 with {error:{code,message,details}}', async () => {
    const app = buildApp(() => {
      throw new NotFoundError('Estimate', 'abc123');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Estimate not found: abc123',
        details: { resource: 'Estimate', id: 'abc123' },
      },
    });
  });

  it('ValidationError → 400 / validation_error', async () => {
    const app = buildApp(() => {
      throw new ValidationError('email is required', { field: 'email' });
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toEqual({ field: 'email' });
  });

  it('AuthError → 401', async () => {
    const app = buildApp(() => {
      throw new AuthError();
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('not_authenticated');
  });

  it('ForbiddenError → 403', async () => {
    const app = buildApp(() => {
      throw new ForbiddenError();
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(403);
  });

  it('ConflictError with custom code → 409', async () => {
    const app = buildApp(() => {
      throw new ConflictError('cannot edit when SENT', 'invalid_transition', { from: 'SENT' });
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_transition');
    expect(res.body.error.details).toEqual({ from: 'SENT' });
  });

  it('unexpected Error → 500 / internal_error and does not leak the message', async () => {
    const app = buildApp(() => {
      throw new Error('secret debug detail');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
  });
});
