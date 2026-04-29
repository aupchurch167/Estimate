import { expect, test } from '@playwright/test';
import { signupViaUi, uniqueSignup } from './_helpers';

/**
 * Drafter happy path:
 *   signup → land on /app → create estimate → add a source → generate
 *   draft (deterministic via E2E_FAKE_ANTHROPIC) → submit for review.
 *
 * The fake AI client always returns the same single-line draft, so
 * assertions don't need fuzz tolerance.
 */
test('drafter creates an estimate, generates a draft, and submits for review', async ({ page }) => {
  const me = uniqueSignup('drafter');
  await signupViaUi(page, me);

  // 1. Create a new estimate from the dashboard / estimates list.
  await page.goto('/app/estimates');
  await page.getByRole('button', { name: /new estimate|create estimate/i }).click();
  await page.getByLabel(/title/i).fill('E2E Drafter TI');
  await page.getByRole('button', { name: /create|save/i }).click();
  await page.waitForURL(/\/app\/estimates\/[a-z0-9]+/);

  // 2. Add a TRANSCRIPT source so the generate flow has something to chew on.
  await page.getByRole('button', { name: /add source|new source/i }).click();
  await page.getByLabel(/title/i).fill('Walk-through notes');
  await page.getByLabel(/content|notes/i).fill('Demo a single back-of-house wall.');
  await page.getByRole('button', { name: /save source|add source/i }).click();

  // 3. Generate the draft. The deterministic fake returns a single
  //    Demolition section with one line item.
  await page.getByTestId('generate-draft').click();
  await expect(page.getByText(/Demo gypsum partition/i)).toBeVisible({ timeout: 30_000 });

  // 4. Submit for review.
  await page.getByRole('button', { name: /submit for review/i }).click();
  await page.getByRole('button', { name: /submit/i }).last().click();
  await expect(page.getByText(/IN REVIEW/i)).toBeVisible();
});
