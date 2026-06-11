import { Page } from '@playwright/test';

/** Wait until GSTHero loader overlays are gone before clicking. */
export async function waitForPageReady(page: Page, timeout = 60_000): Promise<void> {
  const loaders = page.locator('img[alt="loader"], .loader-component');
  for (let i = 0, count = await loaders.count(); i < count; i += 1) {
    await loaders.nth(i).waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
}
