/**
 * User Journey #4 — Statik / Yasal / SEO Sayfaları
 *
 * Bu sayfalar guest kullanıcı tarafından da erişilebilir; sunum sırasında
 * "tüm yasal sayfalar yerinde mi" diye kontrol için.
 */
import { test, expect } from '@playwright/test';

const PUBLIC_PAGES: { path: string; expectsText?: RegExp }[] = [
  { path: '/about' },
  { path: '/contact' },
  { path: '/faq' },
  { path: '/help' },
  { path: '/cookies' },
  { path: '/distance-sales' },
  { path: '/refund-policy' },
  { path: '/buyer-protection' },
  { path: '/seller-agreement' },
  { path: '/intellectual-property' },
  { path: '/authenticity' },
  { path: '/guvenli-takas' },
  { path: '/collectors-guide' },
  { path: '/guides' },
];

test.describe('Journey 04 — Statik Sayfalar (yasal, yardım, SEO)', () => {
  for (const { path, expectsText } of PUBLIC_PAGES) {
    test(`${path} açılır ve içerik render eder`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status() ?? 200).toBeLessThan(500);

      // Sayfada herhangi bir içerik olmalı (boş 404 değil)
      const bodyText = await page.locator('body').textContent();
      expect((bodyText ?? '').length).toBeGreaterThan(50);

      if (expectsText) {
        expect(bodyText).toMatch(expectsText);
      }
    });
  }
});
