# Deployment

This guide takes you from a fresh laptop to a running production Quill on
**Neon (DB) + Render (frontend + backend) + Anthropic + SendGrid +
DigitalOcean Spaces**. Other hosts (Fly, Railway, AWS) are fine — substitute
where noted.

Estimated bring-up: ~45 min if you've used these services before, ~2 hr from
scratch.

---

## 0. Architecture at a glance

Two web processes plus three external dependencies:

```
┌────────────┐  HTTPS  ┌────────────────────┐  HTTPS  ┌────────────────┐
│ Browser    │ ──────▶ │ frontend (Vite     │ ──────▶ │ backend (Express│
│ user       │         │ static, served by  │         │ API on Render)  │
│            │ ◀────── │ Render Static)     │ ◀────── │                 │
└────────────┘         └────────────────────┘         └────┬───┬───┬────┘
                                                           │   │   │
                                                           │   │   └──▶ DigitalOcean Spaces (PDFs)
                                                           │   └──────▶ Anthropic API (Claude)
                                                           └──────────▶ Neon Postgres
                                                                       └──▶ SendGrid (transactional email)
```

The frontend is a static SPA that talks to the backend API. The backend
handles auth, persistence, AI calls, PDF rendering, email, and file uploads
to Spaces.

---

## 1. External accounts

You need accounts on these services. None of them require a paid plan to
start, though you'll likely upgrade Anthropic past the free quota quickly.

| Service                | What for                          | Free tier?            |
| ---------------------- | --------------------------------- | --------------------- |
| **Neon**               | Production Postgres               | Yes (auto-suspend)    |
| **Render**             | Hosting frontend + backend        | Yes (cold starts)     |
| **Anthropic**          | Claude API                        | Small free credit     |
| **SendGrid**           | Transactional email               | Yes (100/day)         |
| **DigitalOcean Spaces**| PDF storage                       | $5/mo (no free tier)  |
| **GitHub**             | Source control + CI               | Yes                   |

---

## 2. Provision Neon Postgres

