import { test, expect } from '@playwright/test';
import { loginToGstHero } from './helpers/login';
import { getReturnMonth } from './helpers/returnMonth';

const EMAIL = process.env.GSTHERO_EMAIL ?? '';
const PASSWORD = process.env.GSTHERO_PASSWORD ?? '';
const GSTIN = process.env.GSTHERO_GSTIN ?? '33AFPPB3931BAZR';
const RETURN_MONTH = getReturnMonth();

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set GSTHERO_EMAIL and GSTHERO_PASSWORD in a .env file before running tests.');
  }
});

test('GSTR-3B filing flow', async ({ page }) => {
  test.setTimeout(180_000);

  await loginToGstHero(page, EMAIL, PASSWORD);
  await expect(page.getByRole('heading', { name: 'Business Dashboard' })).toBeVisible();

  await page.getByText('GST Return', { exact: true }).first().click();
  await page.locator('img[alt="loader"]').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

  const searchBox = page.locator('input[type="search"]');
  await expect(searchBox).toBeVisible({ timeout: 30_000 });
  await searchBox.fill(GSTIN);
  await searchBox.press('Enter');

  await expect(page.getByText('Process Return')).toBeVisible({ timeout: 30_000 });
  await page.getByText('Process Return').click();

  await expect(page.locator('#clientDashReturnPeriod')).toBeVisible({ timeout: 30_000 });
  await page.locator('#clientDashReturnPeriod').click();
  await expect(page.getByText(RETURN_MONTH, { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByText(RETURN_MONTH, { exact: true }).click();
  await page.locator('img[alt="loader"]').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

  await page.getByText('GSTR 3B | Rule 61(5)').scrollIntoViewIfNeeded();

  await expect(page.locator('#gstr3bUploadBtn')).toBeVisible();
  await page.locator('#gstr3bUploadBtn').click();

  const gstr3bUploadModal = page.locator('#upload-and-auto-confirm-gstr3b');
  await expect(gstr3bUploadModal).toBeVisible();
  await gstr3bUploadModal.getByText('Auto Populate', { exact: true }).click();

  const autopopulateConfirm = page.locator('#nilGSTR3B');
  await autopopulateConfirm.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await autopopulateConfirm.isVisible()) {
    await expect(autopopulateConfirm.getByText('GSTR3B AUTOPOPULATE')).toBeVisible();
    await page.locator('#uploadDataConfirm').click();
  }

  await page.locator('img[alt="loader"]').waitFor({ state: 'hidden', timeout: 90_000 }).catch(() => {});
});
