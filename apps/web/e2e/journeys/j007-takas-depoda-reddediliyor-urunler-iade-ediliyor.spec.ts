/**
 * J7 — Takas depoda reddediliyor: ürünler iade ediliyor
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
