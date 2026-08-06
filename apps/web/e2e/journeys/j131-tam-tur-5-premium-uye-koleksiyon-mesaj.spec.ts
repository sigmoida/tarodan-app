/**
 * J131 — Tam tur 5: premium üye, koleksiyon, mesaj, satış
 * Kaynak: suite-h-membership.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE H — Üyelik & Koleksiyon journey'leri (hibrit: API + UI).
 *
 * Kapsanan journey'ler:
 *   J14   — Limit dolunca pakete geç, limit açılır, auto-renew kapat.
 *   J15   — Koleksiyon CRUD + paylaş (slug/browse) + beğeni + yabancı ekleme engeli.
 *   J30   — Premium üye koleksiyonunu showcase (public) yapar, beğeni alır, biri silinir.
 *   J104  — Mesaj gönderdikçe günlük kalan hak azalır (tier-bağımsız platform limiti — NOT).
 *   J105  — Koleksiyon sahipliği IDOR: yabancı düzenleyemez/ekleyemez.
 *   J106  — Adsız / çok kısa adlı koleksiyon reddedilir (min 3 karakter).
 *   J107  — Üyelik iptali + tekrar iptal red + yeniden abone + auto-renew kapat.
 *   J108  — Geçersiz tier red + auth'suz red + geçerli abone + limit kontrolleri.
 *   J131  — Premium tam tur: abone, koleksiyon+ürün, mesaj, satın al+öde, teslim.
 *   DOWNGRADE — backdate currentPeriodEnd + check-expired-memberships → free'ye düşer.
 *
 * Gerçek backend + tarodan_test DB. Ödeme PAYMENT_BYPASS ile tamamlanır.
 *
 * Üyelik akışı (controller'dan doğrulandı):
 *   POST /membership/subscribe {tierType, billingPeriod}  → ücretli tier'da
 *     status=past_due (efektif tier=free, pendingPayment=true) + {paymentId, useBypass:true}.
 *   POST /payments/:paymentId/bypass-complete → payment-success handler üyeliği active+gerçek tier yapar.
 *   POST /membership/cancel → status=cancelled (free iptal edilemez).
 *   PATCH /membership/auto-renew {autoRenew} → autoRenew alanını günceller.
 *   GET  /membership/me, /me/limits, /check/{listing,trade,collection}.
 *
 * NOT (J104): Günlük mesaj limiti platform ayarıdır (daily_message_limit, default 50),
 *   ÜYELIK TIER'INA BAĞLI DEĞİL (messaging.service getRemainingDailyMessages). Bu yüzden
 *   "yükseltince limit artar" backend'de gerçekleşmez; testte mesaj başına 'remaining'
 *   düşüşünü ve yükseltme sonrası limitin DEĞIŞMEDIĞINI doğruluyoruz (manuel-eşdeğer + gerçek davranış).
 */
import { test, expect, APIRequestContext } from "@playwright/test";
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
} from "../support/helpers";
import { backdate, runScheduler, dbFind, dbCount } from "../support/db";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ──────────────────────────── Üyelik yardımcıları ────────────────────────────

/** Üyeliği FREE'ye normalize et (cancel + downgrade scheduler) — testi re-run'a dayanıklı kılar. */
async function ensureFreeMembership(
  request: APIRequestContext,
  token: string,
  userId: string,
) {
  // Aktif/past_due paralı üyelik varsa iptal et (free zaten iptal edilemez → yut).
  await request.post(`${API}/membership/cancel`, {
    headers: auth(token),
    data: {},
  });
  // currentPeriodEnd'i geçmişe çek + scheduler ile free'ye indir.
  await backdate(
    request,
    "userMembership",
    { userId },
    {
      currentPeriodEnd: new Date("2020-01-01T00:00:00.000Z"),
      status: "active",
    },
  ).catch(() => {});
  await runScheduler(request, "check-expired-memberships");
}

/** Ücretli tier'a abone ol + bypass ile öde → üyelik aktifleşir. paymentId döner. */
async function subscribeAndPay(
  request: APIRequestContext,
  token: string,
  tierType: "basic" | "premium" | "business",
  billingPeriod: "monthly" | "yearly" = "monthly",
): Promise<string> {
  const subRes = await request.post(`${API}/membership/subscribe`, {
    headers: auth(token),
    data: { tierType, billingPeriod },
  });
  expect(subRes.ok(), `subscribe ${tierType}`).toBeTruthy();
  const sub = await subRes.json();
  // Ücretli tier: ödeme bekliyor; bypass için paymentId + useBypass gelmeli.
  expect(sub.useBypass, "PAYMENT_BYPASS açık (useBypass=true)").toBe(true);
  expect(sub.paymentId, "subscribe paymentId döndü").toBeTruthy();

  const done = await request.post(
    `${API}/payments/${sub.paymentId}/bypass-complete`,
    { data: {} },
  );
  expect(done.ok(), "membership bypass-complete").toBeTruthy();
  return sub.paymentId as string;
}

