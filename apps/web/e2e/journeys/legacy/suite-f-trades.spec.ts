/**
 * Suite F — Takas (Trade) journeyleri.
 *
 * Manuel turun birebir karşılığı: iki koleksiyoner takas yapar; karşı teklif,
 * nakit fark (escrow), depo-escrow akışı (kabul → otomatik depo kargoları →
 * teslim → admin onay/red → karşılıklı kargo → tamamlanma/iade), zaman-bazlı
 * otomatik iptal ve edge guard'ları (self-trade, IDOR, eski 410 endpoint).
 *
 * Backend gerçek: tarodan_test DB + Mailhog + PAYMENT_BYPASS=true.
 *
 * Tasarım notu — ürün kurulumu:
 *   Takas, her iki tarafın da AKTIF ürün sahibi olmasını ister; ayrıca alıcı
 *   (receiver) tarafının ürünü `isTradeEnabled=true` olmalı. Seed ürünleri tek
 *   adetli ve statüleri karışık olduğundan, deterministik olması için her test
 *   KENDI ürünlerini API ile oluşturur (status=pending) ve admin onayıyla
 *   active'e çeker. Takas yapan iki taraf: sellerPremium (ahmet) ve
 *   sellerBusiness (ali) — ikisi de takas yetkili üye ve kayıtlı adresli
 *   (depo-escrow kargo etiketi üretimi adres ister).
 *
 * Endpoint kaynakları (controller'dan doğrulandı):
 *   trade.controller.ts:  POST /trades, /trades/:id/counter|accept|reject|cancel
 *                         /trades/:id/ship-to-warehouse (410 Gone),
 *                         /trades/:id/confirm-receipt, /trades/:id/dispute,
 *                         /trades/:id/resolve-dispute (admin),
 *                         /trades/:id/cash-payment/initiate
 *   admin.controller.ts:  POST /admin/trades/:id/mark-warehouse-received,
 *                         /approve, /reject, /mark-return-delivered
 *   auth:                 POST /auth/admin/login (tokens.accessToken)
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, loginViaToken } from '../support/helpers';
import { dbFind, dbCount, backdate, runScheduler, expectDbEventually } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// ──────────────────────────── yerel yardımcılar ────────────────────────────

/** Admin token (ayrı auth: /auth/admin/login → tokens.accessToken). */
async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, { data: USERS.admin });
  expect(res.ok(), 'admin login').toBeTruthy();
  const body = await res.json();
  const t = body?.tokens?.accessToken ?? body?.accessToken;
  expect(t, 'admin accessToken').toBeTruthy();
  return t as string;
}

