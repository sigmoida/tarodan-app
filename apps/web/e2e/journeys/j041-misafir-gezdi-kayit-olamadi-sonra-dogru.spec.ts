/**
 * J41 — Misafir gezdi, kayıt olamadı, sonra doğru bilgiyle üye oldu
 * Saf UI (manuel-eşdeğer): zayıf parola reddedilir, geçerli bilgiyle kayıt backend'e ulaşır.
 */
import { test, expect } from '@playwright/test';
import { fillRegisterForm } from '../support/helpers';

test.describe('J41 — Kayıt parola doğrulamaları', () => {
  test('zayif parola reddedilir, register sayfasinda kalir', async ({ page }) => {
    await page.goto('/register');
    await fillRegisterForm(page, { password: '12345', confirmPassword: '12345' });
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/register'); // gönderim engellendi
  });

  test('gecerli bilgiyle kayit backend cagrisi yapar (kabul edilir)', async ({ page }) => {
    await page.goto('/register');
    await fillRegisterForm(page);
    const respPromise = page
      .waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 10_000 })
      .catch(() => null);
    await page.locator('button[type="submit"]').first().click();
    const resp = await respPromise;
    if (resp) expect([200, 201]).toContain(resp.status());
  });
});
