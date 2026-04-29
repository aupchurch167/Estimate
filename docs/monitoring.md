# Monitoring (Phase 10.4)

What's wired, how to turn it on in production, and what to watch.

---

## Sentry — error reporting

Both workspaces ship with the Sentry SDK installed but **disabled by default**. Set the DSN to enable:

```bash
# backend/.env (production)
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>

# frontend/.env (production)
VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

Without a DSN, both `initSentry()` calls return early — zero network traffic, zero surprise telemetry in dev. With a DSN:

- **Backend** (`backend/src/lib/sentry.ts`) initializes at process start, before any other module loads, so it can intercept uncaught exceptions and unhandled rejections from the rest of the boot sequence. The global error handler reports anything that isn't a typed `AppError` — 4xx-class application errors stay out of the issue queue.
- **Frontend** (`frontend/src/lib/sentry.ts`) initializes in `main.tsx` before React renders. The existing top-level `ErrorBoundary` catches render errors and Sentry picks up unhandled promise rejections.

Performance traces and Replay are intentionally off (`tracesSampleRate: 0`, `replaysSessionSampleRate: 0`) — the bundle cost outweighs the value at MVP scale. Enable them per-route once we have real volume to sample from.

### Recommended alert rules

Inside Sentry:

- New issue first seen → email + Slack.
- 1% of users affected on a single issue in 1h → page on-call.
- AI-related errors (`ai_*` codes appear in `tags`) → separate channel — these are usually upstream Anthropic blips.

---

## Uptime — `/healthz`

The backend exposes two health endpoints:

- `GET /health` — pure liveness. Returns `{ status: 'ok', timestamp }`. Cheap; safe to ping every few seconds.
- `GET /healthz` — readiness. Pings the DB with `SELECT 1`. Returns `503 + { db: 'down' }` if Postgres is unreachable, so an orchestrator never promotes a half-booted instance.

Point your uptime monitor (UptimeRobot, BetterStack, Pingdom — anything works) at:

```
https://api.<your-domain>/healthz
```

A 30-second interval with a 60-second downtime threshold catches most outages without false alarms during deploys. Monitor only `/healthz`; `/health` is for orchestrator probes, not page-the-team uptime.

---

## Render-specific notes

Since deployment is on Render (not the playbook's DigitalOcean droplet recipe), several PM2 / Nginx items don't apply:

- **Log rotation** — Render rotates stdout / stderr logs automatically. Use `pino` (already wired) for structured logs and view them in the Render dashboard.
- **Restart policy** — Render auto-restarts a service that crashes. No PM2 needed.
- **Zero-downtime deploys** — Render's default deploy strategy already does rolling restarts behind their LB.

If you migrate to a droplet later, port the equivalents:
- `pm2 startup systemd` for restart-on-boot.
- `pm2-logrotate` for daily rotation, 14-day retention.
- An `nginx` reverse proxy fronting the Express server with HTTPS termination.

---

## What's NOT wired (yet)

- **Sentry release tracking** — wire the build-time `SENTRY_AUTH_TOKEN` + `sentry-cli releases` into `.github/workflows/ci.yml` once you have a Sentry project. Until then issues land without source maps.
- **OpenTelemetry / APM** — out of scope for MVP. Sentry's perf traces are the lighter alternative when you need them.
- **DB metrics** — Neon's dashboard covers query latency / connection counts. If you migrate to self-hosted Postgres, hook up `pg_stat_statements` + a Grafana dashboard.