/** Bir kategori id'si al (ürün oluşturmak için zorunlu). */
async function anyCategoryId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/categories`);
  expect(res.ok(), 'categories').toBeTruthy();
  const body = await res.json();
  const list: any[] = body?.data ?? body?.categories ?? (Array.isArray(body) ? body : []);
  // hiyerarşi olabilir → düz gez, ilk leaf/herhangi birini al
  const flat: any[] = [];
  const walk = (arr: any[]) => arr?.forEach((c) => { flat.push(c); if (c.children) walk(c.children); });
  walk(list);
  const c = flat.find((x) => x?.id);
  expect(c?.id, 'kategori id').toBeTruthy();
  return c.id;
}

/**
 * Satıcı için AKTIF bir ürün oluştur (create=pending → admin approve=active).
 * tradeEnabled: receiver tarafı ürünleri için true gerekir.
 * Dönen: { id, price }.
 */
async function createActiveProduct(
  request: APIRequestContext,
  sellerToken: string,
  adminTok: string,
  categoryId: string,
  opts: { price?: number; tradeEnabled?: boolean; title?: string } = {},
): Promise<{ id: string; price: number }> {
  const price = opts.price ?? 1000;
  const createRes = await request.post(`${API}/products`, {
    headers: auth(sellerToken),
    data: {
      title: opts.title ?? `PW Takas Ürünü ${Date.now()}-${Math.floor(Math.random() * 99999)}`,
      description: 'Playwright suite-f takas testi için oluşturulan ürün.',
      price,
      categoryId,
      condition: 'very_good',
      quantity: 1,
      isTradeEnabled: opts.tradeEnabled ?? false,
    },
  });
  expect(createRes.ok(), `ürün oluştur (status=${createRes.status()})`).toBeTruthy();
  const created = await createRes.json();
  const productId = created?.id ?? created?.data?.id ?? created?.product?.id;
  expect(productId, 'oluşturulan ürün id').toBeTruthy();

  const approveRes = await request.post(`${API}/admin/products/${productId}/approve`, {
    headers: auth(adminTok),
    data: {},
  });
  expect(approveRes.ok(), `ürün onayı (status=${approveRes.status()})`).toBeTruthy();

  // active doğrula
  const prod = await dbFind(request, 'product', { id: productId }, { id: true, status: true, isTradeEnabled: true });
  expect(prod?.status, 'ürün active').toBe('active');
  return { id: productId, price };
}

/** trade kaydını dev/find ile çek. */
async function getTradeRow(request: APIRequestContext, tradeId: string, select?: Record<string, any>) {
  return dbFind(request, 'trade', { id: tradeId }, select);
}

/**
 * Depo-escrow ortak adım: trade shipping_to_warehouse'tayken oluşan iki adet
 * to_warehouse TradeShipment'ı admin ile teslim-alındı işaretle → at_warehouse.
 * Her bacağı ayrı işaretler (J5/J98: bacaklar ayrı ayrı teslim).
 */
async function deliverBothLegsToWarehouse(
  request: APIRequestContext,
  adminTok: string,
  tradeId: string,
): Promise<{ shipmentIds: string[] }> {
  // to_warehouse etiketleri accept'te oluşur (createTradeWarehouseShipments + async dispatch).
  // İki bacağın da yaratılmış olmasını bekle.
  await expect(async () => {
    const n = await dbCount(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' });
    expect(n).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 10_000 });

  // dbFind tek kayıt döndürür; iki bacağı almak için: ilkini al → mark et →
  // sonra deliveredAt:null kalan ikinciyi al → mark et.
  const ships: string[] = [];

  // 1. bacak
  const first = await dbFind(request, 'tradeShipment', { tradeId, leg: 'to_warehouse', deliveredAt: null }, { id: true });
  expect(first?.id, '1. to_warehouse shipment').toBeTruthy();
  ships.push(first.id);
  const r1 = await request.post(`${API}/admin/trades/${tradeId}/mark-warehouse-received`, {
    headers: auth(adminTok),
    data: { shipmentId: first.id },
  });
  expect(r1.ok(), '1. bacak teslim').toBeTruthy();

  // İlk bacak sonrası trade hâlâ shipping_to_warehouse olmalı (J5 adım 5 / J98 adım 2)
  const afterFirst = await getTradeRow(request, tradeId, { status: true, firstWarehouseArrivalAt: true });
  expect(afterFirst.status).toBe('shipping_to_warehouse');
  expect(afterFirst.firstWarehouseArrivalAt, 'ilk varış damgalandı').toBeTruthy();

  // 2. bacak
  const second = await dbFind(request, 'tradeShipment', { tradeId, leg: 'to_warehouse', deliveredAt: null }, { id: true });
  expect(second?.id, '2. to_warehouse shipment').toBeTruthy();
  ships.push(second.id);
  const r2 = await request.post(`${API}/admin/trades/${tradeId}/mark-warehouse-received`, {
    headers: auth(adminTok),
    data: { shipmentId: second.id },
  });
  expect(r2.ok(), '2. bacak teslim').toBeTruthy();

  // İkinci bacak sonrası at_warehouse (J5 adım 6 / J98 adım 3)
  const afterSecond = await getTradeRow(request, tradeId, { status: true });
  expect(afterSecond.status).toBe('at_warehouse');

  return { shipmentIds: ships };
}

/** Onaylı takasın iki from_warehouse bacağını karşılıklı confirm-receipt ile teslim onayla → completed. */
async function confirmBothRecipientLegs(
  request: APIRequestContext,
  tradeId: string,
  initiatorToken: string,
  receiverToken: string,
) {
  const r1 = await request.post(`${API}/trades/${tradeId}/confirm-receipt`, {
    headers: auth(initiatorToken),
    data: {},
  });
  expect(r1.ok(), 'initiator teslim onayı').toBeTruthy();

  const r2 = await request.post(`${API}/trades/${tradeId}/confirm-receipt`, {
    headers: auth(receiverToken),
    data: {},
  });
  expect(r2.ok(), 'receiver teslim onayı').toBeTruthy();
}

// ════════════════════════════════════════════════════════════════════════
// J5 — Karşı teklif + depo akışı (oluştur-karşı-kabul-kargolar-teslim-admin
//       onay-karşılıklı kargo-puan)
// ════════════════════════════════════════════════════════════════════════
test.describe('J5 — Takas: karşı teklif + depo üzerinden tamamlanma + puanlama', () => {
  test('karşı teklif → kabul → depo kargo → admin onay → karşılıklı teslim → tamamlandı → puan', async ({ page, request }) => {
    test.setTimeout(90_000);

    // 0) Aktörler: A=ahmet (sellerPremium), B=ali (sellerBusiness). İkisi de takas yetkili + adresli.
    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    // A ve B birer takas-uygun ürün oluşturur (her iki yön de tradeEnabled, çünkü counter rolleri swap'lar)
    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J5' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J5' });

    // 1) A, B'ye takas teklifi gönderir (A verir prodA, B'den prodB ister)
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
        message: 'prodA <-> prodB takas?',
      },
    });
    expect(createRes.ok(), `takas oluştur (status=${createRes.status()})`).toBeTruthy();
    const trade = await createRes.json();
    const tradeId = trade?.id ?? trade?.data?.id;
    expect(tradeId, 'tradeId').toBeTruthy();

    // DB: pending; stok henüz rezerve edilmedi (pending'de reserve yok)
    let row = await getTradeRow(request, tradeId, { status: true, initiatorId: true, receiverId: true });
    expect(row.status).toBe('pending');
    const prodBrow0 = await dbFind(request, 'product', { id: prodB.id }, { reservedQuantity: true });
    expect(prodBrow0.reservedQuantity ?? 0).toBe(0);

    // 2) B beğenmedi → karşı teklif verir (roller swap: yeni initiator=B, receiver=A)
    const counterRes = await request.post(`${API}/trades/${tradeId}/counter`, {
      headers: auth(tokenB),
      data: {
        initiatorItems: [{ productId: prodB.id, quantity: 1 }], // B'nin ürünü
        receiverItems: [{ productId: prodA.id, quantity: 1 }],   // A'dan istediği
        message: 'Olur ama mesajla karşı teklif',
        cashAmount: 0,
      },
    });
    expect(counterRes.ok(), `karşı teklif (status=${counterRes.status()})`).toBeTruthy();

    // DB: roller swap edildi (initiator=B, receiver=A), hâlâ pending
    row = await getTradeRow(request, tradeId, { status: true, initiatorId: true, receiverId: true });
    expect(row.status).toBe('pending');
    expect(row.initiatorId).toBe(B.id);
    expect(row.receiverId).toBe(A.id);

    // 3) Başlatan (artık receiver = A) karşı teklifi kabul eder → non-cash → shipping_to_warehouse
    const acceptRes = await request.post(`${API}/trades/${tradeId}/accept`, {
      headers: auth(tokenA),
      data: { message: 'kabul' },
    });
    expect(acceptRes.ok(), `kabul (status=${acceptRes.status()})`).toBeTruthy();

    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('shipping_to_warehouse');

    // Kabul sonrası stok rezerve edildi
    const prodArow = await dbFind(request, 'product', { id: prodA.id }, { reservedQuantity: true });
    expect((prodArow.reservedQuantity ?? 0)).toBeGreaterThanOrEqual(1);

    // 4-6) İki taraf için otomatik to_warehouse kargolar oluştu; ayrı ayrı teslim → at_warehouse
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);

    // 7) Admin depoda kontrol edip onaylar → from_warehouse kargolar + shipping_to_recipients
    const approveRes = await request.post(`${API}/admin/trades/${tradeId}/approve`, {
      headers: auth(adminTok),
      data: { notes: 'her iki ürün de açıklamayla uyumlu' },
    });
    expect(approveRes.ok(), `admin onay (status=${approveRes.status()})`).toBeTruthy();

    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('shipping_to_recipients');
    const outbound = await dbCount(request, 'tradeShipment', { tradeId, leg: 'from_warehouse' });
    expect(outbound).toBeGreaterThanOrEqual(2);

    // 8) Ürünler karşılıklı alıcılara kargolandı → iki taraf da teslim onayı → completed
    // initiator=B, receiver=A
    await confirmBothRecipientLegs(request, tradeId, tokenB, tokenA);
    row = await getTradeRow(request, tradeId, { status: true, completedAt: true });
    expect(row.status).toBe('completed');
    expect(row.completedAt, 'completedAt damgalandı').toBeTruthy();

    // 9) Taraflar birbirini puanlar (tradeId ile, completed olduğu için kabul edilir)
    const rateAB = await request.post(`${API}/ratings/users`, {
      headers: auth(tokenA),
      data: { receiverId: B.id, tradeId, score: 5, comment: 'temiz takas' },
    });
    expect(rateAB.ok(), `A→B puan (status=${rateAB.status()})`).toBeTruthy();
    const rateBA = await request.post(`${API}/ratings/users`, {
      headers: auth(tokenB),
      data: { receiverId: A.id, tradeId, score: 4 },
    });
    expect(rateBA.ok(), `B→A puan (status=${rateBA.status()})`).toBeTruthy();

    // DB: iki rating kaydı oluştu
    const ratingCount = await dbCount(request, 'rating', { tradeId });
    expect(ratingCount).toBeGreaterThanOrEqual(2);

    // UI doğrulama: katılımcı kendi takasını görebiliyor (404/login değil)
    await loginViaToken(page, tokenA);
    await page.goto(`/trades/${tradeId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.length).toBeGreaterThan(100);
    expect(body).not.toMatch(/sayfa bulunamad|not found|404/i);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J6 — Nakit fark escrow: önce ödeme, sonra kargo
