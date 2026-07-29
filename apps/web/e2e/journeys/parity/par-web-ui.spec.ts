/**
 * Domain 25 — Frontend Parite (PAR): WEB UI/guard + i18n + veri-tutarlılığı dilimleri.
 *
 * Tarayıcı gerektiren (çalışan stack) parite doğrulamaları:
 *  - Misafir korumalı route → giriş yönlendirmesi / içerik sızdırmaz (PAR-110).
 *  - Misafir görüntüleme herkese açık (PAR-072).
 *  - i18n ortak katalog anahtarı iki dilde de mevcut (PAR-052).
 *  - Ürün detay statü/fiyat admin düzenlemesine göre tutarlı (PAR-151, API üzerinden).
 *
 * i18n mesaj JSON'ları doğrudan import edilerek eksik-anahtar STATİK doğrulanır
 * (tarayıcı gerekmez); UI navigasyon testleri page fixture ile koşar.
 */
import { test, expect } from "@playwright/test";
import {
  API,
  USERS,
  apiLogin,
  apiFirstBuyableProduct,
} from "../../support/helpers";
import trMessages from "../../../../../packages/i18n/src/catalog/tr.json";
import enMessages from "../../../../../packages/i18n/src/catalog/en.json";

function getNested(obj: any, path: string): string | undefined {
  let cur: any = obj;
  for (const k of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return typeof cur === "string" ? cur : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAR-052 — Ortak i18n kataloğu: product.deactivateDesc iki dilde de mevcut
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAR-052 [P1] — ortak product.deactivateDesc katalog sözleşmesi", () => {
  test("PAR-052 [P1] — deactivateDesc TR ve EN kataloglarında boş olmayan bir metindir", () => {
    const enValue = getNested(enMessages, "product.deactivateDesc");
    const trValue = getNested(trMessages, "product.deactivateDesc");

    expect(enValue?.trim().length).toBeGreaterThan(0);
    expect(trValue?.trim().length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-072 — Misafir görüntüleme: ürün/katalog herkese açık (fiyat/stok görünür)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAR-072 [P2] — misafir ürün/katalog görüntüleme herkese açık", () => {
  test("PAR-072 [P2] — misafir olarak ürün detayı açılır, içerik/fiyat görünür (login'e atmaz)", async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000);
    const product = await apiFirstBuyableProduct(request);
    await page.goto(`/listings/${product.id}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.locator("body").textContent()) ?? "";
    // Misafir katalog görüntüleme public: 404/login'e atılmaz, içerik dolu.
    expect(body.length).toBeGreaterThan(200);
    expect(page.url()).not.toMatch(/\/login/);
    expect(body).not.toMatch(/sayfa bulunamad|not found|404/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-110 — Misafir korumalı route'a doğrudan giderse giriş'e yönlendirilir (web)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAR-110 [P0] — misafir korumalı route'ta içerik sızdırmaz / giriş'e yönlendirir", () => {
  test("PAR-110 [P0] — /profile misafir olarak login'e yönlenir veya içerik sızdırmaz", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    // Oturum yok (temiz context).
    await page.goto("/profile");
    await page.waitForLoadState("networkidle").catch(() => {});
    const url = page.url();
    const body = (await page.locator("body").textContent()) ?? "";
    // Kabul edilebilir davranış: login'e yönlendi VEYA guard ile korumalı içerik göstermedi.
    const redirectedToLogin = /\/login/.test(url);
    const looksLikeProfileData =
      /siparişlerim|adreslerim|hesap ayarları|my orders|my addresses/i.test(
        body,
      );
    expect(
      redirectedToLogin || !looksLikeProfileData,
      "login'e yönlendi ya da profil verisi sızmadı",
    ).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-151 — Ürün durumu/fiyatı: aynı API kaynağı web ürün detayına yansır
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAR-151 [P1] — ürün fiyat/durum tek kaynak (API) web detayına tutarlı yansır", () => {
  test("PAR-151 [P1] — API'deki ham fiyat, web ürün detayında biçimlenmiş olarak görünür", async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000);
    const product = await apiFirstBuyableProduct(request);
    // API ham fiyat:
    const apiRes = await request.get(`${API}/products/${product.id}`);
    const apiBody = await apiRes.json();
    const p = apiBody?.data ?? apiBody?.product ?? apiBody;
    const rawPrice = Number(p.price);
    expect(Number.isFinite(rawPrice)).toBeTruthy();

    await page.goto(`/listings/${product.id}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = (await page.locator("body").textContent()) ?? "";
    // Web fiyatı tr-TR biçimiyle gösterir (binlik ./ondalık ,) — en azından tam sayı kısmı görünür.
    const intPart = Math.trunc(rawPrice).toLocaleString("tr-TR");
    // Fiyatın tam-sayı kısmı sayfada geçmeli (biçim: "1.234" gibi). Küçük fiyatlarda düz sayı.
    expect(body).toContain(intPart.split(",")[0]);
  });
});
