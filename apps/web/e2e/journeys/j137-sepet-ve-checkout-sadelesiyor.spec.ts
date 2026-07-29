import { expect, test, type Page } from "@playwright/test";

async function openFirstListing(page: Page) {
  await page.goto("/listings");
  const firstCard = page
    .locator('a[href*="/listings/"]')
    .filter({ hasNotText: /tüm ilanlar/i })
    .first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(/\/listings\/[^/]+/);
}

test.describe("J137 - Cart and payment are one purchase flow", () => {
  test("Add to Cart stays on the listing; Buy Now adds to the cart and opens it", async ({
    page,
  }) => {
    await openFirstListing(page);

    const listingUrl = page.url();
    const addToCart = page
      .getByRole("button", { name: /sepete ekle|add to cart/i })
      .first();
    await addToCart.click();
    await expect(page).toHaveURL(listingUrl);

    const buyNow = page
      .getByRole("button", { name: /hemen al|buy now/i })
      .first();
    await buyNow.click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(
      page.getByPlaceholder(/kupon kodunuzu girin|enter your coupon code/i),
    ).toBeVisible();
  });

  test("coupon remains editable on the cart payment page", async ({ page }) => {
    await openFirstListing(page);
    await page
      .getByRole("button", { name: /hemen al|buy now/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cart$/);

    const similarRequest = page.waitForResponse(
      (response) =>
        /\/products\/[^/]+\/similar/.test(response.url()) &&
        response.request().method() === "GET",
    );
    await page.reload();
    await similarRequest;

    const productColumn = page.getByTestId("cart-products-column");
    const similarProducts = productColumn.getByTestId("cart-similar-products");
    await expect(similarProducts).toBeVisible();
    const similarProductCount = await similarProducts
      .locator('a[href*="/listings/"]')
      .count();
    expect(similarProductCount).toBeGreaterThan(0);
    expect(similarProductCount).toBeLessThanOrEqual(4);

    await page
      .getByRole("link", { name: /ödemeye geç|proceed to checkout/i })
      .click();
    await expect(page).toHaveURL(/\/cart\/payment$/, { timeout: 15_000 });
    await expect(
      page.getByPlaceholder(/kupon kodunuzu girin|enter your coupon code/i),
    ).toBeVisible();
  });
});
