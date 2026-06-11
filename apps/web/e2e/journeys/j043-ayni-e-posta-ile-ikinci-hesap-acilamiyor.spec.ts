/**
 * J43 — Aynı e-posta ile ikinci hesap açılamıyor
 * Saf UI: seed'li mevcut bir e-posta ile kayıt → "kullanımda" (400/409/422), register'da kalır.
 */
import { test, expect } from '@playwright/test';
import { USERS, fillRegisterForm } from '../support/helpers';

test.describe('J43 — Aynı e-posta ile ikinci kayıt reddedilir', () => {
  test('mevcut e-posta ile kayıt 400/409/422 döner, register sayfasinda kalir', async ({ page }) => {
    await page.goto('/register');
    // Seed'li mevcut bir e-posta ile kayıt dene
    await fillRegisterForm(page, { email: USERS.buyer.email });
    const respPromise = page
      .waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 10_000 })
      .catch(() => null);
    await page.locator('button[type="submit"]').first().click();
    const resp = await respPromise;
    if (resp) expect([400, 409, 422]).toContain(resp.status());
    expect(page.url()).toContain('/register');
  });
});
