import {
  classifyLegacyExpiry,
  type LegacyExpiryCandidate,
} from "./legacy-expiry-selection";

const DAY = 24 * 60 * 60 * 1000;
const RULE = { ttlDays: 60, graceDays: 3 };
const PUBLISHED = new Date("2026-05-01T10:00:00.000Z");

/** Yayından `days` gün sonra son yazımı yapılmış, stoklu ve sağlıklı satıcılı ilan. */
const listing = (
  days: number,
  patch: Partial<LegacyExpiryCandidate> = {},
): LegacyExpiryCandidate => ({
  publishedAt: PUBLISHED,
  createdAt: new Date(PUBLISHED.getTime() - 5 * DAY),
  updatedAt: new Date(PUBLISHED.getTime() + days * DAY),
  quantity: 3,
  seller: { isBanned: false, deletedAt: null },
  ...patch,
});

describe("classifyLegacyExpiry — eski, işaretsiz süre dolumlarının seçim kuralı", () => {
  it("ömür dolduğu gece pasife alınmış ilanı seçer", () => {
    // Gece işi ömür dolduktan sonraki ilk koşuda (ömür + <1 gün) yazar.
    expect(classifyLegacyExpiry(listing(60.2), RULE)).toBe("match");
    expect(classifyLegacyExpiry(listing(61), RULE)).toBe("match");
  });

  it("tolerans günü içinde geç kalmış koşuyu da seçer, ötesini seçmez", () => {
    expect(classifyLegacyExpiry(listing(63), RULE)).toBe("match");
    expect(classifyLegacyExpiry(listing(63.5), RULE)).toBe(
      "touched_after_expiry",
    );
  });

  it("ömür dolmadan pasife alınmış ilana (elle pasife alma) dokunmaz", () => {
    expect(classifyLegacyExpiry(listing(20), RULE)).toBe("not_at_lifetime");
    expect(classifyLegacyExpiry(listing(59), RULE)).toBe("not_at_lifetime");
  });

  it("pasife alındıktan çok sonra yazılmış ilanı seçmez (dolum anı kanıtlanamaz)", () => {
    expect(classifyLegacyExpiry(listing(120), RULE)).toBe(
      "touched_after_expiry",
    );
  });

  it("stok bitişi ayırt edilemediği için stok 0 ilanı seçmez", () => {
    expect(classifyLegacyExpiry(listing(61, { quantity: 0 }), RULE)).toBe(
      "out_of_stock",
    );
    expect(classifyLegacyExpiry(listing(61, { quantity: null }), RULE)).toBe(
      "match",
    );
  });

  it("banlı ya da silinmiş satıcının ilanına dokunmaz", () => {
    expect(
      classifyLegacyExpiry(
        listing(61, { seller: { isBanned: true, deletedAt: null } }),
        RULE,
      ),
    ).toBe("seller_unavailable");
    expect(
      classifyLegacyExpiry(
        listing(61, { seller: { isBanned: false, deletedAt: new Date() } }),
        RULE,
      ),
    ).toBe("seller_unavailable");
  });

  it("yayın anı yoksa (eski kayıt) createdAt'ten sayar", () => {
    const legacy = listing(0, {
      publishedAt: null,
      createdAt: PUBLISHED,
      updatedAt: new Date(PUBLISHED.getTime() + 61 * DAY),
    });
    expect(classifyLegacyExpiry(legacy, RULE)).toBe("match");
  });

  it("yaz/kış saati kaymasına 1 saat pay tanır", () => {
    const almost = listing(0, {
      updatedAt: new Date(PUBLISHED.getTime() + 60 * DAY - 30 * 60 * 1000),
    });
    expect(classifyLegacyExpiry(almost, RULE)).toBe("match");
  });

  it("ömür parametresi kuralı belirler (30 gün)", () => {
    expect(
      classifyLegacyExpiry(listing(31), { ttlDays: 30, graceDays: 3 }),
    ).toBe("match");
    expect(classifyLegacyExpiry(listing(31), RULE)).toBe("not_at_lifetime");
  });
});
