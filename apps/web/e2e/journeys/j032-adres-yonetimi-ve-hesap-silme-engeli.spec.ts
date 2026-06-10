/**
 * J32 — Adres yönetimi ve hesap silme engeli
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

test.describe('J32 — Adres yönetimi + hesap silme engeli', () => {
  test('adres ekle/güncelle, kısa ad red, aktif ilanla hesap silme engeli', async ({ request }) => {
    test.setTimeout(60_000);

    // Aktif ilanı olan satıcı (zeynep) — silme engeli için
    const sellerToken = await apiLogin(request, USERS.sellerFree);

    // 1) Yeni teslimat adresi ekle, varsayılan yap
    const addRes = await request.post(`${API}/users/me/addresses`, {
      headers: auth(sellerToken),
      data: {
        title: 'E2E Adres', fullName: 'Test Kullanici', phone: '5551234567',
        city: 'Istanbul', district: 'Kadikoy', address: 'Moda Caddesi No 1 Daire 2',
        zipCode: '34710', isDefault: true,
      },
    });
    expect(addRes.ok(), 'adres eklendi').toBeTruthy();
    const newAddr = await addRes.json();
    const newAddrId = newAddr.id ?? newAddr?.address?.id;
    expect(newAddrId, 'yeni adres id').toBeTruthy();

    // 2) Çok kısa ad-soyadlı adres → @MinLength(2) (400)
    const shortRes = await request.post(`${API}/users/me/addresses`, {
      headers: auth(sellerToken),
      data: {
        fullName: 'A', phone: '5551234567', city: 'Istanbul', district: 'Kadikoy',
        address: 'Moda Caddesi No 1 Daire 2',
      },
    });
    expect(shortRes.ok(), 'kısa ad reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(shortRes.status());

    // 3) Mevcut adresi güncelle
    const updRes = await request.patch(`${API}/users/me/addresses/${newAddrId}`, {
      headers: auth(sellerToken),
      data: { title: 'E2E Adres Guncel', city: 'Ankara' },
    });
    expect(updRes.ok(), 'adres güncellendi').toBeTruthy();
    const updAddr = await dbFind(request, 'address', { id: newAddrId }, { title: true, city: true });
    expect(updAddr.city, 'DB adres city güncellendi').toBe('Ankara');

    // 4) Aktif ilanları varken hesabı sil → 400 (engel)
    const delRes = await request.delete(`${API}/users/me`, { headers: auth(sellerToken) });
    expect(delRes.ok(), 'aktif ilanla hesap silme engellenmeli').toBeFalsy();
    expect(delRes.status()).toBe(400);
    const delBody = await delRes.json().catch(() => ({}));
    const txt = JSON.stringify(delBody);
    expect(txt, 'aktif ilan gerekçesi mesajda').toMatch(/aktif ilan|ilanlar|kaldır/i);

    // 5) (Seed bozulmasın diye GERÇEK silme yapılmaz; engelin DB'de hâlâ kullanıcı
    //    olduğunu doğrula.)
    const me = await apiMe(request, sellerToken);
    expect(me?.id, 'kullanıcı hâlâ mevcut (silinmedi)').toBeTruthy();

    // Temizlik: eklenen test adresini sil
    await request.delete(`${API}/users/me/addresses/${newAddrId}`, { headers: auth(sellerToken) }).catch(() => {});
  });
});