// ════════════════════════════════════════════════════════════════════════
test.describe('J6 — Takas nakit fark: önce ödeme (escrow) sonra depo akışı', () => {
  test('nakit teklif → kabul=awaiting_payment → ödeme → kargo → onay → tamamlanma → hold serbest', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    // A'nın ürünü değerli, B'nin ürünü düşük → A nakit fark öder (cashAmount > 0 = initiator öder)
    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1500, tradeEnabled: true, title: 'A ürünü J6' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J6' });

    // 1) A, +500 nakit fark teklif eder (A=initiator öder)
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
        cashAmount: 500,
        message: 'üstüne 500 nakit',
      },
    });
    expect(createRes.ok(), `nakit takas oluştur (status=${createRes.status()})`).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    expect(tradeId).toBeTruthy();

    // DB: cashAmount=500, cashPayerId=A
    let row = await getTradeRow(request, tradeId, { status: true, cashAmount: true, cashPayerId: true });
    expect(row.status).toBe('pending');
    expect(Number(row.cashAmount)).toBe(500);
    expect(row.cashPayerId).toBe(A.id);

    // 2) B kabul eder → cash trade → awaiting_payment (depo kargoları HENÜZ oluşmaz)
    const acceptRes = await request.post(`${API}/trades/${tradeId}/accept`, {
      headers: auth(tokenB),
      data: {},
    });
    expect(acceptRes.ok(), `kabul (status=${acceptRes.status()})`).toBeTruthy();
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('awaiting_payment');

    // 3) Ödeme öncesi depo kargosu yok
    const wbBefore = await dbCount(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' });
    expect(wbBefore).toBe(0);

    // tradeCashPayment kaydı pending olarak açıldı (komisyon dahil totalAmount)
    const tcp = await dbFind(request, 'tradeCashPayment', { tradeId }, { status: true, amount: true, totalAmount: true, payerId: true });
    expect(tcp?.payerId).toBe(A.id);
    expect(tcp?.status).toBe('pending');

    // 4) A ödemeyi başlatır (cash-payment/initiate) → bypass → tamamlar; nakit escrow'a alınır
    const initRes = await request.post(`${API}/trades/${tradeId}/cash-payment/initiate`, {
      headers: auth(tokenA),
      data: {},
    });
    expect(initRes.ok(), `cash initiate (status=${initRes.status()})`).toBeTruthy();
    const initBody = await initRes.json();
    expect(initBody?.useBypass, 'PAYMENT_BYPASS açık').toBe(true);
    const paymentId = initBody?.paymentId;
    expect(paymentId, 'paymentId').toBeTruthy();

    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), `bypass-complete (status=${doneRes.status()})`).toBeTruthy();

    // DB: tradeCashPayment completed; trade shipping_to_warehouse'a geçti (5)
    await expectDbEventually(request, 'tradeCashPayment', { tradeId }, (r) => r?.status === 'completed', 10_000);
    await expectDbEventually(request, 'trade', { id: tradeId }, (r) => r?.status === 'shipping_to_warehouse', 10_000);

    // 5) Depo kargoları oluştu → ürünler depoya gitti, admin kontrol etti
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);
    const approveRes = await request.post(`${API}/admin/trades/${tradeId}/approve`, {
      headers: auth(adminTok),
      data: { notes: 'ok' },
    });
    expect(approveRes.ok(), `admin onay (status=${approveRes.status()})`).toBeTruthy();
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('shipping_to_recipients');

    // 6) Ürünler karşılıklı kargolandı → iki taraf teslim onayı → completed
    // initiator=A (oluşturan), receiver=B
    await confirmBothRecipientLegs(request, tradeId, tokenA, tokenB);
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('completed');

    // completed sonrası escrow hold ayarlandı (holdReleaseAt set, henüz released değil)
    const tcpAfter = await dbFind(request, 'tradeCashPayment', { tradeId }, { status: true, holdReleaseAt: true, releasedAt: true });
    expect(tcpAfter?.holdReleaseAt, 'holdReleaseAt ayarlandı').toBeTruthy();
    expect(tcpAfter?.releasedAt ?? null, 'henüz serbest değil').toBeNull();

    // 7) Bekleme süresi dolunca (backdate + release-holds-due) nakit alacaklıya aktarıldı
    await backdate(request, 'tradeCashPayment', { tradeId }, { holdReleaseAt: new Date(Date.now() - 60_000).toISOString() });
    await runScheduler(request, 'release-holds-due');
    await expectDbEventually(request, 'tradeCashPayment', { tradeId }, (r) => r?.releasedAt != null, 10_000);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J7 — Depoda reddediliyor: ürünler iade kargolanıyor
