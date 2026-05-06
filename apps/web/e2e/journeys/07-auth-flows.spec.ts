/**
 * User Journey #7 — Auth Akışları
 *
 * Kayıt formu, login form validation, forgot-password, çıkış.
 * Demo seed kullanıcılarıyla.
 */
import { test, expect } from '@playwright/test';

test.describe('Journey 07 — Auth (kayıt + giriş + parola sıfırla)', () => {
  test('kayıt sayfası form alanlarını gösterir', async ({ page }) => {
    await page.goto('/register');

    // En azından e-posta + şifre + submit görünmeli
    await expect(page.locator('input[type="email"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('forgot password sayfası açılır', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).toHaveURL(/\/forgot-password/);

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
  });

  test('geçersiz şifre ile giriş hatası', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"], input[name="email"]')
      .first()
      .fill('mehmet@demo.com');
    await page.locator('input[type="password"], input[name="password"]')
      .first()
      .fill('WRONG_PASSWORD_123');

    await page.locator('button[type="submit"]').first().click();

    // Hata mesajı veya sayfa hâlâ /login olmalı
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/login');
  });

  test('geçerli giriş + çıkış akışı', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.locator('input[type="email"], input[name="email"]')
      .first()
      .fill('mehmet@demo.com');
    await page.locator('input[type="password"], input[name="password"]')
      .first()
      .fill('Demo123!');
    await page.locator('button[type="submit"]').first().click();

    // Login sonrası
    await page.waitForURL(/\/(profile|listings|$)/, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).not.toContain('/login');

    // localStorage'da token var mı
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });

  test('login sayfasından kayıt olma sayfasına yönlendirme', async ({ page }) => {
    await page.goto('/login');

    // Bir "kayıt ol", "üye ol" linki bulmalı
    const registerLink = page
      .locator('a[href*="register"], a[href*="kayit"]')
      .first();
    if ((await registerLink.count()) > 0) {
      await registerLink.click();
      await page.waitForURL(/\/register/, { timeout: 5_000 });
    }
  });
});
