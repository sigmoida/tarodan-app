import {
  couponSurvivesCancelCategory,
  couponSurvivesFault,
} from "./coupon-restore-policy";

/**
 * "Kusursuz taraf bir şey kaybetmez" ilkesi kupon hakkına da uygulanır. Eskiden
 * kupon her iptal/iadede yanıyordu: ürünü alamayan alıcı hem parasını bekliyor
 * hem hakkını kaybediyordu.
 */
describe("kupon yanar mı, geri gelir mi", () => {
  it("alıcı kaynaklı iade hakkı yakar", () => {
    expect(couponSurvivesFault("buyer")).toBe(false);
  });

  it("satıcı, kargo ve platform kaynaklı iadede hak geri gelir", () => {
    expect(couponSurvivesFault("seller")).toBe(true);
    expect(couponSurvivesFault("carrier")).toBe(true);
    expect(couponSurvivesFault("platform")).toBe(true);
  });

  it("kusur tarafı bilinmiyorsa alıcı lehine yorumlanır", () => {
    expect(couponSurvivesFault(null)).toBe(true);
    expect(couponSurvivesFault(undefined)).toBe(true);
  });

  it("alıcının kendi iptali ve ödeme süresi aşımı hakkı yakar", () => {
    expect(couponSurvivesCancelCategory("buyer_cancelled")).toBe(false);
    expect(couponSurvivesCancelCategory("payment_timeout")).toBe(false);
  });

  it("satıcı/stok/admin kaynaklı iptalde hak geri gelir", () => {
    expect(couponSurvivesCancelCategory("seller_no_ship")).toBe(true);
    expect(couponSurvivesCancelCategory("stockout")).toBe(true);
    expect(couponSurvivesCancelCategory("trade_reserved")).toBe(true);
    expect(couponSurvivesCancelCategory("admin")).toBe(true);
    expect(couponSurvivesCancelCategory("admin_buyer_favor")).toBe(true);
  });

  it("tanınmayan kategori alıcı lehine yorumlanır", () => {
    expect(couponSurvivesCancelCategory("other")).toBe(true);
  });
});
