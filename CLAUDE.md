# CLAUDE.md — Quill (Estimating)

Quill is the estimating and price book app in the Helm suite. It has two workspaces:

- **frontend/** — React 18, Vite, TanStack Query, Axios, Zustand, React Router
- **backend/** — Node, Express, TypeScript, Prisma, tsx

## Helm Core integration

Quill shares customer-side entities with the other Helm apps (Coach, Schedule, Proof, Command) via a central platform service called Core. Core owns the canonical records for:

| Entity   | What it is                        | Quill uses it for                          |
|----------|-----------------------------------|--------------------------------------------|
| Account  | A client company                  | Who the estimate is for                    |
| Person   | A contact at that company         | Who to address the estimate to             |
| Property | A job site address                | Where the work happens                     |
| Deal     | A sales opportunity               | The deal this estimate is attached to      |
| Project  | Executed work (post-close)        | The project this estimate feeds            |
| Vendor   | A subcontractor or supplier       | Subs and material vendors on the estimate  |

Quill has its own database for estimating-specific data (line items, price books, assemblies, markups, proposal PDFs). It does **NOT** store Account/Person/Property/Deal/Project/Vendor itself — those live in Core and are read via `@helm/sdk`.

### The rule

- **Quill DB** → everything estimating-specific (estimates, line items, price book, markups)
- **Core API via SDK** → shared identity data (accounts, persons, properties, deals, projects, vendors)
- **Never** query the Core database directly. Always go through `@helm/sdk`.

## Installation

`@helm/sdk` and `@helm/types` are installed as local file references pointing to the `packages/` directory in the parent helm monorepo:

```json
// backend/package.json
"dependencies": {
  "@helm/sdk": "file:../../../packages/sdk",
  "@helm/types": "file:../../../packages/types"
}
```

If you need to reinstall: `npm install` from `apps/quill/`.

The packages live at `../../packages/sdk` and `../../packages/types` relative to the `backend/` directory. Do not change these paths or move the packages.

## Environment variables

```
# backend/.env
HELM_CORE_INTEGRATION=false   # set to "true" to enable Core API calls
CORE_API_URL=http://localhost:3010
CORE_DEV_USER_ID=<uuid>       # a real user ID from the Core database
```

`HELM_CORE_INTEGRATION=false` is the default. All Core calls are gated behind this flag. When the flag is off, Quill behaves exactly as it did before — no Core dependency at runtime.

## Using the SDK

### Always use `getCoreClient()`

The entry point is `backend/src/lib/core.ts`:

```ts
import { getCoreClient } from "@/lib/core";

// In a route handler:
const core = getCoreClient(orgSlug, req.user.id);
if (!core) {
  // Flag is off — use legacy Quill-only path
  return res.json(await getLocalAccounts(orgSlug));
}
const { data: accounts } = await core.accounts.list({ search: req.query.search });
return res.json(accounts);
```

`getCoreClient()` returns `null` when `HELM_CORE_INTEGRATION` is off. Always check for null and fall back to the existing Quill behavior. Never throw or error when Core is unavailable — the flag-off path must always work.

### Org slug

Every Core API call is scoped to an org. Pass the org slug from the authenticated request context. The slug comes from the URL (e.g. `/orgs/:slug/...`) or the user's session.

```ts
// Good
const core = getCoreClient(req.params.orgSlug, req.user.id);

// Bad — never hardcode a slug
const core = getCoreClient("mac", req.user.id);
```

### Checking the current user's Core membership

```ts
const { user, org, membership } = await core.me();
// membership.role → "owner" | "admin" | "member"
```

### Accounts (clients)

```ts
// List with search
const { data, nextCursor, hasMore } = await core.accounts.list({
  search: "smith",
  limit: 50,
});

// Get one
const { data: account } = await core.accounts.get(accountId);

// Create
const { data: newAccount } = await core.accounts.create({
  name: "Smith Construction",
  email: "billing@smithco.com",
  city: "Nashville",
  state: "TN",
});

// Contacts at this account
const { data: contacts } = await core.accounts.listContacts(accountId);
```

### Properties (job sites)

```ts
// All properties for an account
const { data: sites } = await core.properties.list({ accountId });

const { data: property } = await core.properties.create({
  accountId,
  name: "Main Campus — Building A",
  addressLine1: "123 Industrial Blvd",
  city: "Nashville",
  state: "TN",
  zip: "37201",
});
```

### Deals (estimate is attached to a deal)

```ts
// Open deals for an account
const { data: deals } = await core.deals.list({ accountId, outcome: null });

// Create a deal when an estimate becomes a formal pursuit
const { data: deal } = await core.deals.create({
  accountId,
  name: "Smith — Roof Replacement 2026",
  stage: "estimating",
  value: estimateTotal,
});

// Move stage
await core.deals.update(dealId, { stage: "proposal_sent" });

// Close as won — this is when a Project should be created
await core.deals.update(dealId, {
  outcome: "won",
  actualCloseDate: new Date(),
  wonReason: req.body.wonReason,
});
```

### Vendors (subs and suppliers on an estimate)

```ts
const { data: vendors } = await core.vendors.list({
  search: "apex electrical",
  complianceStatus: "active", // only compliant subs
});

// Check COI status before adding to estimate
if (vendor.complianceStatus !== "active") {
  // warn estimator — non-compliant vendor
}
```

### Projects (estimate → project link)

```ts
// Create a project when a deal is won
const { data: project } = await core.projects.create({
  accountId: deal.accountId,
  sourceDealId: deal.id,
  name: deal.name,
  status: "lead",
});
```

### Pagination — fetching all records

```ts
import { collectAll } from "@helm/sdk";

// Fetch all accounts (use carefully — large orgs can have many)
const allAccounts = await collectAll((cursor) =>
  core.accounts.list({ cursor, limit: 200 })
);

// Page by page (memory-efficient for large sets)
import { paginate } from "@helm/sdk";
for await (const page of paginate((cursor) => core.vendors.list({ cursor }))) {
  await syncVendorsToLocalCache(page);
}
```

### Error handling

```ts
import { CoreApiError } from "@helm/sdk";

try {
  const { data } = await core.accounts.get(accountId);
} catch (err) {
  if (err instanceof CoreApiError) {
    if (err.isNotFound) return res.status(404).json({ error: "Account not found" });
    if (err.isUnauthorized) return res.status(401).json({ error: "Session expired" });
    if (err.isValidation) return res.status(400).json({ error: err.details });
    // 500
    logger.error("Core API error", { status: err.status, code: err.code });
    return res.status(502).json({ error: "Upstream service error" });
  }
  throw err;
}
```

### TypeScript types

Import entity types from `@helm/types` for request/response typing:

```ts
import type { Account, Deal, Property, Vendor, Project } from "@helm/types";
```

These are the canonical shapes returned by the SDK. Use them to type your route handler responses, Zustand store slices, and TanStack Query return types on the frontend if you re-export them from your backend response DTOs.

## What NOT to do

```ts
// ❌ Never import from @helm/db — Quill has no access to Core's database
import { prisma } from "@helm/db";

// ❌ Never call Core when the flag is off — always null-check
const core = getCoreClient(slug);
const accounts = await core.accounts.list(); // crashes if core is null

// ❌ Never hardcode org slugs
getCoreClient("mac");

// ❌ Never catch CoreApiError silently — log it
try { ... } catch (err) { /* swallow */ }

// ❌ Never store Core entity IDs as foreign keys in the Quill DB without a column comment
// explaining they are Core IDs, not local Quill IDs.
```

## Dev auth

In development (`NODE_ENV=development`), Core accepts two headers that bypass Auth.js:

- `x-helm-test-user-id` — a real user UUID from the Core database
- `x-helm-test-org-slug` — the org slug

`getCoreClient()` injects these automatically when `devBypass` is configured. You do not need to set up Auth.js to test Core integration locally. Just set `CORE_DEV_USER_ID` in your `.env` and point `CORE_API_URL` at a running Core dev server.

Production auth (service-to-service tokens) is a Phase 6 item. The `getCoreClient()` function will throw in production until that is configured.

## Running Core locally

```bash
# From the helm monorepo root
pnpm dev --filter @helm/core
# Core API is now at http://localhost:3010

# Verify it's up
curl http://localhost:3010/api/health
# { "status": "ok", "service": "helm-core" }
```

Ensure `DATABASE_URL_CORE` in the helm root `.env` points to your Neon development branch.
