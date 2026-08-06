/**
 * Bildirim linkleri gerçek route'a gitmeli.
 *
 * Birim testler hedefin doğru STRING olduğunu kanıtlar; buradaki testler o
 * adresin tarayıcıda gerçekten açıldığını ve 404 OLMADIĞINI doğrular. Eski
 * hata tam buradaydı: `/orders/:id`, `/trades/:id`, `/offers?tab=received`
 * gibi yollar üretiliyordu ve hiçbiri web'de yoktu.
 */
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, loginViaToken, USERS } from "./support/helpers";

const NOT_FOUND = /sayfa bulunamad|not found|404/i;

async function expectRealPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body.length, `${path} boş açıldı`).toBeGreaterThan(200);
  expect(body, `${path} 404 döndü`).not.toMatch(NOT_FOUND);
}

/** Bildirim merkezinin ürettiği hedefler — API haritasıyla aynı yollar. */
const STATIC_TARGETS = [
  "/profile/notifications",
  "/profile/orders",
  "/profile/offers?tab=received",
  "/profile/offers?tab=sent",
  "/profile/trades",
  "/profile/messages",
  "/profile/listings",
  "/profile/favorites",
  "/profile/payments",
  "/listings",
  "/membership",
  "/profile",
];

test.describe("bildirim hedefleri gerçek sayfaya gider", () => {
  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request, USERS.buyer);
    await loginViaToken(page, token);
  });

  for (const locale of ["tr", "en"] as const) {
    test(`${locale}: sabit bildirim hedefleri 404 vermez`, async ({ page }) => {
      for (const target of STATIC_TARGETS) {
        await expectRealPage(page, `/${locale}${target}`);
      }
    });
  }

  test("bildirim merkezindeki kartlar 404'e götürmez", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle").catch(() => {});

    const links = page.locator('a[href*="/profile/"], a[href^="/listings/"]');
    const count = Math.min(await links.count(), 5);
    if (count === 0) {
      test.skip(true, "Bu kullanıcının bildirimi yok");
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const href = await links.nth(index).getAttribute("href");
      if (!href) continue;
      // Çözülmemiş şablon hiçbir zaman DOM'a çıkmamalı.
      expect(href).not.toContain("{{");
      await expectRealPage(page, href);
      await page.goBack().catch(() => {});
    }
  });

  test("zil ve bildirim merkezi aynı hedefi açar", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle").catch(() => {});
    const centreHref = await page
      .locator('a[href*="/profile/"], a[href^="/listings/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (!centreHref) {
      test.skip(true, "Bu kullanıcının bildirimi yok");
      return;
    }

    await page.goto("/");
    await page.getByRole("button", { name: /bildirim|notification/i }).click();
    const bellHref = await page
      .locator('a[href*="/profile/"], a[href^="/listings/"]')
      .first()
      .getAttribute("href");

    expect(bellHref).toBe(centreHref);
  });
});
