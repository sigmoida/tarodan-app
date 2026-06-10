/**
 * Tarodan E2E — paylaşılan yardımcılar (136 journey için ortak altyapı).
 *
 * İki katman:
 *  - UI: gerçek kullanıcı gibi (login, register, gezinme) → manuel-eşdeğer.
 *  - API (request fixture): tarayıcıdan sürülemeyen adımlar için
 *    (ödeme tamamlama=bypass, admin force, zaman-bazlı tetikleme, webhook).
 *
 * Önkoşullar (çalışan stack):
 *  - docker up + `pnpm db:reset` (seed'li kullanıcılar/ürünler)
 *  - API, **PAYMENT_BYPASS=true** ile çalışmalı (gerçek PayTR yerine bypass).
 *    Playwright config API'yi `cd ../api && pnpm dev` ile başlatır; E2E için
 *    o komutu `cross-env PAYMENT_BYPASS=true pnpm dev` yap ya da .env'de set et.
 */
import { Page, APIRequestContext, expect } from '@playwright/test';
import * as crypto from 'crypto';

export const API = 'http://localhost:3001/api';

/** Seed'li hesaplar (apps/api/prisma/seed.ts) — hepsi e-posta doğrulanmış. */
export const USERS = {
  buyer: { email: 'mehmet@demo.com', password: 'Demo123!' },
  buyerClean: { email: 'deniz@demo.com', password: 'Demo123!' }, // ilan yok, her ürünü alabilir
  newMember: { email: 'ceren@demo.com', password: 'Demo123!' },
  sellerPremium: { email: 'ahmet@demo.com', password: 'Demo123!' },
  sellerBusiness: { email: 'ali@demo.com', password: 'Demo123!' },
  sellerFree: { email: 'zeynep@demo.com', password: 'Demo123!' },
  admin: { email: 'admin@tarodan.com', password: 'Admin123!' },
  moderator: { email: 'moderator@tarodan.com', password: 'Admin123!' },
} as const;

type Creds = { email: string; password: string };
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// ───────────────────────────── UI ─────────────────────────────

/** UI login (mevcut spec'lerle aynı selector'lar). */
export async function login(page: Page, user: Creds): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(profile|listings|$)/, { timeout: 15_000 }).catch(() => {});
}

/**
 * Hızlı + güvenilir oturum: UI form-login yerine apiLogin token'ını localStorage'a
 * enjekte eder (form flakiness'i ve protected-page rehydrate timing'i ortadan kalkar).
 * Protected sayfaya gitmeden önce çağır.
 */
export async function loginViaToken(page: Page, token: string, refreshToken?: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ t, rt }) => {
      localStorage.setItem('auth_token', t);
      if (rt) localStorage.setItem('refresh_token', rt);
    },
    { t: token, rt: refreshToken },
  );
}

