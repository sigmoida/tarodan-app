/**
 * J1 — Yeni alici ilk alisverisini sorunsuz tamamliyor (hibrit: UI + API).
 *
 * Manuel-esdeger sonuc: alici giris yapar, bir urunu satin alip oder, sonucta
 * ODENMIS bir siparise sahip olur ve siparis sayfasinda gorur.
 *
 * Gercek PayTR sayfasi yerine odeme bypass ile tamamlanir (PAYMENT_BYPASS=true).
 * UI dogrulamada form-login yerine token enjekte edilir (flakiness yok).
 */
import { test, expect } from '@playwright/test';
import {
  USERS, loginViaToken, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, apiGetOrder,
} from '../support/helpers';

test.describe('J1 — Ilk alisveris (satin al + ode + dogrula)', () => {
  test('alici bir urunu satin alip oder, siparis odenmis olur', async ({ page, request }) => {
    test.setTimeout(60_000); // hibrit (API+UI) test

    // 1) API: alici token + kendi id
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);

    // 2) Satin alinabilir bir urun bul (alicinin kendisi degil)
    const product = await apiFirstBuyableProduct(request, me?.id);

    // 3) Satin al + ode (orders/buy -> payments/initiate -> bypass-complete)
    const { orderId } = await apiBuyAndPay(request, token, product.id);

    // 4) API dogrulama: siparis odendi/hazirlaniyor (sonuca assertion)
    const order = await apiGetOrder(request, token, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);

    // 5) UI dogrulama: token enjekte -> alici kendi siparisini gorebiliyor (404/login degil)
    await loginViaToken(page, token);
    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toMatch(/sayfa bulunamad|not found|404/i);
    expect(page.url()).toContain(`/orders/${orderId}`);
  });
});
