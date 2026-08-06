/**
 * J33 — Sepet kuralları: stok sınırı ve başkasının ürünü
 * Kaynak: suite-c-cart.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * Suite C — Sepet ve Checkout journey'leri (J33, J58, J59, J60, J62, J65).
 *
 * Manuel turun birebir karsiligi: her adimda SONUC assert edilir
 * (cart API durumu, DB order kaydi, tutar/indirim, 4xx red kontrolu, IDOR).
 *
 * Endpointler controller'dan dogrulandi:
 *  - cart.controller.ts:  POST /cart/items {productId,quantity}; PATCH /cart/items/:productId {quantity};
 *                         DELETE /cart/items/:productId; GET /cart; POST /cart/coupon {code}; DELETE /cart/coupon
 *  - order.controller.ts: POST /orders/buy {productId,shippingAddressId}; GET /orders/:id;
 *                         PATCH /orders/:id/shipping-address {fullName,phone,city,district,address,zipCode?}
 *  - discount.controller.ts: POST /discounts (kupon yarat); seed'de hazir kupon YOK -> testte yaratiyoruz
 *  - offer.controller.ts: POST /offers {productId,amount}
 *  - product.controller.ts: GET /products/my (satici kendi urunleri)
 *
 * Hibrit (API + UI). loginViaToken protected sayfa dogrulamasinda kullanilir.
 */
import { test, expect } from "@playwright/test";
import {
  API,
  USERS,
  loginViaToken,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiDefaultAddressId,
  apiBuyAndPay,
  apiGetOrder,
} from "../support/helpers";
import { dbFind, dbCount } from "../support/db";

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Satin alinabilir, alicinin kendisine ait OLMAYAN, stoklu bir urun bul. */
async function buyableProduct(request: any, buyerId: string) {
  return apiFirstBuyableProduct(request, buyerId);
}

/** Bir kullanicinin (satici) kendi aktif urununu bul. */
async function ownActiveProduct(request: any, token: string) {
  const res = await request.get(`${API}/products/my`, {
    headers: auth(token),
    params: { limit: "50" },
  });
  expect(res.ok(), "GET /products/my").toBeTruthy();
  const body = await res.json();
  const list: any[] =
    body?.data ?? body?.products ?? (Array.isArray(body) ? body : []);
  const p = list.find((x) => x.status === "active");
  expect(p, "saticinin aktif kendi urunu bulundu").toBeTruthy();
  return p;
}

/** Sepeti temizle (test izolasyonu). */
async function clearCart(request: any, token: string) {
  await request.delete(`${API}/cart`, { headers: auth(token) }).catch(() => {});
}

// ───────────────────────────────────────────────────────────────────────────
// J33 — Sepet kurallari: stok siniri, kendi urunu engeli, qty=0 ile cikarma
// ───────────────────────────────────────────────────────────────────────────

test.describe("J33 — Sepet kurallari (stok / kendi urunu / qty0)", () => {
  test("stok asimi reddedilir, kendi urunu engellenir, qty0 satiri kaldirir, gecerli urunle tamamlanir", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    // buyerClean: ilani yok, her urunu alabilir
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    await clearCart(request, token);

    // 1) Bir urunu sepete ekle
    const product = await buyableProduct(request, me.id);
    const add1 = await request.post(`${API}/cart/items`, {
      headers: auth(token),
      data: { productId: product.id, quantity: 1 },
    });
    expect(add1.ok(), "urun sepete eklendi").toBeTruthy();
    const cart1 = await add1.json();
    const inCart = cart1?.calculation?.items?.find(
      (i: any) => i.productId === product.id,
    );
    expect(inCart?.quantity, "sepette 1 adet").toBe(1);

    // 2) Stoktan fazla adet eklemeyi dene -> kabul edilmemeli.
    //    DTO Max=99 oldugundan stok kontrolunu test etmek icin gercek stok degerini kullaniriz.
    const stock: number | null = product.quantity ?? null;
    if (typeof stock === "number" && stock + 1 <= 99) {
      // PATCH ile mevcut satiri stok+1'e cek -> "Stokta sadece X adet var" (400)
      const over = await request.patch(`${API}/cart/items/${product.id}`, {
        headers: auth(token),
        data: { quantity: stock + 1 },
      });
      expect(over.ok(), "stok asimi reddedildi").toBeFalsy();
      expect([400, 409]).toContain(over.status());
    } else {
      // Stok cok yuksek/null -> DTO Max=99 ustu deger ValidationPipe ile 400 verir (yine "kabul edilmedi").
      const over = await request.patch(`${API}/cart/items/${product.id}`, {
        headers: auth(token),
        data: { quantity: 100 }, // Max=99
      });
      expect(over.ok(), "asiri adet (DTO Max=99) reddedildi").toBeFalsy();
      expect([400, 409]).toContain(over.status());
    }

    // 3) Kendi urununu sepete eklemeyi dene -> engellenmeli.
    //    buyerClean satici degil; bu yuzden bir saticiyla onun kendi urununu deneriz.
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const own = await ownActiveProduct(request, sellerToken);
    const selfAdd = await request.post(`${API}/cart/items`, {
      headers: auth(sellerToken),
      data: { productId: own.id, quantity: 1 },
    });
    expect(selfAdd.ok(), "kendi urununu sepete ekleme engellendi").toBeFalsy();
    expect([400, 403]).toContain(selfAdd.status());

    // 4) Adedi 0 yap -> urun sepetten cikmali.
    const toZero = await request.patch(`${API}/cart/items/${product.id}`, {
      headers: auth(token),
      data: { quantity: 0 },
    });
    expect(toZero.ok(), "qty=0 islemi").toBeTruthy();
    const cartAfter = await toZero.json();
    const stillThere = cartAfter?.calculation?.items?.find(
      (i: any) => i.productId === product.id,
    );
    expect(stillThere, "urun sepetten cikti").toBeFalsy();

    // 5) Baska bir urunu ekleyip sepeti tamamla (Hemen Al + ode), akis bitti.
    const product2 = await buyableProduct(request, me.id);
    const { orderId } = await apiBuyAndPay(request, token, product2.id);
    const order = await dbFind(
      request,
      "order",
      { id: orderId },
      { id: true, status: true, buyerId: true },
    );
    expect(order.buyerId).toBe(me.id);
    expect(["paid", "preparing", "shipped", "completed"]).toContain(
      order.status,
    );

    // UI dogrulama: alici kendi siparisini goruyor
    await loginViaToken(page, token);
    await page.goto(`/profile/orders/${orderId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain(`/profile/orders/${orderId}`);
  });
});
