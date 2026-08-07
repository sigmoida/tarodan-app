/**
 * Bildirim linkleri gerçek route'a gitmeli.
 *
 * Birim testler hedefin doğru STRING olduğunu kanıtlar; buradaki testler o
 * adresin tarayıcıda gerçekten açıldığını ve 404 OLMADIĞINI doğrular. Eski
 * hata tam buradaydı: `/orders/:id`, `/trades/:id`, `/offers?tab=received`
 * gibi yollar üretiliyordu ve hiçbiri web'de yoktu.
 *
 * Bildirimler `POST /dev/notifications/seed` ile TOHUMLANIR ve gerçek yazma
 * yolundan geçer. Önceki sürüm var olan bildirimlere bakıp hiçbiri yoksa
 * `test.skip` ediyordu — yani boş veritabanında yeşil görünüyordu.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  API,
  apiBuyAndPay,
  apiFirstBuyableProduct,
  apiLogin,
  apiMe,
  loginViaToken,
  USERS,
} from "./support/helpers";
import { seedNotifications, type SeedNotification } from "./support/db";
import {
  adminToken,
  anyCategoryId,
  createActiveProduct,
} from "./support/journeys-extra";

const NOT_FOUND = /sayfa bulunamad|not found|404/i;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Tohumlanan bildirim + o bildirimin AÇMASI GEREKEN hedef. */
type LinkCase = SeedNotification & { expected: string };

/** `expected` yalnız testin beklentisi; tohumlama hattına gitmez. */
const seedOf = ({ expected: _expected, ...seed }: LinkCase): SeedNotification =>
  seed;

/**
 * Hedefin gerçekten açıldığını doğrula: HTTP durumu 4xx/5xx olmamalı ve sayfa
 * "bulunamadı" metni göstermemeli (Next `not-found` bazı durumlarda 200 ile
 * render eder, bu yüzden ikisi birden kontrol edilir).
 */
async function expectRealPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response, `${path} yanıt vermedi`).toBeTruthy();
  expect(
    response!.status(),
    `${path} → HTTP ${response!.status()}`,
  ).toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body.length, `${path} boş açıldı`).toBeGreaterThan(200);
  expect(body, `${path} 404 döndü`).not.toMatch(NOT_FOUND);
}

/** Bildirim merkezindeki kartların hedefleri — testid ile KAPSAMLI seçilir. */
async function centreHrefs(page: Page): Promise<string[]> {
  await page.goto("/profile/notifications");
  const list = page.getByTestId("notification-list");
  await expect(list).toBeVisible();
  const links = list.getByTestId("notification-card-link");
  await expect(links.first()).toBeVisible();
  return (await links.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("href") ?? ""),
  )) as string[];
}

