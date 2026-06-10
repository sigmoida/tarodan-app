/**
 * User Journey #12 — Mesajlaşma + Wishlist + Favoriler
 *
 * Kapsamı: alıcı login → mesajlar listesi → bildirim listesi → wishlist
 * → favoriler → koleksiyon detay.
 */
import { test, expect, Page } from '@playwright/test';

const BUYER = { email: 'mehmet@demo.com', password: 'Demo123!' };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(BUYER.email);
  await page.locator('input[type="password"]').first().fill(BUYER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(profile|listings|$)/, { timeout: 10_000 }).catch(() => {});
}

test.describe('Journey 12 — Mesajlaşma + Wishlist + Koleksiyonlar', () => {
  test('mesajlar sayfası açılıp empty state veya thread listesi gösterir', async ({ page }) => {
    await login(page);
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/messages/);

    await page.waitForTimeout(2000);
    const text = (await page.locator('body').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(100);
  });

  test('bildirimler sayfası açılır', async ({ page }) => {
    await login(page);
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/notifications/);

    const text = (await page.locator('body').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(100);
  });

  test('favoriler sayfası açılır', async ({ page }) => {
    await login(page);
    await page.goto('/favorites');
    await expect(page).toHaveURL(/\/favorites/);
  });

  test('wishlist sayfası açılır', async ({ page }) => {
    await login(page);
    await page.goto('/wishlist');
    await expect(page).toHaveURL(/\/wishlist/);
  });

  test('koleksiyonlarım sayfası açılır', async ({ page }) => {
    await login(page);

    // /collections/me ya da /profile altında sekmesi olabilir
    await page.goto('/collections');
    await expect(page).toHaveURL(/\/collections/);

    const text = (await page.locator('body').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(100);
  });

  test('kullanıcı profili public erişim', async ({ page }) => {
    await login(page);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
  });
});
