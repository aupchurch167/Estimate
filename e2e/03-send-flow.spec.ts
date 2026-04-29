import { expect, test } from '@playwright/test';
import { signupViaUi, uniqueSignup } from './_helpers';

/**
 * Send flow.
 *
 * Walks the full pipeline: signup → create → generate → submit →
 * approve (since signup makes the user an OWNER, they can approve their
 * own estimates) → send via 'link' (avoids needing a working SendGrid
 * key in CI). Asserts the SENT status stamp and that a shareable link
 * is rendered in the dialog.
 */
test('send flow: approved estimate → Send → link method exposes a shareable URL', async ({ page }) => {
  const me = uniqueSignup('sender');
  await signupViaUi(page, me);

  await page.goto('/app/estimates');
  await page.getByRole('button', { name: /new estimate|create estimate/i }).click();
  await page.getByLabel(/title/i).fill('E2E Send TI');
  await page.getByRole('button', { name: /create|save/i }).click();
  await page.waitForURL(/\/app\/estimates\/[a-z0-9]+/);

  await page.getByRole('button', { name: /add source|new source/i }).click();
  await page.getByLabel(/title/i).fill('Notes');
  await page.getByLabel(/content|notes/i).fill('demo wall');
  await page.getByRole('button', { name: /save source|add source/i }).click();

  await page.getByTestId('generate-draft').click();
  await expect(page.getByText(/Demo gypsum partition/i)).toBeVisible({ timeout: 30_000 });

  // OWNER can self-approve in this seed; submit + approve.
  await page.getByRole('button', { name: /submit for review/i }).click();
  await page.getByRole('button', { name: /submit/i }).last().click();
  await page.getByRole('button', { name: /approve/i }).click();
  await page.getByRole('button', { name: /approve/i }).last().click();
  await expect(page.getByText(/APPROVED/i)).toBeVisible();

  // Open Send dialog, switch to link method, generate.
  await page.getByTestId('send-estimate').click();
  await page.getByTestId('send-method').selectOption('link');
  await page.getByTestId('send-submit').click();

  const url = page.getByTestId('send-link-url');
  await expect(url).toBeVisible({ timeout: 15_000 });
  expect(await url.inputValue()).toMatch(/^https?:\/\//);
  await expect(page.getByText(/SENT/i)).toBeVisible();
});
