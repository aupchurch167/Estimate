# Database Restore Runbook

How to recover Quill's production database using Neon's built-in backup and branching features.

---

## How Neon backups work

Neon automatically retains a history of every change to your database using its copy-on-write storage engine. Depending on your plan:

| Plan | Point-in-time recovery window | Branch snapshots |
|------|-------------------------------|-----------------|
| Free | 24 hours | Manual only |
| Launch | 7 days | Manual + automatic |
| Scale | 30 days | Manual + automatic |

You do not need to configure anything — backups are always on. Recovery means creating a new Neon branch from a specific point in time, verifying it, then promoting it.

---

## Before a risky migration

**Always** create a named branch before running a migration that alters or drops data:

```bash
# In the Neon console or via CLI:
neonctl branches create \
  --project-id <project-id> \
  --name pre-migration-$(date +%Y%m%d-%H%M) \
  --parent main
```

This gives you a zero-cost, instant snapshot you can restore from if the migration goes wrong. The branch shares storage with `main` until data diverges, so it costs nothing until you write to it.

---

## Restore procedure

### 1. Identify the recovery target

Determine the timestamp just before things went wrong:

- Check Railway deploy history for the deploy that introduced the issue.
- Check Sentry for the first error timestamp.
- Check Neon query history in the dashboard for the migration `ALTER` / `DROP` statement timestamp.

### 2. Create a recovery branch

**Via Neon Console:**
1. Go to your project → Branches.
2. Click **Create branch**.
3. Set parent to `main`.
4. Under **Branch point**, select **Specific date and time**.
5. Enter the timestamp from step 1 (use UTC).
6. Name it `restore-YYYYMMDD-HHMM`.
7. Click **Create**.

**Via CLI:**
```bash
neonctl branches create \
  --project-id <project-id> \
  --name restore-$(date +%Y%m%d-%H%M) \
  --parent main \
  --at "<ISO-8601 timestamp>"
```

### 3. Verify the recovery branch

Connect to the recovery branch and confirm the data is correct:

```bash
# Get the connection string for the recovery branch from the Neon dashboard
psql "<recovery-branch-connection-string>"

# Spot-check critical tables
SELECT count(*) FROM "Estimate";
SELECT count(*) FROM "LineItem";
SELECT count(*) FROM "User";
SELECT id, status, "updatedAt" FROM "Estimate" ORDER BY "updatedAt" DESC LIMIT 5;
```

Compare row counts and recent records against what you expect. If the data looks right, proceed. If not, try an earlier timestamp.

### 4. Promote the recovery branch

**Option A — Swap the connection string (fastest, minimal downtime):**

1. Copy the pooled connection string from the recovery branch in Neon.
2. In Railway, update `DATABASE_URL` to point to the recovery branch.
3. Restart the backend service.
4. Verify `/healthz` returns `200` and the app works.

**Option B — Reset main to the recovery point (cleaner long-term):**

1. In the Neon console, go to Branches → `main`.
2. Click **Reset from parent** and select the recovery branch.
3. This rewinds `main` to the recovery point. Existing connection strings keep working.
4. Restart the backend service to clear any connection pool state.

### 5. Re-apply safe migrations

If you rolled back past a migration that was partially correct, re-apply the fixed version:

```bash
cd backend
npx prisma migrate deploy
```

### 6. Post-restore verification

Run the smoke test checklist:

- [ ] `/healthz` returns `200 { status: 'ok', db: 'up' }`
- [ ] Login works
- [ ] Existing estimates load with correct line items
- [ ] New estimate creation works
- [ ] AI generation returns results
- [ ] PDF export renders
- [ ] No new Sentry errors

---

## Restore drill log

### Drill #1 — June 2026

| Item | Value |
|------|-------|
| **Date** | 2026-06-05 |
| **Scenario** | Simulated bad migration on a dev branch |
| **Recovery target** | 5 minutes before simulated DROP |
| **Branch created** | `restore-drill-20260605` from dev branch at T-5min |
| **Verification** | Row counts matched pre-drop state, spot-checked 5 recent estimates |
| **Time to recover** | ~3 minutes (branch creation: instant, verification: 2 min, connection swap: 1 min) |
| **Result** | Successful. Neon branching is effectively instant. |
| **Notes** | Neon branches share storage via copy-on-write, so creating a restore branch has zero data copy overhead. The bottleneck is human verification, not the platform. |

---

## Key contacts

| Service | Where to check | Support |
|---------|---------------|---------|
| Neon | console.neon.tech → project dashboard | support@neon.tech or Discord |
| Railway | railway.app → project logs | Railway Discord or support portal |

---

## Tips

- **Don't panic-delete the bad branch.** Keep it around for forensics. Neon branches are cheap.
- **Always verify before promoting.** A restore branch that's also broken is worse than the original problem.
- **Coordinate with the team.** If the backend is writing to the old branch while you're setting up the restore, you'll lose those writes. Stop the backend service first if possible.
- **Document what happened.** Update this drill log section after every real restore so the team has a growing record of recovery scenarios.
