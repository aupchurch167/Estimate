/**
 * Structured logger.
 *
 * - development: pretty-printed via pino-pretty for readable terminal output
 * - test:        silent (suppressed unless LOG_LEVEL is overridden)
 * - production:  raw JSON for log aggregators
 *
 * Configure level with the LOG_LEVEL env (debug | info | warn | error).
 */

import { pino } from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