/** Locale öneki middleware tarafından eklenir; karşılaştırma ona göre yapılır. */
function pathnameOf(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname.replace(/^\/(tr|en)(?=\/|$)/, "")}${search}`;
}

test.describe("bildirim hedefleri gerçek sayfaya gider", () => {
  test.describe.configure({ mode: "serial" });

  test("alıcının dinamik hedefleri: sipariş, ilan, teklif, mesaj, koleksiyon", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    const token = await apiLogin(request, USERS.buyer);
    const buyer = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    const { orderId } = await apiBuyAndPay(request, token, product.id);

    // Mesaj konuşması ve koleksiyon: linkte GERÇEK id geçmeli.
    const threadRes = await request.post(`${API}/messages/threads`, {
      headers: auth(token),
      data: {
        recipientId: product.sellerId ?? product.seller?.id,
        productId: product.id,
        message: "Bildirim linki testi",
      },
    });
    expect(
      threadRes.ok(),
      `konuşma açıldı (${threadRes.status()})`,
    ).toBeTruthy();
    const threadId = (await threadRes.json()).id;

    const collectionRes = await request.post(`${API}/collections`, {
      headers: auth(token),
      data: {
        name: `Bildirim linki ${Date.now()}`,
        description: "E2E",
        isPublic: true,
      },
    });
    expect(collectionRes.ok(), "koleksiyon oluştu").toBeTruthy();
    const collectionId = (await collectionRes.json()).id;
    const sellerId = product.sellerId ?? product.seller?.id;

    // Her satır: üretici ne gönderiyorsa o + linkin AÇMASI GEREKEN hedef.
    const cases: LinkCase[] = [
      {
        type: "order_shipped",
        data: { orderId },
        expected: `/profile/orders/${orderId}`,
      },
      {
        type: "refund_approved",
        data: { orderId },
        expected: `/profile/orders/${orderId}`,
      },
      {
        type: "back_in_stock",
        data: { productId: product.id },
        expected: `/listings/${product.id}`,
      },
      {
        // Kabul edilen teklifte sipariş YOKTUR; hedef ilandır.
        type: "offer_accepted",
        data: { productId: product.id },
        expected: `/listings/${product.id}`,
      },
      {
        type: "order_cancelled_out_of_stock",
        data: { productId: product.id },
        expected: `/products/unavailable/${product.id}`,
      },
      {
        type: "offer_received",
        data: {},
        expected: "/profile/offers?tab=received",
      },
      {
        type: "new_message",
        data: { threadId },
        expected: `/profile/messages?thread=${threadId}`,
      },
      {
        type: "collection_liked",
        data: { collectionId },
        expected: `/collections/${collectionId}`,
      },
      {
        type: "new_follower",
        data: { followerId: sellerId },
        expected: `/seller/${sellerId}`,
      },
      { type: "membership_expiring", data: {}, expected: "/membership" },
      { type: "payment_received", data: {}, expected: "/profile/payments" },
      {
        // ŞABLONU YOK: EventService bunu push kuyruğuna atar, satırı
        // PushWorker yazar. Dispatch yolundan geçirilemez.
        type: "payment_confirmed",
        path: "worker",
        title: "Ödeme Onaylandı",
        body: "Siparişiniz için ödeme alındı",
        data: { orderId },
        expected: `/profile/orders/${orderId}`,
      },
    ];

    await seedNotifications(request, USERS.buyer.email, cases.map(seedOf));
    await loginViaToken(page, token);

    const hrefs = await centreHrefs(page);
    expect(hrefs.length, "her tohumlanan bildirim tıklanabilir").toBe(
      cases.length,
    );
    // En yeni üstte: tohumlama sırası ters çevrilir.
    expect(hrefs).toEqual([...cases].reverse().map((c) => c.expected));

    // Çözülmemiş şablon hiçbir zaman DOM'a çıkmamalı.
    for (const href of hrefs) expect(href).not.toContain("{{");

    for (const href of hrefs) await expectRealPage(page, href);

    // Gerçek tıklama: href doğru olsa da navigasyon çalışmayabilir.
    await page.goto("/profile/notifications");
    const first = page
      .getByTestId("notification-list")
      .getByTestId("notification-card-link")
      .first();
    const firstHref = await first.getAttribute("href");
    await first.click();
    await page.waitForURL((url) => pathnameOf(url.toString()) === firstHref);
    expect(pathnameOf(page.url())).toBe(firstHref);
  });

  test("satıcının hedefleri alıcınınkinden ayrışır: sipariş ve takas", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);

    // Takas: iki takas-uygun ürün gerekiyor.
    const otherToken = await apiLogin(request, USERS.sellerBusiness);
    const other = await apiMe(request, otherToken);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const mine = await createActiveProduct(
      request,
      sellerToken,
      adminTok,
      categoryId,
      { price: 1000, tradeEnabled: true, title: "Bildirim linki takas A" },
    );
    const theirs = await createActiveProduct(
      request,
      otherToken,
      adminTok,
      categoryId,
      { price: 1000, tradeEnabled: true, title: "Bildirim linki takas B" },
    );
    const tradeRes = await request.post(`${API}/trades`, {
      headers: auth(sellerToken),
      data: {
        receiverId: other.id,
        initiatorItems: [{ productId: mine.id, quantity: 1 }],
        receiverItems: [{ productId: theirs.id, quantity: 1 }],
        message: "Bildirim linki testi",
      },
    });
    expect(tradeRes.ok(), `takas oluştu (${tradeRes.status()})`).toBeTruthy();
    const tradeId = (await tradeRes.json())?.id;
    expect(tradeId, "tradeId").toBeTruthy();

    const cases: LinkCase[] = [
      {
        // Satıcıya giden sipariş bildirimi ALICI ekranını açmamalı.
        type: "order_paid",
        data: { orderId, audience: "seller" },
        expected: `/seller/orders/${orderId}`,
      },
      {
        type: "product_sold",
        data: { orderId },
        expected: `/seller/orders/${orderId}`,
      },
      {
        type: "trade_received",
        data: { tradeId },
        expected: `/profile/trades/${tradeId}`,
      },
      {
        // ŞABLONU YOK: gerçek hattı kuyruk + worker.
        type: "trade_ready_for_shipping",
        path: "worker",
        title: "Takas Kargoya Hazır",
        body: "Ürününüzü kargoya verebilirsiniz",
        data: { tradeId },
        expected: `/profile/trades/${tradeId}`,
      },
    ];

    await seedNotifications(
      request,
      USERS.sellerPremium.email,
      cases.map(seedOf),
    );
    await loginViaToken(page, sellerToken);

    const hrefs = await centreHrefs(page);
    expect(hrefs).toEqual([...cases].reverse().map((c) => c.expected));
    for (const href of hrefs) await expectRealPage(page, href);
  });

  test("zil ve bildirim merkezi aynı hedefleri açar", async ({
    page,
    request,
  }) => {
    const token = await apiLogin(request, USERS.buyer);
    const buyer = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, buyer.id);

    // Zil yalnız son 5 bildirimi gösterir; tohumlama da 5 ile sınırlı.
    const cases: LinkCase[] = [
      { type: "welcome", data: {}, expected: "/listings" },
      { type: "membership_expiring", data: {}, expected: "/membership" },
      {
        type: "back_in_stock",
        data: { productId: product.id },
        expected: `/listings/${product.id}`,
      },
      { type: "review_received", data: {}, expected: "/profile" },
      {
        type: "offer_counter",
        data: {},
        expected: "/profile/offers?tab=sent",
      },
    ];
    await seedNotifications(request, USERS.buyer.email, cases.map(seedOf));
    await loginViaToken(page, token);

    const centre = await centreHrefs(page);

    await page.goto("/");
    await page
      .getByRole("button", { name: /bildirim|notification/i })
      .first()
      .click();
    const bellList = page.getByTestId("notification-bell-list");
    await expect(bellList).toBeVisible();
    const bellLinks = bellList.getByTestId("notification-bell-link");
    await expect(bellLinks.first()).toBeVisible();
    const bell = (await bellLinks.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("href") ?? ""),
    )) as string[];

    // İki ekran AYNI hedefi açmalı — eski hata buradaydı.
    expect(bell).toEqual(centre);
  });

  for (const locale of ["tr", "en"] as const) {
    test(`${locale}: hedefi olmayan bildirim merkezine düşer, sabit hedefler 404 vermez`, async ({
      page,
      request,
    }) => {
      const token = await apiLogin(request, USERS.buyer);
      await loginViaToken(page, token);

      // Haritadaki sabit (parametresiz) hedeflerin tamamı.
      const STATIC_TARGETS = [
        "/profile/notifications",
        "/profile/orders",
        "/profile/offers?tab=received",
        "/profile/offers?tab=sent",
        "/profile/offers",
        "/profile/trades",
        "/profile/messages",
        "/profile/listings",
        "/profile/favorites",
        "/profile/payments",
        "/listings",
        "/membership",
        "/profile",
      ];
      for (const target of STATIC_TARGETS) {
        await expectRealPage(page, `/${locale}${target}`);
      }
    });
  }
});

test.describe("EventService bildirimleri gerçek kuyruk hattından gelir", () => {
  /**
   * Sepet ödemesinde tek bir sipariş yoktur: grup bildirimi yalnız
   * `checkoutGroupId` taşıyor. Hedef üretilemediği için kart tıklanamıyordu;
   * artık kontrollü olarak sipariş listesine düşer.
   */
  test("grup ödemesi temsilci sipariş olmadan listeye düşer", async ({
    page,
    request,
  }) => {
    const token = await apiLogin(request, USERS.buyer);
    await seedNotifications(request, USERS.buyer.email, [
      {
        type: "payment_confirmed",
        path: "worker",
        title: "Ödeme Onaylandı",
        body: "2 ürünlük siparişiniz için ödeme alındı",
        // Grup bildiriminin ürettiği payload: temsilci sipariş YOK.
        data: { checkoutGroupId: "grp-e2e", groupNumber: "GRP-E2E" },
      },
    ]);
    await loginViaToken(page, token);

    const hrefs = await centreHrefs(page);
    expect(hrefs).toEqual(["/profile/orders"]);
    await expectRealPage(page, hrefs[0]);
  });
});

test.describe("hedefi çözülemeyen bildirim", () => {
  test("eksik veri gelirse kart tıklanabilir gösterilmez", async ({
    page,
    request,
  }) => {
    const token = await apiLogin(request, USERS.buyer);
    // `orderId` YOK: link üretilemez. Kart görünür ama hedef vermez —
    // eskiden `/orders/{{orderId}}` basılıp 404'e götürüyordu.
    await seedNotifications(request, USERS.buyer.email, [
      { type: "order_shipped", data: {} },
    ]);
    await loginViaToken(page, token);

    await page.goto("/profile/notifications");
    const list = page.getByTestId("notification-list");
    await expect(list).toBeVisible();
    await expect(list.getByTestId("notification-card-link")).toHaveCount(0);
  });
});
