import { Page, expect } from '@playwright/test';

/**
 * Logs into GSTHero dev environment.
 * The site may show password on the main form or inside a popup dialog.
 */
export async function loginToGstHero(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('https://dev.gsthero.com/GspModel/login/', {
    waitUntil: 'load',
  });

  const emailInput = page.locator('#email');
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);

  await page.getByRole('button', { name: 'Continue' }).first().click();

  const passwordInForm = page.locator('#password');
  const passwordInDialog = page.getByRole('dialog').locator('input[type="password"]');
  const passwordField = passwordInForm.or(passwordInDialog).first();

  await expect(passwordField).toBeVisible({ timeout: 30_000 });
  await passwordField.fill(password);

  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.locator('input[type="password"]').fill(password);
    await dialog.getByRole('button', { name: 'Sign In' }).click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).first().click();
  }

  await page.locator('img[alt="loader"]').waitFor({ state: 'hidden', timeout: 90_000 }).catch(() => {});
  await expect(page).toHaveURL(/\/GspModel\/user\//, { timeout: 90_000 });
}
