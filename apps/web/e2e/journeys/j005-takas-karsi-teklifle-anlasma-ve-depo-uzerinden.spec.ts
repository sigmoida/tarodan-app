/**
 * J5 — Takas: karşı teklifle anlaşma ve depo üzerinden tamamlanma
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
  const _pBody = createRes.ok() ? '' : await createRes.text();
  expect(createRes.ok(), `urun olustur (${createRes.status()}) ${_pBody.slice(0, 130)}`).toBeTruthy();
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
    // B'nin counter'da sunacağı FARKLI ürün — saf rol-swap "aynı teklif" reddine takılmasın.
    const prodB2 = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B ürünü 2 J5' });

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
        initiatorItems: [{ productId: prodB2.id, quantity: 1 }], // B'nin FARKLI ürünü (anlamlı counter)
        receiverItems: [{ productId: prodA.id, quantity: 1 }],   // A'dan istediği
        message: 'Olur ama mesajla karşı teklif',
        cashAmount: 0,
      },
    });
    const _cBody = counterRes.ok() ? '' : await counterRes.text();
    expect(counterRes.ok(), `karşı teklif (${counterRes.status()}) ${_cBody.slice(0, 130)}`).toBeTruthy();

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
