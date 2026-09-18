import { SubscriptionStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { membershipPastDueData } from "./membership-past-due";

describe("membershipPastDueData", () => {
  it("stamps the moment the membership fell past due", () => {
    const at = new Date("2026-07-01T08:00:00.000Z");
    expect(membershipPastDueData(at)).toEqual({
      status: SubscriptionStatus.past_due,
      pastDueAt: at,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    expect(membershipPastDueData().pastDueAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });

  /**
   * Bugün SIFIR yazan yol var — dayanıklı ödeme niyetleri `past_due` geçişinin
   * yerini aldı ve mevcut satırlar eski kayıtlardan geliyor. Bu spec o yüzden
   * bir REGRESYON testi değil, bir KAPI: geçişi geri getiren ilk kod yolu
   * damgasız yazarsa burada patlar, üretimde sessizce ölçüm kaybetmez.
   */
  it("is the ONLY way a membership is written to past_due", () => {
    expect(
      unstampedTransitions({
        delegate: "userMembership",
        statuses: ["past_due"],
        enumName: "SubscriptionStatus",
        helpers: ["membershipPastDueData"],
      }),
    ).toEqual([]);
  });
});
