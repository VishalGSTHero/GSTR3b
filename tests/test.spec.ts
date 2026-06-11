import { test, expect } from '@playwright/test';
import { loginToGstHero } from './helpers/login';
import { getReturnMonth } from './helpers/returnMonth';
import { waitForPageReady } from './helpers/waitForPageReady';

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
  await expect(page.getByRole('heading', { name: 'Business Dashboard' })).toBeVisible({ timeout: 30_000 });
  await waitForPageReady(page);

  await page.getByText('GST Return', { exact: true }).first().click();
  await waitForPageReady(page);

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
  await waitForPageReady(page);

  await page.getByText('GSTR 3B | Rule 61(5)').scrollIntoViewIfNeeded();

  const uploadBtn = page.locator('#gstr3bUploadBtn');
  await expect(uploadBtn).toBeVisible();
  await uploadBtn.scrollIntoViewIfNeeded();
  await uploadBtn.click();
  await waitForPageReady(page);

  const otpModal = page.getByText('Verify OTP to connect to the GST Network');
  if (await otpModal.isVisible({ timeout: 5_000 }).catch(() => false)) {
    throw new Error(
      'GSTN OTP popup appeared. Complete OTP setup in GSTHero or resolve the environment issue before automation can continue.',
    );
  }

  const autoPopulateBtn = page.locator('.gstr3BAutoPopulateBtnInPopup');
  await expect(autoPopulateBtn).toBeVisible({ timeout: 30_000 });
  await autoPopulateBtn.click();

  const autopopulateConfirm = page.locator('#nilGSTR3B');
  await autopopulateConfirm.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await autopopulateConfirm.isVisible()) {
    await expect(autopopulateConfirm.getByText('GSTR3B AUTOPOPULATE')).toBeVisible();
    await page.locator('#uploadDataConfirm').click();
  }

  await waitForPageReady(page, 90_000);
});
