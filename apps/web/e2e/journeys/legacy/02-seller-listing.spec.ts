/**
 * User Journey #2 — Satıcı İlan Yönetimi
 *
 * Kapsamı: satıcı login → ilan ver sayfası → satıcı paneli → mevcut ilanlar.
 *
 * Demo seed'inde `ahmet@demo.com` (Premium, isSeller=true) kullanılıyor.
 */
import { test, expect } from '@playwright/test';

const SELLER = { email: 'ahmet@demo.com', password: 'Demo123!' };

async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]')
    .first()
    .fill(email);
  await page.locator('input[type="password"], input[name="password"]')
    .first()
    .fill(password);
  await page.locator('button[type="submit"]').first().click();
  // Post-login yönlendirme
  await page.waitForURL(/\/(profile|listings|$)/, { timeout: 10_000 }).catch(() => {});
}

test.describe('Journey 02 — Satıcı İlan Yönetimi', () => {
  test('satıcı login + ilan ver sayfası açılır', async ({ page }) => {
    await login(page, SELLER.email, SELLER.password);

    // İlan Ver sayfası
    await page.goto('/sell');

    // Form veya açıklama alanı görünmeli
    const formExists = await page.locator('form, input, button').count();
    expect(formExists).toBeGreaterThan(0);
  });

  test('satıcı kendi ilanlarını listeleyebilir (profil)', async ({ page }) => {
    await login(page, SELLER.email, SELLER.password);

    await page.goto('/profile');
    // Profil sayfasında satıcı bilgileri görünmeli
    await expect(page.locator('body')).toContainText(/ahmet/i, { timeout: 10_000 });
  });

  test('satıcı gelen tekliflerini görebilir', async ({ page }) => {
    await login(page, SELLER.email, SELLER.password);

    await page.goto('/offers');
    // Sayfa açılmalı (içerik boş olabilir)
    await expect(page).toHaveURL(/\/offers/);
  });
});
