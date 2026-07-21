# Proof API contract (for Quill integration)

This is the API **Proof** needs to expose so **Quill** (estimating) can use Proof
as its vendor directory, display COI/insurance compliance, and trigger COI
requests. It intentionally mirrors the shape of the existing Core integration
(`backend/src/lib/core.ts`) so Quill's Proof client is a near-copy of its Core
client.

Nothing here requires Quill changes to *design* — build Proof to this contract
and the Quill side (client, routes, UI) drops in against it.

---

## 1. Conventions (match Core)

- **Base URL**: a single origin, injected into Quill as `PROOF_API_URL`
  (e.g. `https://proof.up.railway.app`).
- **Versioned, org-scoped paths**: every endpoint lives under
  `/api/v1/orgs/:orgSlug/...`. Proof is multi-tenant; `:orgSlug` scopes the
  request to one organization, exactly like Core.
- **JSON** in and out; `Content-Type: application/json`.
- **Cursor pagination** (not page numbers). List endpoints return:

  ```json
  { "data": [ ... ], "nextCursor": "string-or-null", "hasMore": true }
  ```

  Query params: `cursor` (opaque, from the previous `nextCursor`), `limit`
  (default 50, max 200).
- **Single-resource** responses wrap the object: `{ "data": { ... } }`.

### Auth

Service-to-service, same pattern as Core:

- **Production**: `Authorization: Bearer <token>`. Quill sends the value of its
  `PROOF_SERVICE_TOKEN` env var. Proof validates it and resolves it to an
  allowed org (or validates it against the `:orgSlug` in the path). Reject with
  `401` if missing/invalid, `403` if the token is valid but not allowed for that
  org.
- **Development bypass** (optional but recommended for parity): in
  `NODE_ENV=development`, also accept `x-helm-test-org-slug` so Quill can talk to
  a local Proof without minting tokens.

### Error envelope

Match Quill's error shape and, most importantly, use correct HTTP status codes —
Quill's client branches on the status:

```json
{ "error": { "code": "coi_request_conflict", "message": "A COI request is already open", "details": {} } }
```

| Status | When |
|--------|------|
| `400` / `422` | validation error (bad body/params) |
| `401` | missing/invalid token |
| `403` | token valid but not authorized for this org |
| `404` | vendor / resource not found |
| `409` | conflict (e.g. duplicate open COI request) |
| `5xx` | Proof-side failure |

---

## 2. Data shapes

### Vendor

The object the bid-package picker and COI display consume:

```json
{
  "id": "prf_vendor_123",
  "name": "Apex Electrical LLC",
  "trade": "Electrical",
  "email": "bids@apexelectrical.com",
  "phone": "+16155551234",
  "coreVendorId": "core_vendor_abc",
  "coi": {
    "status": "compliant",
    "expiresAt": "2026-09-30",
    "lastRequestedAt": "2026-06-01T14:22:00Z",
    "coverages": [
      { "type": "general_liability", "status": "compliant", "expiresAt": "2026-09-30", "limit": 2000000 },
      { "type": "workers_comp",      "status": "compliant", "expiresAt": "2026-11-15", "limit": 1000000 },
      { "type": "auto",              "status": "expiring_soon", "expiresAt": "2026-08-05", "limit": 1000000 }
    ]
  }
}
```

Field notes:

- `id` — **stable, Proof-owned** vendor id. Quill stores it as `proofVendorId`.
- `coreVendorId` — **optional**. If Proof and Core share vendor identity, return
  it so Quill can correlate with existing Core-backed rows. Omit/`null` if not
  applicable.
- `email` — required for Quill to send bid-pricing requests. Vendors without an
  email can be returned but Quill can't invite them to bid.
- `coi.coverages` — optional detail array; the picker only needs
  `coi.status` + `coi.expiresAt`, but the vendor-detail view will render
  coverages if present.

### COI status enum

`coi.status` (and each coverage `status`) is one of:

| Value | Meaning |
|-------|---------|
| `compliant` | all required coverages present and not expired |
| `expiring_soon` | compliant but a required policy expires within the org's threshold (e.g. 30 days) |
| `expired` | one or more required policies are expired |
| `pending` | a COI request is outstanding / under review, nothing valid yet |
| `none` | no COI on file |

**Proof owns this computation** — Quill just displays it. `coi.expiresAt` is the
earliest expiration among required coverages (drives the "expiring" badge).

---

## 3. Endpoints

### 3.1 List / search vendors — feeds the bid-package picker

```
GET /api/v1/orgs/:orgSlug/vendors
```

Query params (all optional): `search` (name match), `trade`, `coiStatus`
(filter by the enum above), `cursor`, `limit`.