1. Sign up at <https://neon.tech>.
2. Create a project. Region: pick the one closest to where Render will run
   (most likely **us-east-2 / Ohio** for Render's default).
3. Copy the **connection string**:
   `postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require`
4. (Optional) Create a separate **branch** for staging or CI tests so you
   don't pollute production.

The `?sslmode=require` is mandatory — Neon rejects unencrypted connections.

### First migration

From your laptop, with `DATABASE_URL` pointed at Neon production:

```bash
DATABASE_URL='postgresql://...neon.tech/...?sslmode=require' \
  npm --workspace backend run prisma:migrate
```

If you want a starter org / price book / sample estimates:

```bash
DATABASE_URL='...' npm --workspace backend run db:seed
```

In production you usually skip the seed — let real users sign up.

---

## 3. Get an Anthropic API key

1. Sign up at <https://console.anthropic.com>.
2. Go to **API Keys** → **Create Key**. Name it "Quill production".
3. Copy the key (starts with `sk-ant-`). It's only shown once.
4. Add a payment method and fund a small balance ($20 is plenty for piloting).

The MVP uses two model IDs:
- `AI_MODEL_PRIMARY=claude-sonnet-4-6` — line-item generation, follow-ups.
- `AI_MODEL_LIGHT=claude-haiku-4-5-20251001` — cheap classifier-style runs.

If Anthropic deprecates a model, update these env vars and restart the
backend (the `ai_model_not_found` error code surfaces this in the UI).

---

## 4. Get a SendGrid key

1. Sign up at <https://signup.sendgrid.com>.
2. **Settings → Sender Authentication** — verify the domain you'll send from.
   Single-sender verification works for a smoke test, domain auth is
   required at scale (better deliverability + DMARC).
3. **Settings → API Keys** → **Create API Key** with **Restricted Access**:
   only enable "Mail Send → Full Access". Copy the key (`SG.…`).

The dispatcher in `backend/src/lib/email.ts` only sends real email when:
- `NODE_ENV=production`, AND
- `SENDGRID_API_KEY` looks like a real key (`SG.…` + length ≥ 30).

Otherwise it logs the rendered email to the structured logger. That's why
the dev placeholder `SG.development-placeholder` is safe to keep locally.

---

## 5. Provision DigitalOcean Spaces

1. Sign up at <https://www.digitalocean.com/products/spaces>.
2. Create a Space (e.g. `quill-prod`). Region: pick close to Render.
3. Generate **Spaces access keys**: API → Spaces Keys → Generate.
4. The endpoint URL is `https://<region>.digitaloceanspaces.com` (no bucket
   in the URL — `forcePathStyle: false` in the SDK config).

Settings to configure: keep the bucket private; the backend generates
short-lived signed download URLs for PDFs.

If you'd rather use AWS S3 or Cloudflare R2 — they're S3-compatible and
work with the same SDK. Swap the `SPACES_*` env vars for the equivalent
endpoint + region + access key.

---

## 6. Render: backend service

Push your `claude/build-quill-mvp-EITZ6` branch (or `main`) to GitHub first.

1. **Render dashboard → New → Web Service**.
2. Connect the GitHub repo.
3. Configure:
   - **Name**: `quill-backend`
   - **Region**: same as Neon
   - **Branch**: `main` (or your release branch)
   - **Root directory**: leave blank (monorepo root)
   - **Runtime**: Node
   - **Build command**:
     ```
     npm install && npm --workspace backend run build && npm --workspace backend run prisma:generate
     ```
   - **Start command**:
     ```
     npm --workspace backend start
     ```
     (which runs `node dist/index.js`)
   - **Health check path**: `/healthz`
4. **Environment variables** — paste these (replace `<…>` with real values):

   ```
   NODE_ENV=production
   PORT=10000                     # Render injects this; leave or override
   APP_URL=https://quill-frontend.onrender.com
   API_URL=https://quill-backend.onrender.com
   LOG_LEVEL=info

   DATABASE_URL=<your Neon connection string with ?sslmode=require>

   JWT_ACCESS_SECRET=<random 64+ chars>
   JWT_REFRESH_SECRET=<different random 64+ chars>
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   BCRYPT_ROUNDS=12

   ANTHROPIC_API_KEY=sk-ant-<your key>
   AI_MODEL_PRIMARY=claude-sonnet-4-6
   AI_MODEL_LIGHT=claude-haiku-4-5-20251001
   DEFAULT_MONTHLY_AI_CAP_USD=100

   SENDGRID_API_KEY=SG.<your key>
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   SENDGRID_FROM_NAME=Quill

   SPACES_KEY=<DO Spaces access key>
   SPACES_SECRET=<DO Spaces secret>
   SPACES_ENDPOINT=https://<region>.digitaloceanspaces.com
   SPACES_BUCKET=quill-prod
   SPACES_REGION=<region>          # e.g. nyc3
   SIGNED_UPLOAD_EXPIRES_SECONDS=3600
   ```

5. Click **Create Web Service**. First deploy takes ~3-5 min.
6. Once healthy, run the production migration:
   ```
   render shell quill-backend
   npm --workspace backend run prisma:migrate -- deploy
   ```
   (The build step runs `prisma generate` but **not** `migrate deploy` so you
   control when schema changes apply.)

---

## 7. Render: frontend static site

1. **Render dashboard → New → Static Site**.
2. Same repo.
3. Configure:
   - **Name**: `quill-frontend`
   - **Branch**: same as backend
   - **Build command**: `npm install && npm --workspace frontend run build`
   - **Publish directory**: `frontend/dist`
4. **Environment variables**:
   ```
   VITE_API_URL=https://quill-backend.onrender.com
   ```
5. **Redirects/Rewrites** — add a rewrite for SPA routing:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: Rewrite

6. Deploy. Takes ~2 min.

Once both are live, open the frontend URL and sign up. The first user is
the OWNER of their org.

---

## 8. Smoke test

```bash
# 1. Backend liveness
curl https://quill-backend.onrender.com/health
# → {"status":"ok","timestamp":"..."}

# 2. Backend readiness (DB ping)
curl https://quill-backend.onrender.com/healthz
# → {"status":"ok","db":"up","checkedAt":"..."}

# 3. From the browser:
#    - Sign up at https://quill-frontend.onrender.com/signup
#    - Create an estimate
#    - Add a source input
#    - Click "Generate draft"  (verifies Anthropic key)
#    - Submit → Approve → Export PDF (verifies Spaces upload)
#    - Send to client (verifies SendGrid)
```

Each step that fails has a specific error code surfaced in the UI banner —
see `backend/src/services/aiService.ts` (`mapAnthropicError`) and
`frontend/src/features/estimates/workspace/ConversationPanel.tsx`
(`mapAiUpstreamError`).

---

## 9. Operations

### Migrations

After every schema change in `backend/prisma/schema.prisma`:

```bash
# Local: write the migration
npm --workspace backend run prisma:migrate

# CI / production: apply pre-existing migrations
npm --workspace backend run prisma:migrate -- deploy
```

Render's free plan auto-deploys on push. To gate migrations, add
`npx prisma migrate deploy` to the build command — but only if you're
comfortable with every push touching the DB. Safer: shell into Render and
run it manually after smoke-testing.

### Logs

Render exposes structured logs in the dashboard. The backend uses pino
with `LOG_LEVEL=info` by default. Filter for `[ai]` to find AI-related
events; `errorHandler` logs every unhandled error.

### Rotating secrets

Update the env var in Render's dashboard, then "Manual Deploy → Restart
Service". The pino logger and Anthropic SDK both pick up the new values
on next request.

### AI cost monitoring

Settings → AI usage (admin only) shows month-to-date spend, top users,
top estimates, and the last 25 runs (FAILED rows include the upstream
error message). Use the cost cap form right above to throttle.

### Backups

Neon takes branch-level point-in-time snapshots automatically. For a
manual snapshot before a risky migration:

```bash
pg_dump 'postgresql://...neon.tech/...' > quill-$(date -u +%Y%m%d).sql
```

---

## 10. Troubleshooting

| Symptom                                | Likely cause                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Backend boots then exits 1             | Env validation. Read the diagnostic — every required var is listed.                 |
| `Can't reach database server`          | Neon cold start (free tier suspends after 5 min idle). Retry, or upgrade.           |
| `ai_invalid_api_key` banner            | `ANTHROPIC_API_KEY` is wrong / revoked / has trailing whitespace. Update + restart. |
| `ai_model_not_found` banner            | Model name in `AI_MODEL_PRIMARY` / `AI_MODEL_LIGHT` is stale. Update + restart.     |
| PDF export 500s with `NoSuchBucket`    | `SPACES_BUCKET` doesn't exist or the access key lacks permission.                   |
| Email shows `dev mode — not sent`      | `NODE_ENV` ≠ `production` OR the SendGrid key isn't a real `SG.…`.                  |
| 401 on every request after deploy     | `JWT_ACCESS_SECRET` changed → all existing tokens are invalid. Users must re-login. |
| Frontend hits `localhost:4000`         | `VITE_API_URL` not set in Render → defaulted to dev value at build time.            |
| 429 `ai_rate_limited_local`            | Per-user 20 req/min cap. Wait or raise in `backend/src/middleware/rateLimit.ts`.    |

If a deploy fails entirely, Render keeps the previous version running until
the new one passes health checks — you don't get a stuck downtime from a
broken push.

---

## 11. Going further

- **Custom domain**: Render → Settings → Custom Domains. Cloudflare in front
  for caching is a nice add later.
- **Staging branch**: clone the Render services, point them at a Neon dev
  branch (`?sslmode=require` still required), and a separate Spaces bucket.
- **Sentry / log aggregation**: not included in MVP. The pino logger is
  structured JSON, easy to ship to any aggregator.
- **Multi-instance**: the rate limiter uses an in-process memory store. For
  more than one backend instance, swap to a Redis-backed store
  (`rate-limit-redis`).
