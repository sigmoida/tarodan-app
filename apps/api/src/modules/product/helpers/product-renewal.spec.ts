import { BadRequestException } from "@nestjs/common";
import { MembershipTierType, ProductStatus } from "@prisma/client";
import { i18nMessage } from "../../i18n";
import {
  describeRenewalFailure,
  hasSellableStock,
  isRenewableInPlace,
  resolveRenewalStatus,
  sellerSaleBlock,
} from "./product-renewal";

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

const healthySeller = {
  isBanned: false,
  businessStatus: null,
  companyName: null,
  taxId: null,
  membership: null,
};

/** Onaylı kurumsal kimlik; BUSINESS hakkı sürüyor mu parametre. */
const corporateSeller = (entitled: boolean) => ({
  isBanned: false,
  businessStatus: "approved",
  companyName: "Tarodan Ltd",
  taxId: "1234567890",
  membership: {
    status: "active",
    currentPeriodEnd: entitled ? FUTURE : PAST,
    tier: { type: MembershipTierType.business, isActive: true },
  },
});

describe("sellerSaleBlock", () => {
  it("sağlıklı satıcı engellenmez", () => {
    expect(sellerSaleBlock(healthySeller)).toBeNull();
    expect(sellerSaleBlock(undefined)).toBeNull();
  });

  it("banlı satıcı engellenir", () => {
    expect(sellerSaleBlock({ ...healthySeller, isBanned: true })).toBe("banned");
  });

  it("BUSINESS hakkı bitmiş onaylı kurumsal satıcı askıdadır", () => {
    expect(sellerSaleBlock(corporateSeller(false))).toBe("corporate_suspended");
    expect(sellerSaleBlock(corporateSeller(true))).toBeNull();
  });
});

describe("hasSellableStock / isRenewableInPlace", () => {
  it.each([
    [null, true],
    [3, true],
    [0, false],
  ])("stok %p → satılabilir=%p", (quantity, expected) => {
    expect(hasSellableStock(quantity)).toBe(expected);
  });

  it("stokta + sağlıklı satıcı → yerinde yenilenir", () => {
    expect(isRenewableInPlace({ quantity: 2 }, healthySeller)).toBe(true);
    expect(isRenewableInPlace({ quantity: null }, healthySeller)).toBe(true);
  });

  it("stok yok, banlı ya da askıdaki satıcı → yenilenmez", () => {
    expect(isRenewableInPlace({ quantity: 0 }, healthySeller)).toBe(false);
    expect(
      isRenewableInPlace({ quantity: 2 }, { ...healthySeller, isBanned: true }),
    ).toBe(false);
    expect(isRenewableInPlace({ quantity: 2 }, corporateSeller(false))).toBe(
      false,
    );
  });
});

describe("resolveRenewalStatus — yalnız değişmemiş, daha önce onaylı ilan atlar", () => {
  it("iz eşleşiyorsa doğrudan yayın", () => {
    expect(
      resolveRenewalStatus({ approvedContentFingerprint: "abc" }, "abc"),
    ).toBe(ProductStatus.active);
  });

  it("içerik değiştiyse normal onay kuralı (pending)", () => {
    expect(
      resolveRenewalStatus({ approvedContentFingerprint: "abc" }, "xyz"),
    ).toBe(ProductStatus.pending);
  });

  it("onay izi yoksa (eski kayıt) 'değişmedi' kanıtlanamaz → pending", () => {
    expect(
      resolveRenewalStatus({ approvedContentFingerprint: null }, "abc"),
    ).toBe(ProductStatus.pending);
  });
});

describe("describeRenewalFailure", () => {
  it("yerelleştirilmiş istisnanın anahtarını ve parametrelerini korur", () => {
    const error = new BadRequestException(
      i18nMessage("server.product.listingLimitReached", {
        tierName: "Free",
        maxListings: 5,
      }),
    );
    expect(describeRenewalFailure(error)).toEqual({
      errorKey: "server.product.listingLimitReached",
      errorParams: { tierName: "Free", maxListings: 5 },
      unexpected: false,
    });
  });

  it("beklenmeyen hata genel anahtara düşer ve işaretlenir", () => {
    expect(describeRenewalFailure(new Error("boom"))).toEqual({
      errorKey: "server.product.renewFailed",
      unexpected: true,
    });
  });
});
