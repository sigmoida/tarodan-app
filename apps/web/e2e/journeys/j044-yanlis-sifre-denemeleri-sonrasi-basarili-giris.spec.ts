/**
 * J44 — Yanlış şifre denemeleri sonrası başarılı giriş
 * Saf UI: yanlış şifre → giremez (login'de kalır); doğru şifre → girer.
 */
import { test, expect } from '@playwright/test';
import { USERS, login } from '../support/helpers';

test.describe('J44 — Yanlış şifre giremez, doğru şifre girer', () => {
  test('yanlış şifre login sayfasında bırakır, doğru şifre giriş yaptırır', async ({ page }) => {
    // Yanlış şifre
    await page.goto('/login');
    await page.locator('input[type="email"]').first().fill(USERS.buyer.email);
    await page.locator('input[type="password"]').first().fill('Wrong000!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login'); // giremedi

    // Doğru şifre
    await login(page, USERS.buyer);
    expect(page.url()).not.toContain('/login');
  });
});
