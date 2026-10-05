import { ProductStatus } from "@prisma/client";
import {
  offerExpiresAt,
  offerExtensionBlocker,
  type OfferExtensionCandidate,
} from "./offer-expiry";

const eligible = (
  patch: Partial<OfferExtensionCandidate> = {},
): OfferExtensionCandidate => ({
  extendedAt: null,
  product: {
    status: ProductStatus.active,
    quantity: null,
    reservedQuantity: 0,
  },
  buyer: { isBanned: false, deletedAt: null },
  seller: { isBanned: false, deletedAt: null },
  ...patch,
});

describe("offerExtensionBlocker", () => {
  it("aktif ilan ve sağlam taraflarda uzatılabilir", () => {
    expect(offerExtensionBlocker(eligible())).toBeNull();
  });

  it("hak zaten kullanıldıysa uzatılamaz", () => {
    expect(offerExtensionBlocker(eligible({ extendedAt: new Date() }))).toBe(
      "alreadyExtended",
    );
  });

  it.each([
    ProductStatus.sold,
    ProductStatus.inactive,
    ProductStatus.reserved,
    ProductStatus.deleted,
    ProductStatus.suspended,
  ])("ilan %s ise uzatılamaz", (status) => {
    expect(
      offerExtensionBlocker(
        eligible({
          product: { status, quantity: null, reservedQuantity: 0 },
        }),
      ),
    ).toBe("listingUnavailable");
  });

  it("ilan satırı yoksa uzatılamaz", () => {
    expect(offerExtensionBlocker(eligible({ product: null }))).toBe(
      "listingUnavailable",
    );
  });

  it("müsait adet kalmadıysa uzatılamaz", () => {
    expect(
      offerExtensionBlocker(
        eligible({
          product: {
            status: ProductStatus.active,
            quantity: 2,
            reservedQuantity: 2,
          },
        }),
      ),
    ).toBe("listingUnavailable");
  });

  it("müsait adet varsa uzatılabilir", () => {
    expect(
      offerExtensionBlocker(
        eligible({
          product: {
            status: ProductStatus.active,
            quantity: 3,
            reservedQuantity: 2,
          },
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ["alıcı yasaklı", { buyer: { isBanned: true, deletedAt: null } }],
    ["satıcı yasaklı", { seller: { isBanned: true, deletedAt: null } }],
    ["alıcı silinmiş", { buyer: { isBanned: false, deletedAt: new Date() } }],
    ["satıcı silinmiş", { seller: { isBanned: false, deletedAt: new Date() } }],
    ["alıcı satırı yok", { buyer: null }],
  ])("%s ise uzatılamaz", (_label, patch) => {
    expect(offerExtensionBlocker(eligible(patch))).toBe("partyUnavailable");
  });
});

describe("offerExpiresAt", () => {
  const HOUR = 60 * 60 * 1000;
  const db = (value?: string) => ({
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          value === undefined ? null : { settingValue: value },
        ),
    },
  });

  it("verilen andan itibaren offerExpiryHours kadar sonrası", async () => {
    const from = new Date("2026-10-05T12:00:00.000Z");
    await expect(
      offerExpiresAt(db("12"), { get: () => undefined }, from),
    ).resolves.toEqual(new Date(from.getTime() + 12 * HOUR));
  });

  it("ayar yokken bugünkü gibi 24 saat", async () => {
    const from = new Date("2026-10-05T12:00:00.000Z");
    await expect(
      offerExpiresAt(db(), { get: () => undefined }, from),
    ).resolves.toEqual(new Date(from.getTime() + 24 * HOUR));
  });
});