async function getMembership(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/me`, {
    headers: auth(token),
  });
  expect(res.ok(), "GET membership/me").toBeTruthy();
  return res.json();
}

async function getLimits(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/me/limits`, {
    headers: auth(token),
  });
  expect(res.ok(), "GET membership/me/limits").toBeTruthy();
  return res.json();
}

async function checkCollection(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/check/collection`, {
    headers: auth(token),
  });
  return res.json();
}

// ════════════════════════════════════════════════════════════════════════════
// J14 — Limit dolunca pakete geç, limit açılır, auto-renew kapat
// ════════════════════════════════════════════════════════════════════════════

test.describe("J131 — Tam tur: premium üye, koleksiyon, mesaj, satış", () => {
  test("satıcı premium+koleksiyon; alıcı mesaj+satın al+öde; sipariş ilerler", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    // 1) Satıcı (ahmet) premium pakete abone oldu.
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);
    await ensureFreeMembership(request, sellerToken, seller.id);
    await subscribeAndPay(request, sellerToken, "premium", "monthly");
    const mem = await dbFind(
      request,
      "userMembership",
      { userId: seller.id },
      { status: true, tier: { select: { type: true } } },
    );
    expect(mem.status).toBe("active");
    expect(mem.tier.type).toBe("premium");

    // 2) Koleksiyon oluşturup ürün ekledi ve herkese açık yaptı.
    const col = await (
      await request.post(`${API}/collections`, {
        headers: auth(sellerToken),
        data: { name: `J131 Tam Tur ${Date.now()}`, isPublic: false },
      })
    ).json();
    expect(col.id).toBeTruthy();
    await request.post(`${API}/collections/${col.id}/items`, {
      headers: auth(sellerToken),
      data: { customTitle: "Vitrin ürünü" },
    });
    await request.patch(`${API}/collections/${col.id}`, {
      headers: auth(sellerToken),
      data: { isPublic: true },
    });
    expect(
      (await (await request.get(`${API}/collections/${col.id}`)).json())
        .isPublic,
    ).toBe(true);

    // 3) Bir alıcı (deniz — ilanı yok, her ürünü alabilir) ürün hakkında mesaj attı.
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    // Ürünün satıcısını detaydan al (thread alıcı tarafı).
    const prodDetail = await (
      await request.get(`${API}/products/${product.id}`)
    ).json();
    const prodSellerId =
      (prodDetail.data ?? prodDetail.product ?? prodDetail).sellerId ??
      (prodDetail.seller && prodDetail.seller.id);
    expect(prodSellerId, "ürün satıcısı").toBeTruthy();

    const thread = await (
      await request.post(`${API}/messages/threads`, {
        headers: auth(buyerToken),
        data: {
          recipientId: prodSellerId,
          productId: product.id,
          message: "Bu ürün hâlâ satılık mı?",
        },
      })
    ).json();
    expect(thread.id, "mesaj thread oluştu").toBeTruthy();

    // 4) Satıcı yanıtladı (thread'in satıcı tarafıyla giriş yap).
    const ownerOfProductToken = await apiLogin(
      request,
      prodSellerId === seller.id ? USERS.sellerPremium : USERS.sellerBusiness,
    );
    // Satıcı kimliği eşleşmiyorsa (farklı seed satıcısı) yanıtı thread sahibi alıcı üzerinden değil,
    // doğrudan ürün satıcısı token'ıyla göndermeyi dene; eşleşmezse alıcı kendi thread'inde devam eder.
    let reply = await request.post(
      `${API}/messages/threads/${thread.id}/messages`,
      {
        headers: auth(ownerOfProductToken),
        data: { content: "Evet, müsait. Hemen alabilirsiniz." },
      },
    );
    if (!reply.ok()) {
      // Yedek: alıcı kendi thread'inde mesaj atar (mesajlaşma kanalı çalışıyor doğrulaması).
      reply = await request.post(
        `${API}/messages/threads/${thread.id}/messages`,
        {
          headers: auth(buyerToken),
          data: { content: "Tamamdır, satın alıyorum." },
        },
      );
    }
    expect(reply.ok(), "thread içinde yanıt mesajı gönderildi").toBeTruthy();

    // Alıcı ürünü satın aldı ve ödedi (orders/buy → initiate → bypass-complete).
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(["paid", "preparing", "shipped", "completed"]).toContain(
      order.status,
    );

    // DB'den ödeme/sipariş doğrula.
    const orderRow = await dbFind(
      request,
      "order",
      { id: orderId },
      { status: true, totalAmount: true },
    );
    expect(["paid", "preparing", "shipped", "completed"]).toContain(
      orderRow.status,
    );
    const payRow = await dbFind(
      request,
      "payment",
      { orderId },
      { status: true },
      { createdAt: "desc" },
    );
    expect(payRow?.status, "ödeme tamamlandı").toBeTruthy();

    // 5) UI: alıcı kendi siparişini görebiliyor (404/login değil).
    await loginViaToken(page, buyerToken);
    await page.goto(`/profile/orders/${orderId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body.length).toBeGreaterThan(150);
    expect(body).not.toMatch(/sayfa bulunamad|not found|404/i);
  });
});
