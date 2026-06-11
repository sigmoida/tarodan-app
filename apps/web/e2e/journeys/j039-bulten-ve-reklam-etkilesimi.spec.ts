/**
 * J39 — Bülten ve reklam etkileşimi
 * Kaynak: suite-l-misc.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE L — Çapraz ve tam turlar (Misc).
 *
 * Kapsanan journeyler:
 *   J22  — Kupon ile indirimli alışveriş + indirimli fatura
 *   J31  — Alıcı ürün+satıcı puanlıyor; haksız puan engelleniyor (IDOR)
 *   J109 — Puanlama: önce alışveriş şartı
 *   J110 — Puan sınırı: 0 ve 6 reddedilir, 1-5 geçerli
 *   J32  — Adres yönetimi + aktif ilanla hesap silme engeli
 *   J39  — Bülten + reklam etkileşimi (geçersiz email red)
 *   J117 — Bülten aboneliği + reklam görüntüleme (IAB boyutları)
 *   J68  — Komisyon önizleme hatalı girdiler
 *   J114 — İndirim sahipliği IDOR (başka satıcı düzenleyemez)
 *   J126 — Misafir bilgi sayfaları + üye olma
 *   J128 — Tam tur: takas başlat → reddedil → satışa dön → satıl
 *   J130 — Tam tur: misafir alışveriş → iade → yeniden satın alma
 *   J135 — Tam tur: kupon → satın alma → yolda iade → (anlaşmazlık)
 *
 * Altyapı: gerçek backend (http://localhost:3001/api) + tarodan_test DB + Mailhog.
 * Ödeme bypass (PAYMENT_BYPASS=true). Zaman/durum atlamaları için dev hook'ları (backdate).
 *
 * Notlar (erişilemeyen adımlar):
 *  - Ürünü "teslim" durumuna getirip iade kargosu açma akışı gerçek Sürat Kargo
 *    entegrasyonu gerektirir; testte order.status backdate ile sürülür ve oluşan
 *    refundRequest durumu DB'den doğrulanır.
 *  - Hesap silme (J32 adım 5) seed verisini bozacağı için GERÇEKTEN silinmez;
 *    yalnız "aktif ilanla silme engeli" (400) doğrulanır.
 *  - DiscountController isAdmin=false hardcode'lu (TODO), bu yüzden global kupon
 *    sadece seller-scope olarak oluşturulabilir; kuponlar satıcı sahipliğinde kurulur.
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API,
  USERS,
  loginViaToken,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
  apiDefaultAddressId,
  fillRegisterForm,
  uniqueEmail,
} from '../support/helpers';
import { backdate, dbFind, dbCount } from '../support/db';
import { getLastEmailTo, extractCode, clearMailbox } from '../support/mail';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Bir ürünü puanlanabilir hale getir: order'ı delivered'a backdate et. */
async function backdateOrderToDelivered(request: APIRequestContext, orderId: string) {
  await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
}

/**
 * Satıcı sahipliğinde, kodu olan seller-scope yüzde kuponu oluştur.
 * DiscountController isAdmin=false olduğundan global kupon oluşturulamaz; seller-scope
 * tüm satıcı ürünlerine uygulanır → checkout'ta couponCode ile geçerlidir.
 */
async function createSellerCoupon(
  request: APIRequestContext,
  sellerToken: string,
  code: string,
  value: number,
): Promise<{ id: string; code: string }> {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request.post(`${API}/discounts`, {
    headers: auth(sellerToken),
    data: {
      code,
      name: `E2E Kupon ${code}`,
      type: 'percentage',
      value,
      scope: 'seller',
      startDate: start,
      endDate: end,
      isActive: true,
      usageLimitPerUser: 99,
      usageLimitTotal: 9999,
    },
  });
  expect(res.ok(), `kupon oluştur (${code})`).toBeTruthy();
  const body = await res.json();
  return { id: body.id, code: body.code ?? code.toUpperCase() };
}

// ════════════════════════════════════════════════════════════════════════
// J22 — Kupon ile indirimli alışveriş + indirimli fatura
// ════════════════════════════════════════════════════════════════════════

test.describe('J39 — Bülten + reklam etkileşimi (geçersiz email red)', () => {
  test('aktif reklam görüntü, bülten abone (idempotent), geçersiz email red', async ({ request }) => {
    // 1) Misafir aktif reklamları konuma göre görür (public)
    const adsRes = await request.get(`${API}/ads/active`, { params: { position: 'header' } });
    if (!adsRes.ok()) expect(adsRes.ok(), `reklamlar (${adsRes.status()}) ${(await adsRes.text()).slice(0,90)}`).toBeTruthy();
    expect(Array.isArray(await adsRes.json()), 'reklam listesi dizi').toBeTruthy();

    // 2) E-posta bültenine abone ol
    const email = uniqueEmail();
    const sub1 = await request.post(`${API}/newsletter/subscribe`, { data: { email, newsletter: true, promotions: true } });
    expect(sub1.ok(), 'bülten aboneliği').toBeTruthy();

    // DB: subscriber kaydı (model: newsletterSubscriber)
    const subRow = await dbFind(request, 'newsletterSubscriber', { email: email.toLowerCase() }, { email: true, unsubscribedAt: true });
    // Bazı implementasyonlar email'i lower-case saklamayabilir; her iki halde de say
    const cnt = await dbCount(request, 'newsletterSubscriber', { email: { in: [email, email.toLowerCase()] } });
    expect(cnt, 'subscriber DB kaydı oluştu').toBeGreaterThanOrEqual(1);
    if (subRow) expect(subRow.unsubscribedAt, 'abone aktif').toBeNull();

    // 3) Aynı e-postayla tekrar abone → hata çıkmadan işlenir (idempotent, tek kayıt)
    const sub2 = await request.post(`${API}/newsletter/subscribe`, { data: { email } });
    expect(sub2.ok(), 'tekrar abone sorunsuz işlenir').toBeTruthy();
    const cntAfter = await dbCount(request, 'newsletterSubscriber', { email: { in: [email, email.toLowerCase()] } });
    expect(cntAfter, 'tek kayıt kalır').toBe(cnt);

    // 4) Geçersiz e-posta ile abone → @IsEmail (400)
    const bad = await request.post(`${API}/newsletter/subscribe`, { data: { email: 'gecersiz-email' } });
    expect(bad.ok(), 'geçersiz email reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(bad.status());
  });
});
