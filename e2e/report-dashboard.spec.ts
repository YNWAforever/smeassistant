import { test, expect } from '@playwright/test';
for (const locale of ["zh-HK", "en"] as const) for (const width of [375, 1440]) test(`sample dashboard keyboard and layout ${locale} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => ['localhost','127.0.0.1','[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/${locale}/sample-report`);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  await expect(page.locator('h1')).toHaveCount(1);
  const trigger = page.getByRole('button', { name: /Instagram.*post 1/ });
  await expect(trigger).toBeVisible();
  for (const key of ['Enter', 'Space']) {
    await trigger.focus(); await page.keyboard.press(key);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  const reveal = page.getByRole('heading', { name: 'Instagram (7)', exact: true }).locator('..').locator(':scope > button');
  await reveal.focus(); await page.keyboard.press('Enter');
  await expect(reveal).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Instagram · post 7', exact: true })).toBeVisible();
  await page.keyboard.press('Space'); await expect(reveal).toHaveAttribute('aria-expanded', 'false');
  const disclosure = page.locator('details summary').first();
  await disclosure.focus(); await page.keyboard.press('Enter');
  await expect(disclosure.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('Space'); await expect(disclosure.locator('..')).not.toHaveAttribute('open', '');
  const caption = page.locator('article details summary').first();
  await caption.focus(); await page.keyboard.press('Enter');
  await expect(caption.locator('..')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.superpowers/sdd/dashboard/screenshots/sample-${locale}-${width}.png`, fullPage: true });
});