export function uniqueEmail(): string {
  return `pw-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
}

/** Benzersiz TR cep no (5XXXXXXXXX) — register'da telefon çakışmasını (409) önler. */
export function uniquePhone(): string {
  return '5' + String(Math.floor(100000000 + Math.random() * 900000000));
}

export function birthdayOver18(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d.toISOString().split('T')[0];
}

/** UI register formu doldur (08-register-flow ile aynı selector'lar). Submit YAPMAZ. */
export async function fillRegisterForm(
  page: Page,
  opts: { name?: string; email?: string; phone?: string; birthDate?: string; password?: string; confirmPassword?: string; acceptTerms?: boolean } = {},
): Promise<{ email: string; password: string }> {
  const name = opts.name ?? 'Playwright Test User';
  const email = opts.email ?? uniqueEmail();
  const phone = opts.phone ?? uniquePhone();
  const birthDate = opts.birthDate ?? birthdayOver18();
  const password = opts.password ?? 'Pwtest123!';
  const confirmPassword = opts.confirmPassword ?? password;

  await page.locator('input[placeholder*="Adınız" i], input[placeholder*="full name" i]').first().fill(name);
  await page.locator('input[type="email"]').first().fill(email);
  const phoneInput = page.locator('input[placeholder*="5XX" i], input[name*="phone" i]').first();
  if ((await phoneInput.count()) > 0) await phoneInput.fill(phone);
  const dateInput = page.locator('input[type="date"]').first();
  if ((await dateInput.count()) > 0) await dateInput.fill(birthDate);
  const pwd = page.locator('input[type="password"]');
  await pwd.first().fill(password);
  if ((await pwd.count()) >= 2) await pwd.nth(1).fill(confirmPassword);
  if (opts.acceptTerms !== false) {
    const cbs = page.locator('input[type="checkbox"]');
    const n = await cbs.count();
    for (let i = 0; i < n; i++) {
      const cb = cbs.nth(i);
      if (!(await cb.isChecked())) await cb.check().catch(() => {});
    }
  }
  return { email, password };
}

// ───────────────────────────── API ─────────────────────────────

/** API login → accessToken (request-fixture çağrıları için). */
export async function apiLogin(request: APIRequestContext, user: Creds): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: user });
  expect(res.ok(), `login ${user.email}`).toBeTruthy();
  const body = await res.json();
  const token = body?.tokens?.accessToken ?? body?.accessToken ?? body?.data?.tokens?.accessToken;
  expect(token, 'accessToken bulundu').toBeTruthy();
  return token as string;
}

export async function apiMe(request: APIRequestContext, token: string): Promise<any> {
  const res = await request.get(`${API}/users/me`, { headers: authHeader(token) });
  const body = await res.json();
  return body?.user ?? body?.data ?? body;
}

const sellerIdOf = (x: any) => x?.sellerId ?? x?.seller?.id;

/** Alıcı için satın alınabilir bir ürün bul. BİLİNEN seed satıcının (ahmet/ali/zeynep)
 *  yüksek-stoklu ürününü döndürür → journey'ler order'ın satıcı token'ını her zaman bulabilir
 *  (tokenForSeller bu üç kullanıcıyı dener). Böylece "seed token bulunamadı" + "satıcı prepare"
 *  hataları olmaz. Bilinen satıcıda uygun ürün yoksa genel listeye düşer. */
export async function apiFirstBuyableProduct(request: APIRequestContext, buyerId?: string): Promise<any> {
  const virtual = (x: any) => String(x.id).startsWith('membership-') || String(x.id).startsWith('boost-');
  const buyable = (x: any) => !virtual(x) && (x.quantity == null || Number(x.quantity) > 0);

  // 1) Bilinen seed satıcıların (alıcının kendisi değil) ürünü
  for (const su of [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree]) {
    const tok = await apiLogin(request, su);
    const me = await apiMe(request, tok);
    if (buyerId && me.id === buyerId) continue;
    const r = await request.get(`${API}/products`, { params: { status: 'active', limit: '100', sellerId: me.id } });
    const b = await r.json();
    const list: any[] = b?.data ?? b?.products ?? (Array.isArray(b) ? b : []);
    const p = list.find((x) => buyable(x) && sellerIdOf(x) === me.id) ?? list.find(buyable);
    if (p) return p;
  }

  // 2) Fallback: genel liste (yüksek-stok tercihli)
  const res = await request.get(`${API}/products`, { params: { status: 'active', limit: '100' } });
  const body = await res.json();
  const list: any[] = body?.data ?? body?.products ?? (Array.isArray(body) ? body : []);
  const eligible = (x: any) => buyable(x) && (!buyerId || sellerIdOf(x) !== buyerId);
  const p = list.find((x) => eligible(x) && Number(x.quantity) >= 1000) ?? list.find(eligible);
  expect(p, 'satın alınabilir ürün bulundu').toBeTruthy();
  return p;
}

export async function apiDefaultAddressId(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${API}/users/me/addresses`, { headers: authHeader(token) });
  const body = await res.json();
  const list: any[] = body?.data ?? body?.addresses ?? (Array.isArray(body) ? body : []);
  const a = list.find((x) => x.isDefault) ?? list[0];
  expect(a?.id, 'kayıtlı adres bulundu').toBeTruthy();
  return a.id;
}

/**
 * Tam satın alma (API): adres → /orders/buy → /payments/initiate → bypass-complete.
 * PAYMENT_BYPASS=true gerektirir. Dönen orderId ödenmiş/onaylanmış olmalı.
 */
