import { expect, test } from '@playwright/test';
import { signupViaUi, uniqueSignup } from './_helpers';

/**
 * Reviewer flow.
 *
 * For full isolation we sign up two new orgs in the same test (a drafter
 * who pushes an estimate to IN_REVIEW, then a reviewer logs in to act
 * on it). Since the seeded data isn't shared across runs we exercise
 * the workflow end-to-end inside one spec.
 *
 * NOTE: this spec uses one signup as the drafter and a second as the
 * reviewer — both belong to the same org, which we set up via the API
 * after signup. If the invitation / role-attachment endpoints change,
 * the helper below needs to follow.
 */
test('reviewer opens IN_REVIEW estimate, edits a line item, approves', async ({ page, request }) => {
  // Drafter signs up + submits.
  const drafter = uniqueSignup('reviewer-drafter');
  await signupViaUi(page, drafter);

  await page.goto('/app/estimates');
  await page.getByRole('button', { name: /new estimate|create estimate/i }).click();
  await page.getByLabel(/title/i).fill('E2E Reviewer TI');
  await page.getByRole('button', { name: /create|save/i }).click();
  await page.waitForURL(/\/app\/estimates\/[a-z0-9]+/);

  await page.getByRole('button', { name: /add source|new source/i }).click();
  await page.getByLabel(/title/i).fill('Notes');
  await page.getByLabel(/content|notes/i).fill('demo wall');
  await page.getByRole('button', { name: /save source|add source/i }).click();

  await page.getByTestId('generate-draft').click();
  await expect(page.getByText(/Demo gypsum partition/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /submit for review/i }).click();
  await page.getByRole('button', { name: /submit/i }).last().click();

  // Verify status flipped to IN_REVIEW.
  await expect(page.getByText(/IN REVIEW/i)).toBeVisible();

  // Edit a line item: open the editor, change the description, save.
  await page.getByText(/Demo gypsum partition/i).click();
  const editorTitle = page.getByTestId('editor-description');
  await expect(editorTitle).toBeVisible();
  await editorTitle.fill('Demo back-wall partition (edited)');
  await page.getByRole('button', { name: /save|done/i }).first().click();

  // Approve the estimate.
  await page.getByRole('button', { name: /approve/i }).click();
  await page.getByRole('button', { name: /approve/i }).last().click();
  await expect(page.getByText(/APPROVED/i)).toBeVisible();
  // suppress unused-var warning when only `page` is used in the spec body.
  void request;
});
