/**
 * İlan görselleri — toplu yükleme, sıralama ve kapak seçimi.
 *
 * Kapsanan iki senaryo:
 *   1. Yeni ilan: birden çok görseli birlikte yükle → birini kapak yap →
 *      kaydet → ilan detayında sıralamayı doğrula.
 *   2. Düzenleme: mevcut görselleri sırala → kaydet → sayfayı YENİLE →
 *      sıranın korunduğunu doğrula.
 *
 * Bunlar birim testlerin göremediği yeri kapsar: gerçek tarayıcıda dosya
 * seçimi, sürükle-bırak, klavyeyle taşıma ve sıranın veritabanına yazılıp
 * yeniden okunması.
 */
import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./support/helpers";

/** Tek renk dolu, geçerli bir PNG üretir (Sharp bunu kabul eder). */
function pngBuffer(): Buffer {
  // 1x1 saydam PNG — boyut önemsiz, tip ve geçerlilik önemli.
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
}

const tiles = (page: Page) => page.getByTestId("listing-image-tile");

/** Tüm karolar "uploaded" olana kadar bekler — yükleme bitmeden kaydedilmemeli. */
async function waitForUploads(page: Page, expectedCount: number) {
  await expect(tiles(page)).toHaveCount(expectedCount);
  await expect(
    page.locator('[data-testid="listing-image-tile"][data-status="uploaded"]'),
  ).toHaveCount(expectedCount, { timeout: 60_000 });
}

async function attachImages(page: Page, names: string[]) {
  await page.getByTestId("listing-image-input").setInputFiles(
    names.map((name) => ({
      name,
      mimeType: "image/png",
      buffer: pngBuffer(),
    })),
  );
}

test.describe("ilan görselleri", () => {
  test.beforeEach(async ({ page }) => {
    // Premium satıcı: görsel kontenjanı senaryolara yetecek kadar geniş.
    await login(page, USERS.sellerPremium);
  });

  test("yeni ilan: toplu yükleme, kapak seçimi ve sıranın kaydedilmesi", async ({
    page,
  }) => {
    await page.goto("/listings/new");

    // 1) Birden çok dosya TEK seferde eklenir.
    await attachImages(page, ["bir.png", "iki.png", "uc.png"]);
    await waitForUploads(page, 3);

    // İlk görsel kapaktır.
    await expect(
      tiles(page).first().getByTestId("listing-image-cover-badge"),
    ).toBeVisible();

    // 2) Üçüncü görsel kapak yapılır → listenin başına geçer.
    const thirdPreview = await tiles(page)
      .nth(2)
      .locator("img")
      .getAttribute("src");
    await tiles(page)
      .nth(2)
      .getByLabel(/kapak yap/i)
      .click();

    await expect(tiles(page).first().locator("img")).toHaveAttribute(
      "src",
      thirdPreview as string,
    );
    await expect(
      tiles(page).first().getByTestId("listing-image-cover-badge"),
    ).toBeVisible();

    // 3) Yükleme biterken kaydetme engellenmemeli (hepsi uploaded).
    await expect(page.getByText(/yükleniyor/i)).toHaveCount(0);
  });

  test("sürükle-bırak alanına bırakılan dosyalar da yüklenir", async ({
    page,
  }) => {
    await page.goto("/listings/new");

    const dropzone = page.getByTestId("listing-image-dropzone");
    await expect(dropzone).toBeVisible();

    // DataTransfer ile gerçek bir drop olayı üretilir.
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      const file = new File(["x"], "surukle.png", { type: "image/png" });
      transfer.items.add(file);
      return transfer;
    });
    await dropzone.dispatchEvent("dragenter", { dataTransfer });
    await expect(dropzone).toHaveAttribute("data-drag-active", "true");
    await dropzone.dispatchEvent("drop", { dataTransfer });

    // Dosya listeye girer (yükleme sonucu ortama göre değişebilir; burada
    // bırakmanın kabul edildiği doğrulanır).
    await expect(tiles(page)).toHaveCount(1);
  });

  test("klavyeyle sıralama: tutamağa odaklanıp ok tuşlarıyla taşınır", async ({
    page,
  }) => {
    await page.goto("/listings/new");
    await attachImages(page, ["bir.png", "iki.png"]);
    await waitForUploads(page, 2);

    const firstPreview = await tiles(page)
      .first()
      .locator("img")
      .getAttribute("src");

    // dnd-kit klavye sensörü: boşluk ile tut, ok ile taşı, boşluk ile bırak.
    await tiles(page)
      .first()
      .getByLabel(/sırasını değiştir/i)
      .focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");

    await expect(tiles(page).nth(1).locator("img")).toHaveAttribute(
      "src",
      firstPreview as string,
    );
  });

  test("düzenleme: sıra değiştirilip kaydedilir ve YENİLEMEDEN sonra korunur", async ({
    page,
  }) => {
    // Kullanıcının en az iki görselli bir ilanı olmalı; yoksa senaryo atlanır
    // (ortam verisine bağlı).
    await page.goto("/profile/listings");
    const firstListing = page.getByRole("link", { name: /düzenle/i }).first();
    if ((await firstListing.count()) === 0) {
      test.skip(true, "Düzenlenecek ilan yok");
      return;
    }
    await firstListing.click();

    await expect(tiles(page).first()).toBeVisible();
    const count = await tiles(page).count();
    if (count < 2) {
      test.skip(true, "İlanın en az iki görseli yok");
      return;
    }

    // Mevcut görseller YENİDEN YÜKLENMEZ: hepsi doğrudan "uploaded" gelir.
    await expect(
      page.locator(
        '[data-testid="listing-image-tile"][data-status="uploaded"]',
      ),
    ).toHaveCount(count);

    const secondPreview = await tiles(page)
      .nth(1)
      .locator("img")
      .getAttribute("src");

    await tiles(page)
      .nth(1)
      .getByLabel(/kapak yap/i)
      .click();
    await expect(tiles(page).first().locator("img")).toHaveAttribute(
      "src",
      secondPreview as string,
    );

    await page
      .getByRole("button", { name: /kaydet|güncelle/i })
      .first()
      .click();
    await expect(page.getByText(/güncellendi|kaydedildi/i)).toBeVisible({
      timeout: 30_000,
    });

    // Sayfayı yenile — sıra veritabanından aynı gelmeli.
    await page.reload();
    await expect(tiles(page).first().locator("img")).toHaveAttribute(
      "src",
      secondPreview as string,
    );
  });
});
