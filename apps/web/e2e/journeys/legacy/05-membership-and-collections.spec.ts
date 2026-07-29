/**
 * User Journey #5 — Üyelik & Koleksiyonlar
 *
 * Üyelik sayfası ve koleksiyonlar listesi guest + üye için açılabiliyor mu.
 */
import { test, expect } from "@playwright/test";

test.describe("Journey 05 — Üyelik & Koleksiyonlar", () => {
  test("üyelik tier listesi guest için açılır", async ({ page }) => {
    await page.goto("/membership");
    await expect(page).toHaveURL(/\/membership/);

    const text = await page.locator("body").textContent();
    expect(text).toMatch(/üye|tier|premium|business|free|membership|plan/i);
  });

  test("koleksiyon listesi public", async ({ page }) => {
    await page.goto("/collections");
    await expect(page).toHaveURL(/\/collections/);

    // Sayfada "koleksiyon" yazısı veya kart görünmeli
    await page.waitForTimeout(2000);
    const ok =
      (await page.locator("text=/koleksi/i").count()) > 0 ||
      (await page.locator('a[href^="/collections/"]').count()) > 0;
    expect(ok).toBe(true);
  });

  test("marka listesi → manufacturers redirect", async ({ page }) => {
    // Retired /brands showcase (#94) 301s to the live /manufacturers catalog.
    await page.goto("/brands");
    await expect(page).toHaveURL(/\/manufacturers/);
  });

  test("kategori sayfası → listings redirect", async ({ page }) => {
    // Retired /category/:slug (#94) 301s to the /listings grid.
    await page.goto("/category/diecast");
    await expect(page).toHaveURL(/\/listings/);
  });

  test("takas yardım sayfası", async ({ page }) => {
    await page.goto("/guvenli-takas");
    const text = await page.locator("body").textContent();
    expect(text).toMatch(/takas|swap/i);
  });
});
