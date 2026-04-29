# Quill — Local Setup Guide

Get from a fresh clone to a running app in under 30 minutes. Written for someone who has used a terminal before but isn't deep in Node tooling.

---

## 1. Prerequisites

You need four things installed:

- **Node 20+** — `node --version` should print `v20.x.x` or higher. Install from [nodejs.org](https://nodejs.org) or via `nvm`.
- **npm** — bundled with Node. `npm --version` should print 10+.
- **Postgres** — either a local install (16+) or a free [Neon](https://neon.tech) project. Both work; Neon is faster to set up.
- **git** — `git --version` should print 2.x. Install from [git-scm.com](https://git-scm.com).

You also need API credentials, but those go in `.env` later:

- An **Anthropic API key** (`sk-ant-...` from [console.anthropic.com](https://console.anthropic.com)). Required for the draft generation flow. The app boots without it but AI calls fail with a clear banner.
- A **SendGrid API key** (`SG....`). Optional. Without it, emails log to stdout instead of sending.
- **DigitalOcean Spaces** credentials. Optional. Without them, file uploads fall back to dev-mode signed URLs that won't actually serve the file.

For first-time local development you can skip SendGrid and Spaces entirely — only Anthropic matters for exercising the full flow.

---

## 2. Clone + install

```bash
git clone https://github.com/aupchurch167/Estimate.git quill
cd quill
npm install
```

`npm install` walks both workspaces (`frontend/` and `backend/`) and installs everything once at the root. Expect ~1500 packages and a minute or two depending on bandwidth.

---

## 3. Database

Pick one path.

### Option A — Neon (fastest)

1. Sign up at [neon.tech](https://neon.tech) (free tier is fine).
2. Create a project. Copy the connection string from the dashboard. It looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/quill?sslmode=require`.
3. Skip to step 4.

### Option B — Local Postgres

1. Install Postgres 16+ ([brew install postgresql@16](https://wiki.postgresql.org/wiki/Detailed_installation_guides) on macOS, [postgresql.org/download](https://www.postgresql.org/download/) elsewhere).
2. Start it: `brew services start postgresql@16` on macOS, or follow your distro's docs.
3. Create the database:
   ```bash
   createdb quill
   ```
4. Your connection string is `postgresql://postgres:postgres@localhost:5432/quill` — adjust user/password to match your install.

---

## 4. Configure environment

Backend:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in:

- `DATABASE_URL` — the connection string from step 3.
- `JWT_ACCESS_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- `JWT_REFRESH_SECRET` — generate again with the same command (must differ from access).
- `ANTHROPIC_API_KEY` — your `sk-ant-...` key. Use a placeholder like `sk-ant-dev-placeholder` if you're skipping AI for now (AI calls will fail with `ai_invalid_api_key` but the rest of the app works).

Everything else can stay at the example values for local dev.

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Default values point at `http://localhost:4000` for the API — leave them.

---

## 5. Migrate + seed

```bash
npm --workspace backend run prisma:migrate
npm --workspace backend run db:seed
```

The migrate command creates every table and indexes from `backend/prisma/migrations/`. The seed command inserts a starter org, one OWNER user, a small price book, and a sample estimate so you have something to look at on first login.

The seed prints the credentials it created — note them. Default seed login:

- **Email**: `owner@example.test`
- **Password**: `OriginalPass1!`

---

## 6. Start both servers

```bash
npm run dev
```

This boots both servers in one terminal with `[BE]` / `[FE]` prefixes via `concurrently`. You'll see:

```
[BE] info: Backend listening on http://localhost:4000
[FE] VITE v5.x ready in 600 ms
[FE] ➜  Local: http://localhost:5173/
```

Open <http://localhost:5173>. You should see the login page.

If you only want to boot one side:

```bash
npm run dev:backend    # Express on :4000
npm run dev:frontend   # Vite on :5173
```

---

## 7. Smoke test

1. Log in with the seeded creds (or sign up to create your own org).
2. You should land on the dashboard with the seeded estimate visible under "Needs your attention".
3. Click into the estimate to verify the workspace loads.
4. Hit `?` to open the keyboard shortcuts cheat sheet — confirms the key bindings are wired.
5. (Optional) Hit "Generate draft" with a real `ANTHROPIC_API_KEY` to confirm AI runs work.

If everything above renders, you're good to go.

---

## 8. Common errors + fixes

| Symptom                                                                                                | Cause / fix                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Error: P1001: Can't reach database server`                                                            | Postgres isn't running, or `DATABASE_URL` is wrong. Run `psql "$DATABASE_URL" -c "SELECT 1"` to verify the connection works.                           |
| Backend exits with `Invalid env: ZodError…`                                                            | A required env var is missing or malformed. The error lists each violation with its path. Fix in `backend/.env` and restart.                           |
| Frontend renders but every API call returns 401                                                        | Cookies aren't reaching the backend. Make sure you're hitting `localhost:5173` and the API is on `localhost:4000` (the `VITE_API_URL` default).        |
| Anthropic returns `ai_invalid_api_key` even though the key looks right                                 | Whitespace / newline in `.env` value. Edit `backend/.env` and confirm there's no trailing newline. Restart backend after env changes.                  |
| `npm run dev` shows `[BE]` exiting on every save                                                       | Crash on boot. Run `npm --workspace backend run dev` solo to see the unfiltered backend logs.                                                          |
| `EmailDispatcher` says `dev_mode_or_placeholder_key`                                                   | Expected — emails log to stdout in dev. Set a real `SENDGRID_API_KEY` and `NODE_ENV=production` to actually send. (Don't run with NODE_ENV=production locally unless you mean it.) |
| `prisma:migrate deploy` says `migration X has been modified since it was applied`                      | Someone edited a migration after merging. Don't edit applied migrations — write a new one. For dev databases you can `prisma migrate reset` to nuke + reapply.     |
| Tests pass locally but vitest can't reach Postgres in CI                                               | The CI runner probably needs its own Postgres service. Add one to your workflow (see `DEPLOYMENT.md` for the production setup).                        |

---

## 9. What's next

- The architecture summary lives in [README.md](../README.md).
- Production deployment recipe is in [DEPLOYMENT.md](../DEPLOYMENT.md).
- Backend code is feature-aligned under `backend/src/services/` (one file per domain) — start there when investigating a behavior.
- Frontend is feature-folder organized under `frontend/src/features/` — each feature owns its hooks, types, and components.

If you got stuck somewhere this guide didn't cover, open an issue or PR with the missing step.
