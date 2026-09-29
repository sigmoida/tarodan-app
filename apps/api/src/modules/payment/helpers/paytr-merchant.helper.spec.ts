import { PaytrMerchant } from "@prisma/client";
import {
  isMembershipOrder,
  payerIpFromPaymentMetadata,
  resolvePaytrMerchant,
} from "./paytr-merchant.helper";

describe("resolvePaytrMerchant — the one decision for a new PayTR payment", () => {
  it("sends a membership order to the membership merchant", () => {
    expect(
      resolvePaytrMerchant({ order: { productId: "membership-tier-1" } }),
    ).toBe(PaytrMerchant.membership);
  });

  it("keeps listings, boosts, carts and trades on the marketplace merchant", () => {
    expect(resolvePaytrMerchant({ order: { productId: "prod-1" } })).toBe(
      PaytrMerchant.marketplace,
    );
    expect(resolvePaytrMerchant({ order: { productId: "boost-1" } })).toBe(
      PaytrMerchant.marketplace,
    );
    expect(resolvePaytrMerchant({ checkoutGroupId: "grp-1" })).toBe(
      PaytrMerchant.marketplace,
    );
    expect(resolvePaytrMerchant({ tradeCashPaymentId: "tcp-1" })).toBe(
      PaytrMerchant.marketplace,
    );
    expect(resolvePaytrMerchant({})).toBe(PaytrMerchant.marketplace);
  });

  it("does not let a cart or trade target be reclassified by an order hint", () => {
    expect(
      resolvePaytrMerchant({
        checkoutGroupId: "grp-1",
        order: { productId: "membership-tier-1" },
      }),
    ).toBe(PaytrMerchant.marketplace);
  });

  it("isMembershipOrder tolerates missing orders", () => {
    expect(isMembershipOrder(null)).toBe(false);
    expect(isMembershipOrder({ productId: null })).toBe(false);
  });
});

describe("payerIpFromPaymentMetadata", () => {
  it("reads the payer IP captured at initiation", () => {
    expect(payerIpFromPaymentMetadata({ payerIp: " 85.1.2.3 " })).toBe(
      "85.1.2.3",
    );
  });

  it("returns undefined when absent or not a string", () => {
    expect(payerIpFromPaymentMetadata(null)).toBeUndefined();
    expect(payerIpFromPaymentMetadata({ payerIp: 12 })).toBeUndefined();
    expect(payerIpFromPaymentMetadata({ payerIp: "" })).toBeUndefined();
  });
});
