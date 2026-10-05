import { BadRequestException } from "@nestjs/common";
import { ListingRemovalReason } from "@prisma/client";
import { LISTING_REMOVAL_DETAIL_MAX_LENGTH } from "@tarodan/types";
import {
  adminRemovalFields,
  sellerRemovalFields,
} from "./listing-removal-input";

/** Hata yanıtı: yerelleştirilmiş katalog anahtarı (literal mesaj değil). */
const i18nKeyOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as { i18nKey?: string }
    ).i18nKey;
  }
  throw new Error("expected a BadRequestException");
};

describe("sellerRemovalFields — satıcının silme/pasife alma nedeni", () => {
  it("eski istemci (hiç neden alanı yok) kabul edilir ve 'not_given' kaydedilir", () => {
    for (const input of [undefined, null, {}, { reason: "", detail: "  " }]) {
      expect(sellerRemovalFields("delete", input)).toEqual({
        reason: ListingRemovalReason.not_given,
        platform: null,
        violationCode: null,
        detail: null,
      });
    }
  });

  it("geçerli neden + platform + not kayda çevrilir (kırpılarak)", () => {
    expect(
      sellerRemovalFields("delete", {
        reason: "sold_elsewhere",
        platform: "sahibinden",
        detail: "  hafta sonu sattım ",
      }),
    ).toEqual({
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "sahibinden",
      violationCode: null,
      detail: "hafta sonu sattım",
    });
  });

  it("geçici duraklatma pasife almada kabul, silmede reddedilir", () => {
    expect(
      sellerRemovalFields("deactivate", { reason: "paused_temporarily" })
        .reason,
    ).toBe(ListingRemovalReason.paused_temporarily);
    expect(
      i18nKeyOf(() =>
        sellerRemovalFields("delete", { reason: "paused_temporarily" }),
      ),
    ).toBe("validation.listingRemoval.reason_not_allowed");
  });

  it("nedensiz açıklama sessizce düşmez: 400 reason_required", () => {
    expect(
      i18nKeyOf(() => sellerRemovalFields("delete", { detail: "bir not" })),
    ).toBe("validation.listingRemoval.reason_required");
  });

  it("platformsuz 'başka platformda sattım' 400 platform_required", () => {
    expect(
      i18nKeyOf(() =>
        sellerRemovalFields("deactivate", { reason: "sold_elsewhere" }),
      ),
    ).toBe("validation.listingRemoval.platform_required");
  });

  it("uzun not 400 detail_too_long ({max} parametresiyle)", () => {
    try {
      sellerRemovalFields("delete", {
        reason: "changed_mind",
        detail: "x".repeat(LISTING_REMOVAL_DETAIL_MAX_LENGTH + 1),
      });
      throw new Error("expected a BadRequestException");
    } catch (error) {
      expect(
        (error as BadRequestException).getResponse() as Record<string, unknown>,
      ).toEqual({
        i18nKey: "validation.listingRemoval.detail_too_long",
        i18nParams: { max: LISTING_REMOVAL_DETAIL_MAX_LENGTH },
      });
    }
  });

  it("istemci 'not_given'ı açıkça gönderemez", () => {
    expect(
      i18nKeyOf(() => sellerRemovalFields("delete", { reason: "not_given" })),
    ).toBe("validation.listingRemoval.reason_not_allowed");
  });
});

describe("adminRemovalFields — yönetici reddi/kaldırması", () => {
  it("her zaman kural ihlali; kod + açıklama kayda geçer", () => {
    expect(
      adminRemovalFields("reject", {
        violationCode: "counterfeit_replica",
        detail: "Replika model",
      }),
    ).toEqual({
      reason: ListingRemovalReason.policy_violation,
      platform: null,
      violationCode: "counterfeit_replica",
      detail: "Replika model",
    });
  });

  it("kodsuz eski istemci (moderasyon kuyruğu, toplu red) kabul edilir: kod null", () => {
    expect(adminRemovalFields("reject", { detail: "Görseller yetersiz" })).toEqual(
      {
        reason: ListingRemovalReason.policy_violation,
        platform: null,
        violationCode: null,
        detail: "Görseller yetersiz",
      },
    );
  });

  it("katalog dışı kod 400 violation_invalid", () => {
    expect(
      i18nKeyOf(() =>
        adminRemovalFields("delete", { violationCode: "made_up" }),
      ),
    ).toBe("validation.listingRemoval.violation_invalid");
  });

  it("'diğer' kodu açıklama ister", () => {
    expect(
      i18nKeyOf(() => adminRemovalFields("delete", { violationCode: "other" })),
    ).toBe("validation.listingRemoval.detail_required");
  });
});