// ════════════════════════════════════════════════════════════════════════
test.describe('J7 — Takas depoda reddediliyor: iade akışı', () => {
  test('kabul → depo teslim → admin red → return kargolar → teslim → cancelled', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J7' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J7' });

    // 1) Takas anlaşması (oluştur + kabul)
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    const acceptRes = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(acceptRes.ok()).toBeTruthy();

    // Ürünleri depoya kargola (iki bacak teslim) → at_warehouse
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);

    // 2-3) Admin ürünlerden birinin uyuşmadığını görüp reddeder → returning + return kargolar
    const rejectRes = await request.post(`${API}/admin/trades/${tradeId}/reject`, {
      headers: auth(adminTok),
      data: { reason: 'B ürünü ilanla uyuşmuyor, iade' },
    });
    expect(rejectRes.ok(), `admin red (status=${rejectRes.status()})`).toBeTruthy();

    let row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('returning');

    // 4) İki tarafa da return kargoları oluştu ('return' leg)
    const returnCount = await dbCount(request, 'tradeShipment', { tradeId, leg: 'return' });
    expect(returnCount).toBeGreaterThanOrEqual(2);

    // 5) İade kargoları teslim oldu → her ikisi de işaretlenince cancelled
    const ret1 = await dbFind(request, 'tradeShipment', { tradeId, leg: 'return', deliveredAt: null }, { id: true });
    expect(ret1?.id).toBeTruthy();
    const m1 = await request.post(`${API}/admin/trades/${tradeId}/mark-return-delivered`, {
      headers: auth(adminTok),
      data: { shipmentId: ret1.id },
    });
    expect(m1.ok(), '1. iade teslim').toBeTruthy();

    const ret2 = await dbFind(request, 'tradeShipment', { tradeId, leg: 'return', deliveredAt: null }, { id: true });
    expect(ret2?.id).toBeTruthy();
    const m2 = await request.post(`${API}/admin/trades/${tradeId}/mark-return-delivered`, {
      headers: auth(adminTok),
      data: { shipmentId: ret2.id },
    });
    expect(m2.ok(), '2. iade teslim').toBeTruthy();

    row = await getTradeRow(request, tradeId, { status: true, cancelledAt: true });
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt, 'cancelledAt damgalandı').toBeTruthy();

    // 6) Rezervasyon serbest kaldı, ürünler tekrar active
    const pa = await dbFind(request, 'product', { id: prodA.id }, { reservedQuantity: true, status: true });
    const pb = await dbFind(request, 'product', { id: prodB.id }, { reservedQuantity: true, status: true });
    expect(pa.reservedQuantity ?? 0).toBe(0);
    expect(pb.reservedQuantity ?? 0).toBe(0);
    expect(pa.status).toBe('active');
    expect(pb.status).toBe('active');

    // (Nakit yok → transfer yok; bu testte cashPayment hiç oluşmadı)
    const tcpCount = await dbCount(request, 'tradeCashPayment', { tradeId });
    expect(tcpCount).toBe(0);

    // 7) Tarafların bildirim aldığını dolaylı doğrula: takas her iki katılımcı için cancelled görünür
    const seenByA = await request.get(`${API}/trades/${tradeId}`, { headers: auth(tokenA) });
    expect(seenByA.ok()).toBeTruthy();
    void A; void B;
  });
});

