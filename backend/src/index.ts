import { env } from './lib/env.js';
import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ app: 'Quill', status: 'ok' });
});

app.listen(env.PORT, () => {
  console.log(`[quill backend] listening on http://localhost:${env.PORT}`);
});
