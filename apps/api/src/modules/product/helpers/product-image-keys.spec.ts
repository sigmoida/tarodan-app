import { BadRequestException } from "@nestjs/common";
import {
  assertValidProductImages,
  isOwnedProductImageKey,
  productImageFolder,
} from "./product-image-keys";

const OWNER = "user-1";
const key = (userId: string, name: string) =>
  `dev/products/${productImageFolder(userId)}/${name}.webp`;

const image = (userId: string, base: string) => ({
  cardKey: key(userId, `${base}-card`),
  detailKey: key(userId, `${base}-detail`),
});

const options = (overrides: Record<string, unknown> = {}) => ({
  userId: OWNER,
  maxImages: 5,
  tierName: "Ücretsiz",
  ...overrides,
});

describe("ürün görseli anahtarları", () => {
  it("kullanıcının kendi yüklemesini kabul eder", () => {
    expect(() =>
      assertValidProductImages([image(OWNER, "a")], options()),
    ).not.toThrow();
  });

  it("görsel yoksa doğrulanacak bir şey yoktur", () => {
    expect(() => assertValidProductImages([], options())).not.toThrow();
    expect(() => assertValidProductImages(undefined, options())).not.toThrow();
  });

  describe("sahiplik", () => {
    /**
     * Regresyon: anahtarlar istemciden gelip doğrudan yazılıyordu. Başkasının
     * anahtarını gönderen istek o görseli kendi ilanına iliştirebiliyordu.
     */
    it("BAŞKASININ yüklemesini reddeder", () => {
      expect(() =>
        assertValidProductImages([image("user-2", "a")], options()),
      ).toThrow(BadRequestException);
    });

    it("düzenlemede ürüne HÂLEN bağlı eski anahtarlar kabul edilir", () => {
      // Eski şema: kullanıcı klasörü yok.
      const legacy = {
        cardKey: "dev/products/product-images/temp/x-card.webp",
        detailKey: "dev/products/product-images/temp/x-detail.webp",
      };

      expect(() => assertValidProductImages([legacy], options())).toThrow(
        BadRequestException,
      );

      expect(() =>
        assertValidProductImages(
          [legacy],
          options({
            existingKeys: new Set([legacy.cardKey, legacy.detailKey]),
          }),
        ),
      ).not.toThrow();
    });

    it("başka ürünün eski anahtarı, izinli küme dışındaysa reddedilir", () => {
      expect(() =>
        assertValidProductImages(
          [
            {
              cardKey: "dev/products/product-images/temp/other-card.webp",
              detailKey: "dev/products/product-images/temp/other-detail.webp",
            },
          ],
          options({
            existingKeys: new Set([
              "dev/products/product-images/temp/mine-card.webp",
            ]),
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it("sahiplik yardımcısı klasörü tam eşleştirir", () => {
      expect(isOwnedProductImageKey(key(OWNER, "a"), OWNER)).toBe(true);
      expect(isOwnedProductImageKey(key(OWNER, "a"), "user-2")).toBe(false);
      // Önek benzerliği yetmez: user-1 ile user-10 karışmamalı.
      expect(isOwnedProductImageKey(key("user-10", "a"), "user-1")).toBe(false);
    });
  });

  describe("biçim", () => {
    it("boş anahtarı reddeder", () => {
      expect(() =>
        assertValidProductImages(
          [{ cardKey: "", detailKey: key(OWNER, "d") }],
          options(),
        ),
      ).toThrow(BadRequestException);
    });

    it("dizin atlama denemesini reddeder", () => {
      expect(() =>
        assertValidProductImages(
          [
            {
              cardKey: `dev/products/product-images/u/${OWNER}/../../secret.webp`,
              detailKey: key(OWNER, "d"),
            },
          ],
          options(),
        ),
      ).toThrow(BadRequestException);
    });

    it("ürün görseli yolunda olmayan anahtarı reddeder", () => {
      expect(() =>
        assertValidProductImages(
          [
            {
              cardKey: `dev/avatars/u/${OWNER}/a.webp`,
              detailKey: key(OWNER, "d"),
            },
          ],
          options(),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe("tekrar", () => {
    it("aynı anahtarı iki kez gönderen isteği reddeder", () => {
      const duplicate = image(OWNER, "a");
      expect(() =>
        assertValidProductImages([duplicate, { ...duplicate }], options()),
      ).toThrow(BadRequestException);
    });

    it("cardKey ile detailKey aynıysa reddeder", () => {
      const same = key(OWNER, "a");
      expect(() =>
        assertValidProductImages(
          [{ cardKey: same, detailKey: same }],
          options(),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe("adet sınırı", () => {
    it("üyelik sınırını aşan isteği reddeder", () => {
      const images = Array.from({ length: 4 }, (_, i) => image(OWNER, `a${i}`));
      expect(() =>
        assertValidProductImages(images, options({ maxImages: 3 })),
      ).toThrow(BadRequestException);
    });

    it("sınıra eşit adet kabul edilir", () => {
      const images = Array.from({ length: 3 }, (_, i) => image(OWNER, `a${i}`));
      expect(() =>
        assertValidProductImages(images, options({ maxImages: 3 })),
      ).not.toThrow();
    });
  });
});