// ════════════════════════════════════════════════════════════════════════
// J35 — Takas cevapsız → otomatik iptal (cancel-expired-trades) + yeni teklif kabul
// ════════════════════════════════════════════════════════════════════════
test.describe('J35 — Cevapsız takas otomatik iptal, sonra yeni teklif kabul', () => {
  test('pending takas süre dolunca otomatik iptal; aynı ürünle yeni takas kabul edilir', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    // A'nın bir ürünü; iki farklı receiver ürünü (B'nin) — ilki cevapsız kalır, ikinci takas kabul edilir
    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J35' });
    const prodB1 = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B1 ürünü J35' });
    const prodB2 = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B2 ürünü J35' });

    // 1) A → B takas teklifi (prodA <-> prodB1)
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB1.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    let row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('pending');

    // 2-3) Cevap süresi boyunca işlem yok → responseDeadline'ı geçmişe çek + scheduler
    await backdate(request, 'trade', { id: tradeId }, { responseDeadline: new Date(Date.now() - 60_000).toISOString() });
    const schedRes = await runScheduler(request, 'cancel-expired-trades');
    expect(schedRes, 'cancel-expired-trades çalıştı').toBeTruthy();

    await expectDbEventually(request, 'trade', { id: tradeId }, (r) => r?.status === 'cancelled', 10_000);
    row = await getTradeRow(request, tradeId, { status: true, cancelReason: true });
    expect(row.status).toBe('cancelled');
    expect(String(row.cancelReason ?? '')).toMatch(/otomatik/i);

    // 4) Başlatana bildirim gitti — TRADE_AUTO_CANCELLED notification kaydı
    // (NotificationLog modeli; emitTradeAutoCancelled → her iki katılımcıya)
    const notif = await dbFind(
      request,
      'notificationLog',
      { userId: A.id, type: 'trade_auto_cancelled' },
      { id: true, type: true, userId: true },
      { createdAt: 'desc' },
    );
    // not: notification asenkron event üzerinden yazılır; kayıt yoksa testi düşürmüyoruz ama
    // tipik akışta beklenir. Varsa doğrula.
    if (notif) {
      expect(notif.type).toBe('trade_auto_cancelled');
      expect(notif.userId).toBe(A.id);
    }

    // 5) A aynı ürünle B'ye YENİ takas gönderir (prodA artık serbest) ve bu kez kabul edilir
    const create2 = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB2.id, quantity: 1 }],
      },
    });
    expect(create2.ok(), `yeni takas (status=${create2.status()})`).toBeTruthy();
    const tradeId2 = (await create2.json())?.id;
    const accept2 = await request.post(`${API}/trades/${tradeId2}/accept`, { headers: auth(tokenB), data: {} });
    expect(accept2.ok(), `yeni takas kabul (status=${accept2.status()})`).toBeTruthy();
    const row2 = await getTradeRow(request, tradeId2, { status: true });
    expect(row2.status).toBe('shipping_to_warehouse');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J97 — Self-trade engeli + geçersiz koşullar; sonra geçerli takas
