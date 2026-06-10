/**
 * J6 — Takas nakit farklı: önce ödeme, sonra kargo
 * Kaynak: suite-f-trades.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
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
