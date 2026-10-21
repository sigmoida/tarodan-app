import {
  SELLER_TRUST_FORMULA_VERSION,
  type SellerTrustView,
} from "@tarodan/types";
import { legacyTrustFields } from "./legacy-trust";
import { toSellerTrustView } from "./trust-view";

/**
 * Legacy `trustScore`/`trustLevel` for live mobile 1.0.5 (plan section 7,
 * decision D7): `round(rating × 20)` and the old Turkish label of the level.
 */
describe("legacyTrustFields", () => {
  const view = (scoreX100: number | null): SellerTrustView =>
    toSellerTrustView({
      scoreX100,
      formulaVersion: SELLER_TRUST_FORMULA_VERSION,
    });

  it.each([
    [374, 75, "Orta"],
    [437, 87, "Güvenilir"],
    [485, 97, "Çok Güvenilir"],
    [450, 90, "Çok Güvenilir"],
    [449, 90, "Güvenilir"],
    [400, 80, "Güvenilir"],
    [399, 80, "Orta"],
    [300, 60, "Orta"],
    [299, 60, "Gelişmekte"],
    [291, 58, "Gelişmekte"],
    [0, 0, "Gelişmekte"],
    [500, 100, "Çok Güvenilir"],
  ])("score_x100 %i gives %i / %s", (x100, score, label) => {
    expect(legacyTrustFields(view(x100))).toEqual({
      trustScore: score,
      trustLevel: label,
    });
  });

  it("rounds every hundredth like score_x100 / 5 (no float edge)", () => {
    for (let x100 = 0; x100 <= 500; x100++) {
      expect(legacyTrustFields(view(x100)).trustScore).toBe(
        Math.round(x100 / 5),
      );
    }
  });

  it("is null for a seller without a score; `Yeni` is never sent", () => {
    expect(legacyTrustFields(view(null))).toEqual({
      trustScore: null,
      trustLevel: null,
    });
    expect(legacyTrustFields(toSellerTrustView(null))).toEqual({
      trustScore: null,
      trustLevel: null,
    });
  });

  it("is null when the view is gated", () => {
    expect(legacyTrustFields(null)).toEqual({
      trustScore: null,
      trustLevel: null,
    });
  });
});
