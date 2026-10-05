import { ListingRemovalReason, ProductInactiveReason } from "@prisma/client";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  LISTING_REMOVAL_PLATFORMS,
  LISTING_REMOVAL_REASONS,
  LISTING_REMOVAL_REASONS_BY_ACTOR,
  LISTING_REMOVAL_REASON_OPTIONS,
  LISTING_REMOVED_STATUSES,
  LISTING_VIOLATION_CODES,
  isListingRemovedStatus,
  listingRemovalActorOf,
  listingRemovalIssue,
  listingRemovalReasonOptions,
  normalizeListingRemovalInput,
} from "@tarodan/types";

/**
 * Kaldırma nedeni kataloğu ve doğrulama kuralı (@tarodan/types) — API, web ve
 * admin aynı fonksiyonu çağırır. Bu spec kuralın kendisini ve DB enum'uyla
 * kontratını sabitler.
 */
describe("listing removal catalog — kontrat", () => {
  it("Prisma enum'u (ListingRemovalReason) katalogla birebir aynı", () => {
    expect([...Object.values(ListingRemovalReason)].sort()).toEqual(
      [...LISTING_REMOVAL_REASONS].sort(),
    );
  });

  it("her neden TEK bir aktör grubundadır", () => {
    const grouped = Object.values(LISTING_REMOVAL_REASONS_BY_ACTOR).flat();
    expect([...grouped].sort()).toEqual([...LISTING_REMOVAL_REASONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("davranış işaretinin (inactiveReason) her değeri aynı adla bir SİSTEM nedenidir", () => {
    for (const value of Object.values(ProductInactiveReason)) {
      expect(LISTING_REMOVAL_REASONS_BY_ACTOR.system).toContain(value);
      expect(listingRemovalActorOf(value as ListingRemovalReason)).toBe(
        "system",
      );
    }
  });

  it("aktörler: satıcı / sistem / Tarodan", () => {
    expect(listingRemovalActorOf("not_given")).toBe("seller");
    expect(listingRemovalActorOf("sold_elsewhere")).toBe("seller");
    expect(listingRemovalActorOf("out_of_stock")).toBe("system");
    expect(listingRemovalActorOf("seller_suspended")).toBe("system");
    expect(listingRemovalActorOf("policy_violation")).toBe("admin");
  });

  it("kaldırma statüleri: inactive, deleted, rejected, suspended", () => {
    expect([...LISTING_REMOVED_STATUSES].sort()).toEqual(
      ["deleted", "inactive", "rejected", "suspended"].sort(),
    );
    expect(isListingRemovedStatus("active")).toBe(false);
    expect(isListingRemovedStatus("sold")).toBe(false);
    expect(isListingRemovedStatus("pending")).toBe(false);
  });

  it("not_given hiçbir formda seçenek değildir (yalnız sunucu yazar)", () => {
    for (const byAction of Object.values(LISTING_REMOVAL_REASON_OPTIONS)) {
      for (const options of Object.values(byAction)) {
        expect(options).not.toContain("not_given");
      }
    }
  });

  it("platform ve ihlal listeleri 'other' ile biter (serbest metin kaçışı)", () => {
    expect(LISTING_REMOVAL_PLATFORMS[LISTING_REMOVAL_PLATFORMS.length - 1]).toBe(
      "other",
    );
    expect(LISTING_VIOLATION_CODES[LISTING_VIOLATION_CODES.length - 1]).toBe(
      "other",
    );
    expect(LISTING_REMOVAL_PLATFORMS).toEqual([
      "letgo",
      "instagram",
      "dolap",
      "sahibinden",
      "in_person",
      "other",
    ]);
  });
});

describe("listingRemovalReasonOptions — aktör × eylem", () => {
  it("satıcı silme: vazgeçtim, başka platformda sattım", () => {
    expect(listingRemovalReasonOptions("seller", "delete")).toEqual([
      "changed_mind",
      "sold_elsewhere",
    ]);
  });

  it("satıcı pasife alma: ek olarak geçici duraklatma", () => {
    expect(listingRemovalReasonOptions("seller", "deactivate")).toEqual([
      "changed_mind",
      "sold_elsewhere",
      "paused_temporarily",
    ]);
  });

  it("satıcı reddedemez; yönetici yalnız kural ihlali seçer", () => {
    expect(listingRemovalReasonOptions("seller", "reject")).toEqual([]);
    expect(listingRemovalReasonOptions("admin", "reject")).toEqual([
      "policy_violation",
    ]);
    expect(listingRemovalReasonOptions("admin", "delete")).toEqual([
      "policy_violation",
    ]);
    expect(listingRemovalReasonOptions("admin", "deactivate")).toEqual([]);
  });
});

describe("listingRemovalIssue — doğrulama kuralı", () => {
  const seller = (action: "delete" | "deactivate") =>
    ({ actor: "seller", action }) as const;
  const admin = (action: "delete" | "reject") =>
    ({ actor: "admin", action }) as const;

  it("neden zorunlu (boşluk da boş sayılır)", () => {
    expect(listingRemovalIssue(seller("delete"), {})).toBe("reason_required");
    expect(listingRemovalIssue(seller("delete"), { reason: "   " })).toBe(
      "reason_required",
    );
    expect(listingRemovalIssue(seller("delete"), undefined)).toBe(
      "reason_required",
    );
  });

  it("geçici duraklatma yalnız pasife almada geçerli", () => {
    expect(
      listingRemovalIssue(seller("deactivate"), {
        reason: "paused_temporarily",
      }),
    ).toBeNull();
    expect(
      listingRemovalIssue(seller("delete"), { reason: "paused_temporarily" }),
    ).toBe("reason_not_allowed");
  });

  it("satıcı sistem/yönetici nedeni ya da not_given seçemez", () => {
    for (const reason of [
      "expired",
      "out_of_stock",
      "policy_violation",
      "not_given",
      "bogus",
    ]) {
      expect(listingRemovalIssue(seller("deactivate"), { reason })).toBe(
        "reason_not_allowed",
      );
    }
  });

  it("başka platformda satış platform ister; katalog dışı platform geçersiz", () => {
    expect(
      listingRemovalIssue(seller("delete"), { reason: "sold_elsewhere" }),
    ).toBe("platform_required");
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "sold_elsewhere",
        platform: "ebay",
      }),
    ).toBe("platform_invalid");
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "sold_elsewhere",
        platform: "dolap",
      }),
    ).toBeNull();
  });

  it("'diğer' platform serbest metin (hangi platform?) ister", () => {
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "sold_elsewhere",
        platform: "other",
      }),
    ).toBe("detail_required");
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "sold_elsewhere",
        platform: "other",
        detail: "Facebook Marketplace",
      }),
    ).toBeNull();
  });

  it("başka nedenle platform gönderilemez", () => {
    expect(
      listingRemovalIssue(seller("deactivate"), {
        reason: "changed_mind",
        platform: "dolap",
      }),
    ).toBe("platform_not_allowed");
  });

  it("serbest metin opsiyonel ama üst sınırı aşamaz", () => {
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "changed_mind",
        detail: "a".repeat(LISTING_REMOVAL_DETAIL_MAX_LENGTH),
      }),
    ).toBeNull();
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "changed_mind",
        detail: "a".repeat(LISTING_REMOVAL_DETAIL_MAX_LENGTH + 1),
      }),
    ).toBe("detail_too_long");
  });

  it("satıcı ihlal kodu gönderemez", () => {
    expect(
      listingRemovalIssue(seller("delete"), {
        reason: "changed_mind",
        violationCode: "prohibited_item",
      }),
    ).toBe("violation_not_allowed");
  });

  it("yönetici: kural ihlali + katalogdaki ihlal kodu zorunlu", () => {
    expect(
      listingRemovalIssue(admin("reject"), { reason: "policy_violation" }),
    ).toBe("violation_required");
    expect(
      listingRemovalIssue(admin("reject"), {
        reason: "policy_violation",
        violationCode: "not_a_code",
      }),
    ).toBe("violation_invalid");
    expect(
      listingRemovalIssue(admin("delete"), {
        reason: "policy_violation",
        violationCode: "counterfeit_replica",
      }),
    ).toBeNull();
  });

  it("yönetici 'diğer' ihlal kodunda açıklama ister", () => {
    expect(
      listingRemovalIssue(admin("delete"), {
        reason: "policy_violation",
        violationCode: "other",
      }),
    ).toBe("detail_required");
    expect(
      listingRemovalIssue(admin("delete"), {
        reason: "policy_violation",
        violationCode: "other",
        detail: "Açıklama",
      }),
    ).toBeNull();
  });

  it("yönetici satıcı nedeni seçemez", () => {
    expect(
      listingRemovalIssue(admin("delete"), { reason: "changed_mind" }),
    ).toBe("reason_not_allowed");
  });
});

describe("normalizeListingRemovalInput", () => {
  it("boşlukları kırpar, boş metni null yapar", () => {
    expect(
      normalizeListingRemovalInput({
        reason: " sold_elsewhere ",
        platform: "",
        detail: "  not  ",
      }),
    ).toEqual({
      reason: "sold_elsewhere",
      platform: null,
      violationCode: null,
      detail: "not",
    });
  });
});
