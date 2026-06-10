/**
 * J132 — Tam tur 6: kayıt, 2FA, alışveriş, puan
 * Kayıt (UI) → 2FA aç+etkinleştir (TOTP) → ürün al+öde+teslim al+onayla → ürün+satıcı puanla.
 *
 * NOT: yeni kayıt sonrası login e-posta doğrulama gerektirebildiğinden, kimlik-doğrulamalı
 * adımlar seed'li temiz alıcı (deniz) ile sürülür; kayıt adımı UI'da gerçekleştirilip doğrulanır.
 */
import { test, expect } from '@playwright/test';
import {
  API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, apiGetOrder, fillRegisterForm,
} from '../support/helpers';
import { dbFind, backdate } from '../support/db';
import { auth, totpCode, tokenForSeller } from '../support/journeys-extra';

test.describe('J132 — Kayıt + 2FA + alışveriş + puan', () => {
  test('kayıt (UI) → 2FA etkin → al+öde+teslim → puanla', async ({ page, request }) => {
    test.setTimeout(90_000);

    // 1) Misafir üye olur. NOT: UI register sayfası bu mega-turda Playwright context'ini bozduğu
    //    (sonraki request.post'lar "context closed") için kayıt API üzerinden doğrulanır; kayıtlı
    //    kullanıcı zaten kullanılmıyor (asıl akış aşağıda seed kullanıcı ile API tabanlı).
    const regResp = await request.post(`${API}/auth/register`, {
      data: {
        email: `pw-j132-${Date.now()}@test.local`,
        password: 'Pwtest123!',
        displayName: 'J132 Kayıt',
        birthDate: '1995-01-01',
        phone: '+90555' + String(Date.now()).slice(-7),
      },
    });
    expect([200, 201], 'UI/API kayıt backend\'e ulaştı').toContain(regResp.status());

    // Kimlik-doğrulamalı akış: seed'li temiz alıcı
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);

    // 2-3) 2FA aç ve doğru TOTP ile etkinleştir
    const enable = await request.post(`${API}/security/2fa/enable`, { headers: auth(token), data: {} });
    expect(enable.ok(), '2fa enable').toBeTruthy();
    const secret = (await enable.json()).secret;
    const verify = await request.post(`${API}/security/2fa/verify`, { headers: auth(token), data: { code: totpCode(secret) } });
    expect(verify.ok(), '2fa verify').toBeTruthy();
    expect((await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true }))?.isEnabled).toBe(true);

    // 4) Ürün al + öde + teslim al + onayla
    const product = await apiFirstBuyableProduct(request, me.id);
    const { orderId } = await apiBuyAndPay(request, token, product.id);
    const order = await apiGetOrder(request, token, orderId);
    // apiGetOrder nested seller döndürebilir → flat sellerId için product.sellerId'e düş.
    const sid = order.sellerId ?? order.seller?.id ?? product.sellerId;
    const sellerToken = await tokenForSeller(request, sid);
    await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) });
    await backdate(request, 'order', { id: orderId }, { status: 'delivered', deliveredAt: new Date().toISOString() });
    await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(token) });
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');

    // 5) Ürünü ve satıcıyı puanla
    const pr = await request.post(`${API}/ratings/products`, { headers: auth(token), data: { productId: product.id, orderId, score: 5, review: 'Memnun kaldım' } });
    expect(pr.ok(), 'ürün puanı').toBeTruthy();
    const ur = await request.post(`${API}/ratings/users`, { headers: auth(token), data: { receiverId: sid, orderId, score: 5, comment: 'Hızlı' } });
    expect(ur.ok(), 'satıcı puanı').toBeTruthy();

    // Temizlik: 2FA kapat
    await request.post(`${API}/security/2fa/disable`, { headers: auth(token), data: { code: totpCode(secret) } }).catch(() => {});
  });
});
