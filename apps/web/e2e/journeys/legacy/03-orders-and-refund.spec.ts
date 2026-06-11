/**
 * User Journey #3 — Sipariş Listesi + İade Talebi sayfaları
 *
 * Kapsamı: alıcı login → sipariş listesi → iade talebi sayfası açılır.
 */
import { test, expect } from '@playwright/test';

const BUYER = { email: 'mehmet@demo.com', password: 'Demo123!' };

async function login(page: any) {
  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]')
    .first()
    .fill(BUYER.email);
  await page.locator('input[type="password"], input[name="password"]')
    .first()
    .fill(BUYER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(profile|listings|$)/, { timeout: 10_000 }).catch(() => {});
}

test.describe('Journey 03 — Sipariş Listesi + İade Talebi', () => {
  test('alıcı sipariş listesini görüntüleyebilir', async ({ page }) => {
    await login(page);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders/);

    // Sipariş kartı veya boş state — biri görünmeli
    await page.waitForTimeout(2000);
    const ok =
      (await page.locator('text=/ORD-/i').count()) > 0 ||
      (await page.locator('text=/sipariş yok|no orders|henüz/i').count()) > 0;
    expect(ok).toBe(true);
  });

  test('iade talepleri sayfası açılır', async ({ page }) => {
    await login(page);

    await page.goto('/refund-requests');
    await expect(page).toHaveURL(/\/refund-requests/);
  });

  test('takas listesi açılır', async ({ page }) => {
    await login(page);

    await page.goto('/trades');
    await expect(page).toHaveURL(/\/trades/);
  });

  test('mesajlar sayfası açılır', async ({ page }) => {
    await login(page);

    await page.goto('/messages');
    await expect(page).toHaveURL(/\/messages/);
  });

  test('bildirimler sayfası açılır', async ({ page }) => {
    await login(page);

    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/notifications/);
  });
});
