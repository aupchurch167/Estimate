# Incident Runbook

How to diagnose, mitigate, and resolve production incidents for Quill.

---

## Severity levels

| Level | Definition | Response time | Example |
|-------|-----------|---------------|---------|
| **S1** | Service down or data loss | Immediate | Backend crash loop, DB unreachable |
| **S2** | Major feature broken | < 1 hour | AI generation fails, PDF export broken, auth broken |
| **S3** | Minor feature degraded | < 4 hours | Email delivery delayed, avatar upload failing |
| **S4** | Cosmetic / low-impact | Next business day | Styling glitch, stale cache |

---

## Diagnosis checklist

When something breaks, work through this in order:

1. **Check Railway dashboard** — is the backend service running? Look at deploy logs and runtime logs for crash traces.
2. **Check `/healthz`** — `curl https://<api-domain>/healthz`. If it returns `503` with `db: 'down'`, the problem is the Neon connection.
3. **Check Sentry** — look for new unhandled exceptions. Filter by `environment:production`. The error tag and stack trace usually point to the root cause.
4. **Check Neon dashboard** — is the database branch active? Neon auto-suspends idle databases on the free tier. Check connection count and query latency.
5. **Check external services** — Anthropic status page, SendGrid activity feed, DigitalOcean Spaces status.

---

## Common incidents

### Backend crash loop

**Symptoms:** Railway shows repeated restarts, `/healthz` unreachable.

**Steps:**
1. Open Railway runtime logs — find the first error in the crash trace.
2. If it's a missing env var or bad config, fix in Railway variables and redeploy.
3. If it's a code bug, revert to the last good deploy: Railway → Deployments → click the last green deploy → Rollback.
4. If the crash is from a bad migration, see [Restore Runbook](./restore-runbook.md).

### Database unreachable

**Symptoms:** `/healthz` returns `503 { db: 'down' }`, Sentry floods with connection errors.

**Steps:**
1. Check Neon dashboard — is the project active? Free-tier branches auto-suspend after 5 min of inactivity.
2. If suspended, any new request wakes it (cold start ~1-3s). If it doesn't wake, check Neon status page.
3. Verify `DATABASE_URL` in Railway env vars matches the Neon connection string (pooled endpoint, `?sslmode=require`).
4. Check if Neon hit a connection limit — Neon free tier allows 100 concurrent connections via the pooler.

### AI generation fails

**Symptoms:** Estimate drafting returns 502 or hangs, Sentry shows `ai_*` error codes.

**Steps:**
1. Check Anthropic status page for outages.
2. Check the AI cost cap — if the org has exceeded `AI_MONTHLY_COST_CAP_USD`, generation is blocked by design. The error message says so.
3. Verify `ANTHROPIC_API_KEY` is valid and has credits.
4. If Anthropic is down, there's nothing to do but wait. The frontend shows an error state and the user can retry.

### PDF export fails

**Symptoms:** Export button errors out, Sentry shows Puppeteer/Chromium errors.

**Steps:**
1. Check Railway logs for Chromium launch errors — usually missing system libraries.
2. Ensure the Railway service has enough memory (Puppeteer needs ~512MB to render a page).
3. If it's a transient OOM, the user can retry. If persistent, increase the Railway service memory.

### Email not delivered

**Symptoms:** Invitations or send-estimate emails not arriving.

**Steps:**
1. Check SendGrid Activity Feed — is the email queued, delivered, bounced, or blocked?
2. If blocked: check sender domain verification in SendGrid. DNS records may have changed.
3. If the API key is invalid, SendGrid returns 401 — check `SENDGRID_API_KEY` in Railway.
4. In dev mode, emails aren't sent — the invite link is returned in the API response instead.

### Auth / login broken

**Symptoms:** Users can't log in, 401 on every request.

**Steps:**
1. Check if `JWT_SECRET` changed between deploys — rotating the secret invalidates all existing tokens.
2. Check `APP_URL` — if it changed, CORS blocks the frontend and cookies won't be set.
3. Check the `COOKIE_DOMAIN` env var if using custom domains.

---

## Rollback procedure

Railway keeps a history of every deploy. To roll back:

1. Open the Railway service dashboard.
2. Go to **Deployments**.
3. Find the last known-good deploy (green checkmark).
4. Click **Rollback** (or redeploy that commit).
5. Verify `/healthz` returns `200` and spot-check the app.

If the bad deploy included a database migration that already ran, see [Restore Runbook](./restore-runbook.md) for point-in-time recovery before rolling back the code.

---

## Escalation

| Step | Action |
|------|--------|
| 1 | On-call engineer triages using this runbook |
| 2 | If not resolved in 15 min (S1) or 30 min (S2), escalate to the team lead |
| 3 | If data loss is suspected, immediately pause deploys and start the restore runbook |
| 4 | Post-incident: write a brief (what happened, timeline, root cause, fix, prevention) |

---

## Post-incident

After resolution:

1. Confirm the fix with a smoke test (login → create estimate → generate draft → export PDF).
2. If a Sentry issue was created, mark it as resolved.
3. Write a 1-paragraph incident summary in the team channel: what broke, when, what fixed it, what we'll do to prevent it.