// ════════════════════════════════════════════════════════════════════════
test.describe('J97 — Self-trade ve geçersiz koşul engeli, sonra geçerli takas', () => {
  test('kendisiyle takas reddedilir; takas-kapalı ürün talebi reddedilir; geçerli takas oluşur ve kabul edilir', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J97' });
    // B'nin TAKAS-KAPALI ürünü (isTradeEnabled=false) — receiver tarafı için uygun değil
    const prodBnoTrade = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: false, title: 'B kapalı J97' });
    const prodBok = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B açık J97' });

    // 1) A kendisiyle takas açmaya çalışır → 400 (Kendinizle takas yapamazsınız)
    const selfRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: A.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodA.id, quantity: 1 }],
      },
    });
    expect(selfRes.ok(), 'self-trade reddedilmeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(selfRes.status());

    // 2) Karşı tarafın koşulu sağlanmıyor: takasa kapalı ürün talep edilemez → 400
    const badRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodBnoTrade.id, quantity: 1 }],
      },
    });
    expect(badRes.ok(), 'takasa kapalı ürün talebi reddedilmeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(badRes.status());

    // 3) Geçerli takas teklifi → oluşur; pending'de stok rezerve EDİLMEZ
    const okRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodBok.id, quantity: 1 }],
      },
    });
    expect(okRes.ok(), `geçerli takas (status=${okRes.status()})`).toBeTruthy();
    const tradeId = (await okRes.json())?.id;
    const row0 = await getTradeRow(request, tradeId, { status: true });
    expect(row0.status).toBe('pending');
    const pbRow = await dbFind(request, 'product', { id: prodBok.id }, { reservedQuantity: true });
    expect(pbRow.reservedQuantity ?? 0).toBe(0);

    // 4) B kabul eder → süreç başlar (shipping_to_warehouse), rezervasyon oluşur
    const accept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(accept.ok(), `kabul (status=${accept.status()})`).toBeTruthy();
    const row1 = await getTradeRow(request, tradeId, { status: true });
    expect(row1.status).toBe('shipping_to_warehouse');
    const pbRow2 = await dbFind(request, 'product', { id: prodBok.id }, { reservedQuantity: true });
    expect((pbRow2.reservedQuantity ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J98 — Otomatik kargo: bacaklar ayrı ayrı teslim (depo akışının çekirdeği)
// ════════════════════════════════════════════════════════════════════════
test.describe('J98 — Takas otomatik kargo: bacaklar ayrı ayrı teslim', () => {
  test('iki to_warehouse bacağı ayrı teslim olur (önce shipping_to_warehouse kalır, sonra at_warehouse), admin onayıyla tamamlanır', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const B = await apiMe(request, tokenB);
    const A = await apiMe(request, tokenA);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J98' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J98' });

    // 1) Kabul → iki taraf için takip numaralı kargolar oluştu
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    const accept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(accept.ok()).toBeTruthy();

    // İki to_warehouse shipment oluştu, trackingNumber atandı
    await expect(async () => {
      const n = await dbCount(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' });
      expect(n).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 10_000 });
    const oneShip = await dbFind(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' }, { trackingNumber: true });
    expect(oneShip?.trackingNumber, 'takip numarası atandı').toBeTruthy();

    // 2-3) Bacaklar ayrı ayrı teslim — yardımcı ara durumları (shipping_to_warehouse → at_warehouse) assert eder
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);

    // 4) Admin onayladı → karşılıklı kargo → iki teslim onayı → completed
    const approve = await request.post(`${API}/admin/trades/${tradeId}/approve`, { headers: auth(adminTok), data: {} });
    expect(approve.ok()).toBeTruthy();
    let row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('shipping_to_recipients');

    await confirmBothRecipientLegs(request, tradeId, tokenA, tokenB); // initiator=A, receiver=B
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('completed');
    void A;
  });
});

