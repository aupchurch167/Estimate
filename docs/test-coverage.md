# Test Coverage (Phase 9.1–9.3)

Snapshot from the coverage audit, captured on the `claude/build-quill-mvp-EITZ6` branch after the Phase 10.4 commit.

## How to regenerate

```bash
# Backend (vitest --coverage with V8 provider)
npm --workspace backend run test:coverage

# Frontend (same)
npm --workspace frontend run test:coverage
```

Reports land in `<workspace>/coverage/`. CI uploads them as artifacts on the `backend-tests` and `frontend-tests` jobs (see `.github/workflows/ci.yml`) so you can grab the HTML report from the run.

---

## Backend snapshot

```
All files          |   83.28% statements |   86.05% lines
 src/lib           |   80.16% statements |   80.18% lines
 src/services      |   87.16% statements |   91.12% lines
 src/middleware    |   90.00% statements |   89.85% lines
 src/controllers   |   68.62% statements |   70.51% lines
```

The playbook's 80% target is met for `src/services/` and `src/lib/`. Controllers run lower because thin HTTP wrappers don't earn dedicated tests — they're covered by route-level supertest cases that hit the same code paths.

### Service-level highlights

| File                           | Statements | Lines |
| ------------------------------ | ---------- | ----- |
| `authService.ts`               | 97.36%     | 97.36% |
| `commentService.ts`            | 93.75%     | 97.67% |
| `reviewWorkflowService.ts`     | 92.59%     | 95.14% |
| `notificationService.ts`       | 92.68%     | 94.73% |
| `pdfService.ts`                | 90.78%     | 93.05% |
| `sendService.ts`               | 93.05%     | 94.20% |
| `userService.ts`               | 86.48%     | 90.00% |
| `lineItemService.ts`           | 81.81%     | 93.33% |
| `dashboardService.ts`          | 88.00%     | 93.18% |
| `conversationApplyService.ts`  | 81.42%     | 87.30% |
| `askFollowupService.ts`        | 75.00%     | 80.76% |
| `activityFeedService.ts`       | 70.58%     | 68.75% |

The state machine (`reviewWorkflowService`), markup cascade (`lineItemService`), number generation (`estimateService`), snapshot creation (`snapshotService`), cost cap (`aiService`), and permission functions are all in the 80–95% band. These are the modules the playbook explicitly called out as priorities.

### Known low-coverage spots (intentional / acceptable)

- `src/lib/anthropic.ts` (16%) — most of the file is the production singleton + the deterministic E2E fake, both of which are exercised through the test suite at runtime but bypass the SDK code paths. `__setAnthropicClientForTesting` injects a fake in unit tests.
- `src/controllers/*` thin wrappers — covered by route-level supertest cases instead of dedicated controller tests.

---

## Frontend snapshot

```
All files          |   72.69% statements |   74.62% lines
 components        |   89.5% (varies)
 features/auth     |   76.5%
 features/estimates|   84.6% (review subdir 89%)
 features/dashboard|   91.0%
 features/team     |   80.5%
 hooks             |   79.8% (useShortcut 81%, usePermissions 57%)
 pages             |   72.2%
 lib               |   61.4% (api/env intentionally light)
```

Critical user paths covered:

| Component                   | Statements |
| --------------------------- | ---------- |
| `Dashboard.tsx`             | 90%+ via tests |
| `RightRail.tsx`             | 89% (10 tests) |
| `ConversationPanel.tsx`     | 92% (15 tests) |
| `LineItemEditor.tsx`        | 86% |
| `SendButton.tsx`            | 91% (8 tests) |
| `UserTable.tsx`             | 84% (7 tests) |
| `Skeleton/EmptyState/ErrorState` | ~95% (8 tests) |

### Acceptable gaps

- `lib/api.ts` (21%) and `lib/env.ts` (24%) — pure configuration. The interesting branches (refresh-token interceptor, env validation failure) are exercised in integration tests when the backend rejects expired tokens.
- `Pricing.tsx` (48%) — large CRUD page with admin-only flows that don't have RTL coverage yet. Listed as a P1 follow-up.

---

## What's NOT covered

- **End-to-end coverage merging.** The Playwright suite (`e2e/`) covers three flows but its coverage isn't merged into the unit-test report. Vitest + Playwright coverage merging is doable with v8 reporter but adds CI complexity that isn't worth it at MVP scale.
- **Mutation testing.** Stryker.js or similar would catch tests that pass under arbitrary mutations, but it's a P2 investment.

---

## CI gate

The `.github/workflows/ci.yml` `backend-tests` and `frontend-tests` jobs run the full vitest suite on every push. Coverage HTML is uploaded as a 7-day artifact when the run completes, so you can pull it and check post-merge regressions without re-running locally.

For now we don't fail CI on a coverage delta; the suite must pass and the production build must compile. Tightening to "no drop below 80% on services" is a one-line vitest config change once the headline numbers stabilize.
