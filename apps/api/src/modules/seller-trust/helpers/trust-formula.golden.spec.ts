import { sellerTrustLevel, SELLER_TRUST_COMPONENTS_V1 } from "@tarodan/types";
import { explainSellerTrust } from "./trust-explain";
import { computeSellerTrust } from "./trust-formula";
import { SELLER_TRUST_GOLDEN_V1 } from "./trust-golden-v1";

/**
 * The approved golden scenarios of formula v1 (AC-F2; tarodan-ops plan
 * 2026-11-03-seller-trust-score-lab, section 4.5, decision D7). A failure
 * here is a formula change, not a stale fixture: never edit the fixture to
 * make it pass.
 */
describe("formula v1 golden scenarios", () => {
  it("are the 10 approved rows, in order, with unique keys", () => {
    expect(SELLER_TRUST_GOLDEN_V1.map((g) => g.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(new Set(SELLER_TRUST_GOLDEN_V1.map((g) => g.key)).size).toBe(10);
  });

  it.each(SELLER_TRUST_GOLDEN_V1)(
    "#$id $name scores $scoreX100 ($level)",
    (g) => {
      const result = computeSellerTrust(g.inputs);
      expect(result.scoreX100).toBe(g.scoreX100);
      expect(sellerTrustLevel(result.scoreX100)).toBe(g.level);
      if (g.subScores) {
        expect(
          SELLER_TRUST_COMPONENTS_V1.map(
            (key) => result.components[key].subScore,
          ),
        ).toEqual(g.subScores.map((s) => expect.closeTo(s, 4)));
      }
    },
  );

  it.each(SELLER_TRUST_GOLDEN_V1)(
    "#$id $name: the explanation shows the same result",
    (g) => {
      const e = explainSellerTrust(g.inputs);
      expect(e.scoreX100).toBe(g.scoreX100);
      expect(e.level).toBe(g.level);
    },
  );
});
