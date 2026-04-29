import type { Page } from '@playwright/test';

/**
 * Generates a unique signup payload per test run so parallel / repeated
 * runs against the same database don't collide on the unique email
 * constraint.
 */
export function uniqueSignup(prefix: string) {
  const slug = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    companyName: `E2E ${prefix} ${slug}`,
    email: `${slug}@e2e.test`,
    password: 'OriginalPass1!',
    firstName: 'E2E',
    lastName: prefix,
  };
}

/**
 * Drives the signup form. Lands the viewer on /app afterward.
 */
export async function signupViaUi(
  page: Page,
  payload: ReturnType<typeof uniqueSignup>,
): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel(/company/i).fill(payload.companyName);
  await page.getByLabel(/first/i).fill(payload.firstName);
  await page.getByLabel(/last/i).fill(payload.lastName);
  await page.getByLabel(/email/i).fill(payload.email);
  await page.getByLabel(/password/i, { exact: false }).fill(payload.password);
  await page.getByRole('button', { name: /sign up|create account/i }).click();
  await page.waitForURL(/\/app(\/|$)/);
}

export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/app(\/|$)/);
}
