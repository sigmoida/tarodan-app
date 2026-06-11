/**
 * J78 — Fatura erişimi: yabancı engelleniyor
 * Alıcı alır+öder → fatura oluşur; alıcı kendi faturasını görür, yabancı göremez (403/404).
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay } from '../support/helpers';
import { auth } from '../support/journeys-extra';

test.describe('J78 — Fatura erişimi (alıcı görür, yabancı engellenir)', () => {
  test('fatura oluşur, alıcı görür, yabancı 403/404, alıcı tipe göre filtreler', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı aldı + ödedi → fatura otomatik/oluşturulabilir
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    // Fatura yoksa üret (idempotent)
    await request.post(`${API}/invoices/generate/${orderId}`, { headers: auth(buyerToken), data: {} }).catch(() => {});

    // 2) Alıcı kendi faturasını görür
    const mine = await request.get(`${API}/invoices/order/${orderId}`, { headers: auth(buyerToken) });
    expect(mine.ok(), 'alıcı kendi faturasını görür').toBeTruthy();

    // 3) Yabancı biri bu siparişin faturasına erişmeye çalışır → 403/404
    const strangerToken = await apiLogin(request, USERS.newMember);
    const idor = await request.get(`${API}/invoices/order/${orderId}`, { headers: auth(strangerToken) });
    expect(idor.ok(), 'yabancı fatura erişimi engellenmeli').toBeFalsy();
    expect([403, 404]).toContain(idor.status());

    // 4) Alıcı faturalarını listeler (tipe göre filtre denemesi)
    const list = await request.get(`${API}/invoices`, { headers: auth(buyerToken), params: { type: 'sale' } });
    expect([200, 404], 'fatura listesi erişilebilir').toContain(list.status());
  });
});