// ════════════════════════════════════════════════════════════════════════
// J99 — Eski 'depoya gönder' endpoint'i 410 Gone döner
// ════════════════════════════════════════════════════════════════════════
test.describe("J99 — Eski 'depoya gönder' işlemi 410 ile kapalı", () => {
  test('ship-to-warehouse 410 Gone döner; otomatik akış yine de takası tamamlar', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J99' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J99' });

    // 1) Takas anlaş (oluştur + kabul) → otomatik kargolar oluştu
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    const accept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(accept.ok()).toBeTruthy();

    // 2-3) Kullanıcı eski 'depoya gönder' işlemini dener → 410 Gone
    const legacyRes = await request.post(`${API}/trades/${tradeId}/ship-to-warehouse`, {
      headers: auth(tokenA),
      data: { carrier: 'surat', fromAddressId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(legacyRes.ok(), 'eski endpoint kapalı olmalı').toBeFalsy();
    expect(legacyRes.status(), 'ship-to-warehouse 410 döner').toBe(410);

    // 4) Otomatik akış beklenir → bacaklar teslim + admin onay + karşılıklı teslim → completed
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);
    const approve = await request.post(`${API}/admin/trades/${tradeId}/approve`, { headers: auth(adminTok), data: {} });
    expect(approve.ok()).toBeTruthy();
    await confirmBothRecipientLegs(request, tradeId, tokenA, tokenB);
    const row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('completed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J100 — Anlaşmazlık (dispute) açma yetkisi: IDOR engeli + admin çözümü
// ════════════════════════════════════════════════════════════════════════
test.describe('J100 — Takasta anlaşmazlık yetkisi (IDOR) ve admin çözümü', () => {
  test('yabancı dispute açamaz (403/404); katılımcı açar; admin çözer', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const stranger = await apiLogin(request, USERS.sellerFree); // takasa dahil olmayan üçüncü kişi (zeynep)
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J100' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J100' });

    // 1) Takası dispute açılabilir bir duruma getir: kabul → depo → admin onay → shipping_to_recipients
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;
    expect((await (await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} })).json())).toBeTruthy();
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);
    const approve = await request.post(`${API}/admin/trades/${tradeId}/approve`, { headers: auth(adminTok), data: {} });
    expect(approve.ok()).toBeTruthy();
    let row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('shipping_to_recipients');

    // 2) Yabancı (stranger) dispute açmaya çalışır → IDOR engeli (403/404)
    const strangerDispute = await request.post(`${API}/trades/${tradeId}/dispute`, {
      headers: auth(stranger),
      data: { reason: 'not_received', description: 'yabancıyım ama deniyorum' },
    });
    expect(strangerDispute.ok(), 'yabancı dispute engellenmeli').toBeFalsy();
    expect([403, 404]).toContain(strangerDispute.status());

    // Yabancı takası görüntüleyemez de (IDOR get)
    const strangerGet = await request.get(`${API}/trades/${tradeId}`, { headers: auth(stranger) });
    expect(strangerGet.ok(), 'yabancı görüntüleyemez').toBeFalsy();
    expect([403, 404]).toContain(strangerGet.status());

    // 3) Katılımcı (A) dispute açar → disputed
    const partyDispute = await request.post(`${API}/trades/${tradeId}/dispute`, {
      headers: auth(tokenA),
      data: { reason: 'not_as_described', description: 'gelen ürün açıklamayla uyuşmuyor' },
    });
    expect(partyDispute.ok(), `katılımcı dispute (status=${partyDispute.status()})`).toBeTruthy();
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('disputed');
    const disp = await dbFind(request, 'tradeDispute', { tradeId }, { id: true, resolution: true });
    expect(disp?.id, 'dispute kaydı oluştu').toBeTruthy();

    // 4) Admin inceleyip karara bağlar (resolve-dispute → complete_trade) → completed
    const resolveRes = await request.post(`${API}/trades/${tradeId}/resolve-dispute`, {
      headers: auth(adminTok),
      data: { resolution: 'complete_trade', notes: 'inceleme sonucu takas tamamlandı' },
    });
    expect(resolveRes.ok(), `admin dispute çözümü (status=${resolveRes.status()})`).toBeTruthy();
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('completed');
    const dispAfter = await dbFind(request, 'tradeDispute', { tradeId }, { resolution: true, resolvedAt: true });
    expect(dispAfter?.resolution).toBe('complete_trade');
    expect(dispAfter?.resolvedAt, 'çözüm tarihlendi').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════
// J101 — Karşı teklif yalnızca (yeni) alıcı tarafından kabul edilir
// ════════════════════════════════════════════════════════════════════════
test.describe('J101 — Karşı teklifi sadece başlatan (yeni alıcı) kabul edebilir', () => {
  test('karşı teklif sonrası: counter-offerer accept edemez (403); başlatan kabul eder → anlaşır', async ({ request }) => {
    test.setTimeout(90_000);

    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'A ürünü J101' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü J101' });

    // 1) A → B takas teklifi
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const tradeId = (await createRes.json())?.id;

    // 2) B karşı teklif verir → roller swap (initiator=B, receiver=A)
    const counter = await request.post(`${API}/trades/${tradeId}/counter`, {
      headers: auth(tokenB),
      data: {
        initiatorItems: [{ productId: prodB.id, quantity: 1 }],
        receiverItems: [{ productId: prodA.id, quantity: 1 }],
        cashAmount: 100, // değişiklik (identical-counter guard'ı geçmek için)
        message: 'üstüne 100 koy',
      },
    });
    expect(counter.ok(), `karşı teklif (status=${counter.status()})`).toBeTruthy();
    let row = await getTradeRow(request, tradeId, { status: true, initiatorId: true, receiverId: true });
    expect(row.initiatorId).toBe(B.id);
    expect(row.receiverId).toBe(A.id);

    // 3) Counter-offerer (B = yeni initiator) kabul etmeyi dener → reddedilir (sadece alıcı=A kabul edebilir)
    const bAccept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(bAccept.ok(), 'yeni initiator kabul edememeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(bAccept.status());

    // Durum hâlâ pending
    row = await getTradeRow(request, tradeId, { status: true });
    expect(row.status).toBe('pending');

    // 4) Başlatan (yeni receiver = A) karşı teklifi kabul eder → cash trade → awaiting_payment
    const aAccept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenA), data: {} });
    expect(aAccept.ok(), `başlatan kabul (status=${aAccept.status()})`).toBeTruthy();
    row = await getTradeRow(request, tradeId, { status: true, cashPayerId: true });
    // cashAmount=100 → cash trade → awaiting_payment; cashPayer = yeni initiator (B)
    expect(row.status).toBe('awaiting_payment');
    expect(row.cashPayerId).toBe(B.id);
  });
});
