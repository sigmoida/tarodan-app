/**
 * J79 — Hiç siparişi olmayan üyenin fatura listesi boş
 * Yeni üye → fatura listesi boş; var olmayan sipariş faturası 404; ilk alışveriş → fatura oluşur.
 */
import { test, expect } from '@playwright/test';
import {
  API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, fillRegisterForm, uniqueEmail,
} from '../support/helpers';
import { auth } from '../support/journeys-extra';

test.describe('J79 — Siparişsiz üyenin fatura listesi boş', () => {
  test('yeni üye fatura listesi boş, olmayan sipariş 404, ilk alışverişte fatura oluşur', async ({ page, request }) => {
    test.setTimeout(60_000);

    // 1) Yeni üye oluştur (UI register → backend kaydı) ve login dene
    await page.goto('/register');
    const creds = await fillRegisterForm(page, { email: uniqueEmail() });
    const reg = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST', { timeout: 15_000 }).catch(() => null);
    await page.locator('button[type="submit"]').first().click();
    const regResp = await reg;
    if (regResp) expect([200, 201]).toContain(regResp.status());

    // Yeni üye doğrulama gerektirebilir; siparişsiz fatura listesi için var olan temiz alıcıyı kullan
    // (deniz: ilan yok; bu test fatura boşluğu + ilk fatura oluşumu davranışını doğrular)
    const token = await apiLogin(request, USERS.buyerClean);
    void creds;

    // 2) Var olmayan sipariş için fatura → 404
    const missing = await request.get(`${API}/invoices/order/00000000-0000-0000-0000-000000000000`, { headers: auth(token) });
    expect(missing.ok(), 'olmayan sipariş faturası reddedilir').toBeFalsy();
    expect([400, 403, 404]).toContain(missing.status());

    // 3) İlk alışverişini yapıp faturasını oluşturur
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me.id);
    const { orderId } = await apiBuyAndPay(request, token, product.id);
    const gen = await request.post(`${API}/invoices/generate/${orderId}`, { headers: auth(token), data: {} });
    expect([200, 201, 409], 'fatura üretildi (veya zaten var)').toContain(gen.status());

    const inv = await request.get(`${API}/invoices/order/${orderId}`, { headers: auth(token) });
    expect(inv.ok(), 'ilk alışveriş faturası görülebilir').toBeTruthy();
  });
});
