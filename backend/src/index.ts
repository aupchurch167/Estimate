import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ app: 'Quill', status: 'ok' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[quill backend] listening on http://localhost:${port}`);
});