Response: `PaginatedResult<Vendor>`.

```json
{
  "data": [ { "id": "prf_vendor_123", "name": "Apex Electrical LLC", "trade": "Electrical",
              "email": "bids@apexelectrical.com", "phone": "+16155551234",
              "coi": { "status": "compliant", "expiresAt": "2026-09-30", "lastRequestedAt": null } } ],
  "nextCursor": null,
  "hasMore": false
}
```

The list can return the lighter vendor form (omit `coverages`); the detail
endpoint returns the full object.

### 3.2 Get one vendor — COI detail view

```
GET /api/v1/orgs/:orgSlug/vendors/:vendorId
```

Response: `{ "data": Vendor }` with the full `coi.coverages` array. `404` if the
vendor isn't in this org.

### 3.3 Create a COI request — the "Request COI" button

```
POST /api/v1/orgs/:orgSlug/vendors/:vendorId/coi-requests
```

Body (all optional):

```json
{
  "coverageTypes": ["general_liability", "workers_comp"],
  "note": "Needed before we can award the electrical package.",
  "requestedByEmail": "estimator@buildco.com"
}
```

Behavior:

- Kicks off Proof's COI-request workflow (email the vendor, create a task,
  whatever Proof does today).
- **Idempotent-ish**: if an open request already exists for this vendor, return
  `409` with the existing request in `details`, **or** return `200` with the
  existing request — pick one and document it. Quill will treat both as "a
  request is already open" and show `pending`. Do **not** silently create
  duplicates.
- On success, set the vendor's `coi.status` to `pending` (or leave it if a valid
  COI already exists) and stamp `coi.lastRequestedAt`.

Response `201`:

```json
{
  "data": {
    "id": "prf_coireq_789",
    "vendorId": "prf_vendor_123",
    "status": "requested",
    "coverageTypes": ["general_liability", "workers_comp"],
    "requestedAt": "2026-07-21T16:40:00Z"
  }
}
```

### 3.4 (Optional) List COI requests for a vendor

```
GET /api/v1/orgs/:orgSlug/vendors/:vendorId/coi-requests
```

Handy for showing history/status in the detail view. Not required for v1.

---

## 4. Keeping COI status fresh (pick one)

Quill caches vendor/COI data locally (like it does for Core, in a
`ProofVendorCache` table). To avoid stale compliance badges, choose a freshness
mechanism:

- **Webhook (preferred)** — when a COI is uploaded/approved/expires, Proof POSTs
  to a Quill endpoint:

  ```
  POST {QUILL_API}/api/webhooks/proof/coi
  Header: X-Proof-Signature: <HMAC-SHA256 of the raw body, shared secret>
  Body: { "event": "coi.updated", "orgSlug": "buildco", "vendorId": "prf_vendor_123",
          "coi": { "status": "expired", "expiresAt": "2026-07-20", ... } }
  ```

  Quill verifies the signature and updates its cache. This keeps badges live with
  no polling. (Quill already has a signed inbound-webhook pattern for bid email.)

- **On-demand refresh** — if webhooks are more than you want to build now, Quill
  can just re-fetch a vendor from §3.2 when the estimator opens the vendor, and
  re-list on the picker. Simpler, but badges can be up to one page-load stale.

Webhooks can come later; the read endpoints (§3.1–3.2) are enough to ship.

---

## 5. What Proof does NOT need to build

- **Bid pricing collection.** Quill already owns the whole bid-request workflow
  (sending requests, the vendor portal, collecting responses, reminders, award).
  Proof only needs to be the **vendor directory** (name/trade/contact) plus
  **COI status** and the **COI-request trigger**. Quill sends the bid emails
  itself using the vendor `email` from §3.1.

---

## 6. Minimum viable slice

If you want the smallest thing that unblocks Quill:

1. `GET /vendors` (§3.1) — even without `coverages`.
2. `GET /vendors/:id` (§3.2).
3. `POST /vendors/:id/coi-requests` (§3.3).
4. Bearer-token auth + the error status codes in §1.

That's enough for Quill to: list vendors in the bid picker, show a COI badge,
open a vendor, and fire the "Request COI" button. Webhooks and coverage detail
are additive.

---

## 7. Env vars Quill will use (for reference)

```
HELM_PROOF_INTEGRATION=true          # feature flag; off = Quill ignores Proof entirely
PROOF_API_URL=https://proof.<host>   # base URL
PROOF_SERVICE_TOKEN=<bearer token>   # required in production when the flag is on
PROOF_WEBHOOK_SECRET=<shared secret> # only if using §4 webhooks
```

These follow the same resilient pattern as the Core vars: with the flag on but
config missing, Quill logs a warning and disables Proof rather than crashing.
