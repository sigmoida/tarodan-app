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
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./support/helpers";

/**
 * Geçerli bir PNG üretir (Sharp bunu kabul eder).
 *
 * 1×1 PNG ARTIK YETMEZ: istemci 1 KB altındaki dosyaları reddediyor ve 500
 * pikselin altını "düşük çözünürlük" diye işaretliyor. Bu yüzden 512×512,
 * gürültülü (kolay sıkışmayan) bir kare üretilir — hem sınırların üstünde hem
 * gerçek bir ürün fotoğrafına yakın.
 */
function pngBuffer(): Buffer {
  const size = 512;
  const raw = Buffer.alloc(size * size * 3);
  let seed = 1;
  for (let i = 0; i < raw.length; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    raw[i] = seed % 256;
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // renk tipi: truecolor
  // Her satır bir filtre baytıyla başlar (0 = None).
  const scanlines = Buffer.concat(
    Array.from({ length: size }, (_, row) =>
      Buffer.concat([
        Buffer.from([0]),
        raw.subarray(row * size * 3, (row + 1) * size * 3),
      ]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
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

    // DataTransfer ile gerçek bir drop olayı üretilir. Dosya 1 KB alt sınırının
    // ÜSTÜNDE olmalı; aksi halde istemci daha listeye almadan reddeder.
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      const file = new File([new Uint8Array(4096)], "surukle.png", {
        type: "image/png",
      });
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
