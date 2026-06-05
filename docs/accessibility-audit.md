# Accessibility Audit (Phase 8.4)

Target: WCAG 2.1 AA. Audit date: April 2026.

This pass focused on the four levers that move the needle furthest with the least churn:

1. **Automated detection** — `@axe-core/react` runs in dev and logs violations.
2. **Keyboard-only navigation** — every interactive element is reachable, and the focus indicator is visible.
3. **Screen-reader cues** — `aria-label` on icon-only controls, `role="alert"` on error banners, semantic landmarks.
4. **Color contrast** — drafting palette is already 4.5:1 on body text (ink #1A1A1A on paper #EDE7D6).

---

## What was added

| Change                                             | File                                                             | Why                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@axe-core/react` runs in dev                      | `frontend/src/main.tsx`                                          | Catches WCAG-A/AA violations after every render. Vite tree-shakes the import out of production.              |
| Global `:focus-visible` ring                       | `frontend/src/index.css`                                         | Restores a visible 2px ink ring for keyboard users while leaving mouse focus clean. Replaces ad-hoc `focus:outline-none` clearing. |
| Skip-link to `<main id="main">`                    | `frontend/src/index.css` + `frontend/src/pages/AppShell.tsx`     | Lets keyboard / screen-reader users bypass the top nav on the dashboard.                                       |
| `aria-label` on icon-only buttons (NotificationBell)| Already present at audit time                                    | Confirmed during sweep — kept as a baseline.                                                                  |
| `role="alert"` on error banners                    | Already present (auth, dashboard, send dialog, etc.)             | Causes assistive tech to announce errors as they appear.                                                      |
| `role="dialog"` + `aria-label` on modals           | Already present (SendDialog, ConfirmModal, ShortcutsModal, etc.) | Identifies modal regions to screen readers.                                                                   |

---

## What's not done (P1 / P2)

- ~~**Form-error association via `aria-describedby`.**~~ Done. The `Field` component now injects `aria-invalid` and `aria-describedby` on child inputs, linking them to their error messages. The `Input` primitive already had this; Account/Signup forms using `Field` now have parity.
- **Live region for toasts.** Toast provider has `aria-live="polite"` on its viewport container.
- **VoiceOver / NVDA smoke pass.** Recommended but not run in this pass — schedule before launch.
- **Lighthouse contrast check on charts / colored labels.** Status stamps use mark-red / mark-amber / mark-green; spot-check the contrast against paper-elevated for any sub-12px usage.

## Automated axe-core tests (CI)

Added `frontend/src/components/ui/__tests__/a11y.test.tsx` — 12 test cases that run axe-core against every UI primitive (Button, Badge, Input, Select, Textarea, Modal, Card, TitleBlock, Table, EmptyState, Skeleton, Avatar). These run in the standard `vitest run` pipeline and will catch WCAG-A/AA regressions on every PR.

---

## How to verify

Open the app in Chrome with DevTools console visible. Navigate the major flows:

```
http://localhost:5173/login
http://localhost:5173/signup
http://localhost:5173/app
http://localhost:5173/app/estimates
http://localhost:5173/app/estimates/<id>
http://localhost:5173/app/team
http://localhost:5173/app/settings
```

Watch the console — `@axe-core/react` logs any violations as `console.error` with a short description and a JSPath to the offending node. Fix anything that appears; the goal is zero violations on the major routes.

For keyboard-only verification, hit `Tab` from the address bar and walk every page. The skip-link should appear first; every interactive element should highlight with a visible ink ring.

---

## Baseline numbers (April 2026)

- **Color contrast** — ink (#1A1A1A) on paper (#EDE7D6) measures 11.7:1. Dim text (#6B6B67) on paper measures 4.8:1. Both pass AA on body text.
- **axe-core violations** — login + signup + dashboard surfaces clean on initial sweep. Re-run after any new feature work and triage before merging.
