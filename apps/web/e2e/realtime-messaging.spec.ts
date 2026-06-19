import { test, expect } from '@playwright/test';

// İki kullanıcı: ahmet@demo.com ve mehmet@demo.com (Demo123!). Aralarında thread olmalı.
test('alıcının açık sohbetinde gelen mesaj anlık görünür', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // login helper'ı mevcut e2e pattern'ine göre uyarlanır (storageState veya UI login)
  await loginAs(pageA, 'ahmet@demo.com', 'Demo123!');
  await loginAs(pageB, 'mehmet@demo.com', 'Demo123!');

  await pageA.goto('/messages');
  await pageB.goto('/messages');

  // İki taraf da aynı thread'i açar
  await pageA.getByRole('listitem').first().click();
  await pageB.getByRole('listitem').first().click();

  const unique = `e2e-${Date.now()}`;
  await pageA.getByPlaceholder(/mesaj/i).fill(unique);
  await pageA.getByRole('button', { name: /gönder/i }).click();

  // B'nin AÇIK sohbetinde mesaj REST refetch olmadan görünmeli
  await expect(pageB.getByText(unique)).toBeVisible({ timeout: 5000 });
});

async function loginAs(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?posta|email/i).fill(email);
  await page.getByLabel(/şifre|password/i).fill(password);
  await page.getByRole('button', { name: /giriş/i }).click();
  await page.waitForURL(/\/(|messages|profile)/);
}
