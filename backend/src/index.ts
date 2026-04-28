import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, '[quill backend] listening');
});
