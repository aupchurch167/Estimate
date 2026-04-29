import { env } from './lib/env.js';
import { initSentry } from './lib/sentry.js';

// Init Sentry first so it can intercept unhandled rejections + uncaught
// exceptions from later imports.
initSentry();

import { logger } from './lib/logger.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, '[quill backend] listening');
});
