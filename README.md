# Quill

AI-powered commercial construction estimating tool. A non-expert produces an
80% draft by talking to AI; an expert reviewer corrects and finalizes. Built
first for Mark Allan Contracting, multi-tenant SaaS from day one.

## Stack

- **Frontend** — React 18, Vite, TypeScript, Tailwind CSS, TanStack Query,
  Zustand, Axios, Zod
- **Backend** — Node 20+, Express, TypeScript, Prisma, PostgreSQL, Zod
- **Database** — PostgreSQL (Neon in production, Neon dev branch or local
  Postgres in development)
- **AI** — Anthropic Claude (`@anthropic-ai/sdk`) via forced tool use
- **Email** — SendGrid via `@sendgrid/mail` + React Email
- **File storage** — DigitalOcean Spaces (S3-compatible) via `@aws-sdk/client-s3`

The frontend dev server runs on `5173`; the backend dev server runs on `4000`.

## Quick start

```bash
git clone <repo-url> quill
cd quill
npm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Fill in backend/.env:
#   DATABASE_URL          (Neon connection string OR local Postgres)
#   JWT_ACCESS_SECRET     (random 64-char string)
#   JWT_REFRESH_SECRET    (different random 64-char string)
#   ANTHROPIC_API_KEY     (sk-ant-... from console.anthropic.com)
# All other vars accept the placeholder values for dev.

# Generate JWT secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm --workspace backend run prisma:migrate
npm --workspace backend run db:seed

npm run dev      # boots backend + frontend together
```

Open <http://localhost:5173>. Sign up to create an org, or use the seeded
account from `backend/prisma/seed.ts`.

## Repository layout

```
.
├── frontend/                 React + Vite SPA
│   ├── src/
│   │   ├── pages/            Route-level views
│   │   ├── components/       Shared, reusable UI (incl. ErrorBoundary)
│   │   ├── features/         Feature-scoped folders (auth, estimates,
│   │   │                     dashboard, notifications, settings, …)
│   │   ├── hooks/            Reusable hooks
│   │   ├── lib/              Axios client, query client, env, helpers
│   │   ├── context/          React contexts (auth)
│   │   └── styles/           Tailwind tokens + base CSS
│
├── backend/                  Express API
│   ├── src/
│   │   ├── routes/           Express route definitions
│   │   ├── controllers/      HTTP handlers
│   │   ├── services/         Business logic (one file per domain)
│   │   ├── middleware/       Auth, rate limit, request log, error handler
│   │   ├── prompts/          AI prompt builders
│   │   └── lib/              Prisma client, JWT, logger, Anthropic, Spaces,
│   │                         email, errors, permissions
│   ├── prisma/               schema.prisma + migrations + seed
│   └── scripts/              Operator scripts
│
├── package.json              npm workspaces root
├── README.md                 you are here
└── DEPLOYMENT.md             production deploy recipe (Neon + Render)
```

## Scripts (root)

| Script                   | What it does                                              |
| ------------------------ | --------------------------------------------------------- |
| `npm run dev`            | Boot frontend + backend together with `[BE]`/`[FE]` tags  |
| `npm run dev:frontend`   | Just the Vite dev server on `:5173`                       |
| `npm run dev:backend`    | Just the Express dev server on `:4000`                    |
| `npm run build:frontend` | Production frontend bundle (`frontend/dist/`)             |
| `npm run build:backend`  | Compile backend TS to `backend/dist/`                     |
| `npm run typecheck`      | `tsc --noEmit` across both workspaces                     |
| `npm run lint`           | ESLint across both workspaces                             |
| `npm run lint:fix`       | ESLint `--fix` across both workspaces                     |
| `npm run format`         | Prettier across both workspaces                           |
| `npm run check`          | `typecheck` + `lint`. CI gate.                            |

## Testing

```bash
# Backend (Vitest + supertest, hits a real Postgres)
npm --workspace backend run test -- --run

# Frontend (Vitest + @testing-library/react + jsdom)
npm --workspace frontend run test -- --run
```

Backend tests run against the same DB as `DATABASE_URL`. They create unique
orgs per test and clean up in `afterAll`, so it's safe to point at a Neon dev
branch — but a dedicated test DB is the safest choice if you want to be able
to wipe.

## Health endpoints

- `GET /health` — pure liveness, returns `{ status: 'ok', timestamp }`. Cheap
  enough to ping every few seconds.
- `GET /healthz` — readiness, pings the DB with `SELECT 1`. Returns
  `503 + { db: 'down' }` if Postgres is unreachable so an orchestrator never
  promotes a half-booted instance.

## Environment validation

Both workspaces validate environment variables on startup with Zod:

- **Backend** (`backend/src/lib/env.ts`) loads `backend/.env` via dotenv,
  validates against the schema, and on failure prints a diagnostic listing
  every missing or invalid variable, then exits 1 — the server never starts
  with a bad env.
- **Frontend** (`frontend/src/lib/env.ts`) validates Vite's `import.meta.env`
  on module load.

Temporarily rename `backend/.env` and run `npm run dev:backend` to see the
full required-vars list.

## Production hardening

- **Rate limiting** — auth endpoints (signup/login) limit 5 req/min/IP. The
  AI generate endpoint limits 20 req/min/user, distinct from the upstream
  Anthropic rate limit.
- **AI cost cap** — per-org `monthlyAiCostCapUsd` enforced as a pre-flight in
  `aiService.checkCostCap`. Both SUCCEEDED and FAILED runs count toward the
  cap. Exceeding it returns 402 with `code: monthly_ai_limit_reached`.
- **Anthropic error mapping** — typed `AiUpstreamError` codes
  (`ai_invalid_api_key`, `ai_model_not_found`, `ai_rate_limited`, …) so the
  UI can render targeted banners. Permanent failures short-circuit the
  retry loop.
- **Snapshots** — every approve/unlock/send writes an immutable
  `EstimateSnapshot` blob; PDFs render from the snapshot, not live data.
- **Error boundary** — top-level React `ErrorBoundary` catches render errors
  so a buggy sub-tree shows a friendly card instead of a blank screen.

## Going to production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the recipe — Neon DB, Render web
services, Anthropic + SendGrid + DigitalOcean Spaces accounts, and the
migration / smoke-test flow.

## License

Proprietary. © Mark Allan Contracting / Built Different.
