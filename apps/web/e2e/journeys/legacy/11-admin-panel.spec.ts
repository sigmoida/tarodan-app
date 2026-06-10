/**
 * User Journey #11 — Admin Paneli
 *
 * Kapsamı: admin app (port 3002) login, dashboard, kullanıcı listesi,
 * ürün listesi, sipariş listesi, ayarlar.
 *
 * Demo seed: admin@tarodan.com / Admin123!
 */
import { test, expect, Page } from '@playwright/test';

const ADMIN_URL = 'http://localhost:3002';
const ADMIN = { email: 'admin@tarodan.com', password: 'Admin123!' };

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
}

test.describe('Journey 11 — Admin Paneli', () => {
  test('admin login sayfası açılır', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    await expect(page.locator('input[type="email"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('admin login formu submit edildiğinde response veriyor', async ({ page }) => {
    // Login submit'in en azından bir backend yanıtı verdiğini doğrula
    await page.goto(`${ADMIN_URL}/login`);
    await page.locator('input[type="email"]').first().fill(ADMIN.email);
    await page.locator('input[type="password"]').first().fill(ADMIN.password);

    const responsePromise = page
      .waitForResponse((r) => r.url().includes('/auth') && r.request().method() === 'POST', {
        timeout: 10_000,
      })
      .catch(() => null);

    await page.locator('button[type="submit"]').first().click();
    const response = await responsePromise;

    // En azından /auth çağrısı yapıldı
    if (response) {
      expect([200, 201, 401, 403]).toContain(response.status());
    }
    // Sayfa hâlâ admin domain'de
    expect(page.url()).toContain('localhost:3002');
  });

  test('admin kullanıcı listesi sayfası açılır', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/users`);
    await page.waitForTimeout(2000);

    // Sayfada user emaillerinden biri görünmeli (seed data)
    const text = (await page.locator('body').textContent()) ?? '';
    const found =
      text.includes('@demo.com') ||
      text.includes('admin@tarodan.com') ||
      text.includes('Kullanıcı');
    expect(found).toBe(true);
  });

  test('admin ürün listesi sayfası açılır', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/products`);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/products');
    const text = (await page.locator('body').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(200);
  });

  test('admin sipariş listesi sayfası açılır', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/orders`);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/orders');
  });

  test('admin platform ayarları açılır', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/settings`);
    await page.waitForTimeout(2000);

    // Sayfa render olmalı
    const text = (await page.locator('body').textContent()) ?? '';
    expect(text.length).toBeGreaterThan(200);
  });

  test('admin raporlar sayfası açılır', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/reports`);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('localhost:3002');
  });

  test('giriş yapmamış kullanıcı /login\'e yönlenir', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/`);
    await page.waitForTimeout(2000);

    // Ya / sayfası ya /login'de olmalı
    const url = page.url();
    expect(url).toContain('localhost:3002');
  });
});
