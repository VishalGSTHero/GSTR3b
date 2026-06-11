import { Page, expect, Locator } from '@playwright/test';

async function fillInputValue(input: Locator, value: string): Promise<void> {
  await input.evaluate((el, nextValue) => {
    const field = el as HTMLInputElement;
    field.removeAttribute('maxlength');
    field.maxLength = 9999;
    field.value = nextValue;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

  await expect(input).toHaveValue(value);
}

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
    waitUntil: 'domcontentloaded',
  });

  const emailInput = page.locator('#email');
  await expect(emailInput).toBeVisible();
  await fillInputValue(emailInput, email);
  await page.getByRole('button', { name: 'Continue' }).first().click();

  const passwordInForm = page.locator('#password');
  const dialog = page.getByRole('dialog');
  const passwordInDialog = dialog.locator('input[type="password"]');

  await expect(passwordInForm.or(passwordInDialog).first()).toBeVisible({ timeout: 30_000 });

  if (await dialog.isVisible()) {
    await fillInputValue(passwordInDialog, password);
    await dialog.getByRole('button', { name: 'Sign In' }).click();
  } else {
    await fillInputValue(passwordInForm, password);
    await page.getByRole('button', { name: 'Continue' }).first().click();
  }

  try {
    await expect(page).toHaveURL(/\/GspModel\/user\//, { timeout: 90_000 });
  } catch {
    throw new Error(
      'Login failed on GSTHero. Verify GSTHERO_EMAIL and GSTHERO_PASSWORD in GitHub Secrets or your .env file.',
    );
  }

  await page.locator('img[alt="loader"], .loader-component').first()
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => {});
}
