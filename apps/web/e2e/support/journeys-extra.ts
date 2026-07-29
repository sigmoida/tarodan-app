/**
 * Ek ortak yardımcılar — yeni tekil journey spec'leri (jNNN) için.
 * helpers.ts'i değiştirmeden (paylaşılan altyapı) ek davranışlar sağlar:
 *  - admin token, kategori, ürün oluşturma (suite-f pattern'i)
 *  - sipariş yaşam döngüsü kısayolları (buyAndInitiate, driveToCompleted)
 *  - custom TOTP üretimi (security.service.ts birebir replikası — 2FA journey'leri)
 *  - format-geçerli TR IBAN üretimi
 */
import { APIRequestContext, expect } from '@playwright/test';
import * as crypto from 'crypto';
import { API, USERS, apiLogin, apiMe, apiDefaultAddressId } from './helpers';
import { dbFind, dbCount, backdate, expectDbEventually } from './db';

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Admin token (ayrı auth: /auth/admin/login → tokens.accessToken). */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, { data: USERS.admin });
  expect(res.ok(), 'admin login').toBeTruthy();
  const body = await res.json();
  const t = body?.tokens?.accessToken ?? body?.accessToken;
  expect(t, 'admin accessToken').toBeTruthy();
  return t as string;
}

/** Herhangi bir kategori id (ürün oluşturmak için zorunlu). */
export async function anyCategoryId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/categories`);
  expect(res.ok(), 'categories').toBeTruthy();
  const body = await res.json();
  const list: any[] = body?.data ?? body?.categories ?? (Array.isArray(body) ? body : []);
  const flat: any[] = [];
  const walk = (arr: any[]) => arr?.forEach((c) => { flat.push(c); if (c.children) walk(c.children); });
  walk(list);
  const c = flat.find((x) => x?.id);
  expect(c?.id, 'kategori id').toBeTruthy();
  return c.id;
}

/**
 * Satıcı için AKTIF ürün oluştur (create=pending → admin approve=active).
 * Stok-bazlı testler için deterministik ürün üretir (quantity ayarlanabilir).
 */
export async function createActiveProduct(
  request: APIRequestContext,
  sellerToken: string,
  adminTok: string,
  categoryId: string,
  opts: { price?: number; tradeEnabled?: boolean; title?: string; quantity?: number } = {},
): Promise<{ id: string; price: number }> {
  const price = opts.price ?? 1000;
  // Başlık DTO min 5 karakter ister; kısa custom title'ları (J26/J66/J86 gibi) pad'le.
  const rawTitle = opts.title ?? `PW Journey Ürünü ${Date.now()}-${Math.floor(Math.random() * 99999)}`;
  const title = rawTitle.length >= 5 ? rawTitle : `${rawTitle} ürünü test`;
  const createRes = await request.post(`${API}/products`, {
    headers: auth(sellerToken),
    data: {
      title,
      description: 'Playwright tekil journey testi için oluşturulan ürün.',
      price,
      categoryId,
      condition: 'very_good',
      quantity: opts.quantity ?? 1,
      isTradeEnabled: opts.tradeEnabled ?? false,
    },
  });
  if (!createRes.ok()) {
    const t = await createRes.text();
    expect(createRes.ok(), `ürün oluştur (${createRes.status()}) ${t.slice(0, 130)}`).toBeTruthy();
  }
  const created = await createRes.json();
  const productId = created?.id ?? created?.data?.id ?? created?.product?.id;
  expect(productId, 'oluşturulan ürün id').toBeTruthy();

  const approveRes = await request.post(`${API}/admin/products/${productId}/approve`, {
    headers: auth(adminTok),
    data: {},
  });
  expect(approveRes.ok(), `ürün onayı (status=${approveRes.status()})`).toBeTruthy();
  const prod = await dbFind(request, 'product', { id: productId }, { id: true, status: true });
  expect(prod?.status, 'ürün active').toBe('active');
  return { id: productId, price };
}

/** Bir order'ın satıcısı için doğru seed token'ını bul. */
export async function tokenForSeller(request: APIRequestContext, sellerId: string): Promise<string> {
  for (const u of [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree, USERS.buyer]) {
    const t = await apiLogin(request, u);
    const me = await apiMe(request, t);
    if (me.id === sellerId) return t;
  }
  // Fallback: bilinen 4 dışında bir seed satıcı → email'i dev/find ile bul, Demo123! ile login
  // (tüm seed kullanıcılar Demo123!). "seed token bulunamadı"yı her seed satıcı için bitirir.
  const u = await dbFind(request, 'user', { id: sellerId }, { email: true });
  if (u?.email) {
    const t = await apiLogin(request, { email: u.email, password: 'Demo123!' } as any);
    if (t) return t;
  }
  throw new Error(`sellerId ${sellerId} için seed token bulunamadı`);
}

/** orders/buy + initiate → ödenmemiş (pending) sipariş + payment döndür. */
export async function buyAndInitiate(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<{ orderId: string; paymentId: string; amount: number }> {
  const shippingAddressId = await apiDefaultAddressId(request, token);
  const buyRes = await request.post(`${API}/orders/buy`, { headers: auth(token), data: { productId, shippingAddressId } });
  if (!buyRes.ok()) {
    const t = await buyRes.text();
    expect(buyRes.ok(), `orders/buy (${buyRes.status()}) ${t.slice(0, 120)}`).toBeTruthy();
  }
  const orderId = (await buyRes.json())?.orderId;
  expect(orderId, 'orderId').toBeTruthy();

  const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(token), data: { orderId, provider: 'paytr' } });
  expect(initRes.ok(), 'payments/initiate').toBeTruthy();
  const initBody = await initRes.json();
  const paymentId = initBody?.paymentId;
  expect(paymentId, 'paymentId').toBeTruthy();
  return { orderId, paymentId, amount: Number(initBody?.amount ?? 0) };
}

/** Sipariş paid → completed: prepare + delivered backdate + buyer confirm. */
export async function driveToCompleted(
  request: APIRequestContext,
  buyerToken: string,
  sellerToken: string,
  orderId: string,
): Promise<void> {
  // Ödeme tamamlanınca app order'ı OTOMATİK 'preparing' yapar (auto-shipment) → manuel prepare
  // 'Sadece ödenmiş siparişler' 400 verebilir; akış için kritik değil (aşağıda delivered'a çekilir).
  await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) }).catch(() => {});
  await backdate(request, 'order', { id: orderId }, { status: 'delivered', deliveredAt: new Date().toISOString() });
  const confirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken) });
  expect(confirm.ok(), 'alıcı teslim onayı (delivered->completed)').toBeTruthy();
  // Completion async commit olabiliyor → 'completed' garantilenene kadar poll et (çağıranın
  // hemen-okuma yarışını önler).
  await expectDbEventually(request, 'order', { id: orderId }, (o) => o.status === 'completed');
}

/**
 * RFC 6238 TOTP kodu üretir; authenticator uygulamalarının kullandığı standart
 * base32 çözümlemesiyle aynı davranışı test eder.
 */
export function totpCode(secret: string, windowOffset = 0): string {
  const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const time = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const secretBytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const ch of secret.toUpperCase()) {
    const idx = base32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      secretBytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

/** Format-geçerli benzersiz TR IBAN (TR + 24 rakam). */
export function makeIban(): string {
  let digits = '';
  for (let i = 0; i < 24; i++) digits += Math.floor(Math.random() * 10);
  return 'TR' + digits;
}

// ──────────────────────────── takas depo-akışı yardımcıları ────────────────────────────

/** trade kaydını dev/find ile çek. */
export async function getTradeRow(request: APIRequestContext, tradeId: string, select?: Record<string, any>) {
  return dbFind(request, 'trade', { id: tradeId }, select);
}

/** İki to_warehouse bacağını admin ile ayrı ayrı teslim-alındı işaretle → at_warehouse. */
export async function deliverBothLegsToWarehouse(
  request: APIRequestContext,
  adminTok: string,
  tradeId: string,
): Promise<void> {
  await expect(async () => {
    const n = await dbCount(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' });
    expect(n).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 10_000 });

  for (let i = 0; i < 2; i++) {
    const ship = await dbFind(request, 'tradeShipment', { tradeId, leg: 'to_warehouse', deliveredAt: null }, { id: true });
    expect(ship?.id, `${i + 1}. to_warehouse shipment`).toBeTruthy();
    const r = await request.post(`${API}/admin/trades/${tradeId}/mark-warehouse-received`, {
      headers: auth(adminTok),
      data: { shipmentId: ship.id },
    });
    expect(r.ok(), `${i + 1}. bacak teslim`).toBeTruthy();
  }
  const row = await getTradeRow(request, tradeId, { status: true });
  expect(row.status).toBe('at_warehouse');
}

/** İki from_warehouse bacağını karşılıklı confirm-receipt ile teslim onayla → completed. */
export async function confirmBothRecipientLegs(
  request: APIRequestContext,
  tradeId: string,
  initiatorToken: string,
  receiverToken: string,
): Promise<void> {
  const r1 = await request.post(`${API}/trades/${tradeId}/confirm-receipt`, { headers: auth(initiatorToken), data: {} });
  expect(r1.ok(), 'initiator teslim onayı').toBeTruthy();
  const r2 = await request.post(`${API}/trades/${tradeId}/confirm-receipt`, { headers: auth(receiverToken), data: {} });
  expect(r2.ok(), 'receiver teslim onayı').toBeTruthy();
}