export async function apiBuyAndPay(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<{ orderId: string; paymentId: string }> {
  const shippingAddressId = await apiDefaultAddressId(request, token);
  const buyRes = await request.post(`${API}/orders/buy`, { headers: authHeader(token), data: { productId, shippingAddressId } });
  if (!buyRes.ok()) {
    const t = await buyRes.text();
    expect(buyRes.ok(), `orders/buy (${buyRes.status()}) ${t.slice(0, 110)}`).toBeTruthy();
  }
  const buyBody = await buyRes.json();
  const orderId = buyBody?.orderId ?? buyBody?.id ?? buyBody?.order?.id;
  expect(orderId, 'orderId').toBeTruthy();

  const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(token), data: { orderId, provider: 'paytr' } });
  expect(initRes.ok(), 'payments/initiate').toBeTruthy();
  const initBody = await initRes.json();
  const paymentId = initBody?.paymentId ?? initBody?.id;
  expect(initBody?.useBypass, 'PAYMENT_BYPASS açık olmalı (useBypass=true)').toBe(true);
  expect(paymentId, 'paymentId').toBeTruthy();

  const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
  expect(doneRes.ok(), 'bypass-complete').toBeTruthy();
  return { orderId, paymentId };
}

export async function apiGetOrder(request: APIRequestContext, token: string, orderId: string): Promise<any> {
  const res = await request.get(`${API}/orders/${orderId}`, { headers: authHeader(token) });
  const body = await res.json();
  return body?.data ?? body?.order ?? body;
}

/**
 * PayTR callback imzala (webhook journey'leri için). API'nin kullandığı
 * MERCHANT_KEY/SALT ile aynı olmalı (apps/api/.env). Test ortamı için override edilebilir.
 */
export function signPaytrCallback(
  merchantOid: string,
  status: 'success' | 'failed',
  totalAmountKurus: number,
  merchantKey = process.env.PAYTR_MERCHANT_KEY ?? 'NoSsE9LdqBa3ngMg',
  merchantSalt = process.env.PAYTR_MERCHANT_SALT ?? 'q73ka6Y6oUFQi42u',
): Record<string, string> {
  const hashStr = `${merchantOid}${merchantSalt}${status}${totalAmountKurus}`;
  const hash = crypto.createHmac('sha256', merchantKey).update(hashStr).digest('base64');
  return { merchant_oid: merchantOid, status, total_amount: String(totalAmountKurus), hash };
}

/**
 * Önkoşul ödeme — GERÇEK PayTR webhook yolu (PAYMENT_BYPASS=false + AKTİF sandbox mağaza gerekir).
 * orders/buy → payments/initiate → payment'in merchant_oid+tutarını dev/find ile al →
 * imzalı 'success' callback'i /payments/callback/paytr'a POST et (prod ile aynı handler).
 * Aktif sandbox mağaza yoksa initiate patlar → o durumda apiBuyAndPay (bypass) kullan.
 */
export async function apiPayViaCallback(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<{ orderId: string; paymentId: string }> {
  const shippingAddressId = await apiDefaultAddressId(request, token);
  const buyRes = await request.post(`${API}/orders/buy`, { headers: authHeader(token), data: { productId, shippingAddressId } });
  expect(buyRes.ok(), 'orders/buy').toBeTruthy();
  const orderId = (await buyRes.json())?.orderId ?? (await buyRes.json())?.id;
  expect(orderId, 'orderId').toBeTruthy();

  const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(token), data: { orderId, provider: 'paytr' } });
  expect(initRes.ok(), 'payments/initiate (AKTİF PayTR sandbox mağaza gerekli)').toBeTruthy();
  const paymentId = (await initRes.json())?.paymentId;
  expect(paymentId, 'paymentId').toBeTruthy();

  // merchant_oid + tutar (korumalı dev/find hook)
  const findRes = await request.post(`${API}/dev/find`, {
    data: { model: 'payment', where: { id: paymentId }, select: { providerConversationId: true, amount: true } },
  });
  const pay = await findRes.json();
  const merchantOid: string = pay?.providerConversationId ?? String(orderId).replace(/-/g, '');
  const amountKurus = Math.round(Number(pay?.amount ?? 0) * 100);

  const cb = signPaytrCallback(merchantOid, 'success', amountKurus);
  const cbRes = await request.post(`${API}/payments/callback/paytr`, { form: cb });
  expect(cbRes.ok(), 'PayTR callback işlendi').toBeTruthy();
  return { orderId, paymentId };
}
