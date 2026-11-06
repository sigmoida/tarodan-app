import { describe, expect, it } from "vitest";
import type { AdminPaymentInstallment } from "@tarodan/types";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import { installmentCardLabel, paymentInstallmentKind } from "./installment";

const t = fakeT as unknown as Translate;
const PAID = "2026-11-01T10:05:00.000Z";

const block = (
  over: Partial<AdminPaymentInstallment> = {},
): AdminPaymentInstallment => ({
  installmentCount: 1,
  goodsAmount: 1000,
  installmentFeeAmount: 0,
  chargedAmount: 1000,
  pricing: null,
  chargeAttempts: [],
  ...over,
});

const pricing = {
  merchantOid: "OID",
  buyerSegment: "free" as const,
  rule: null,
  platformSharePct: 0,
  platformCostAmount: 0,
  cardFamily: null,
  cardBank: null,
  cardType: null,
  businessCard: null,
};

describe("paymentInstallmentKind", () => {
  it("reads more than one count as an installment payment, priced or not", () => {
    expect(paymentInstallmentKind(block({ installmentCount: 3 }), PAID)).toBe(
      "installment",
    );
    expect(
      paymentInstallmentKind(block({ installmentCount: 3, pricing }), PAID),
    ).toBe("installment");
  });

  it("reads a paid single payment (captured or legacy) as single", () => {
    expect(paymentInstallmentKind(block({ pricing }), PAID)).toBe("single");
    expect(paymentInstallmentKind(block(), PAID)).toBe("single");
  });

  it("reads an unpaid payment without a captured attempt as not captured", () => {
    expect(paymentInstallmentKind(block(), null)).toBe("notCaptured");
    expect(paymentInstallmentKind(block(), undefined)).toBe("notCaptured");
  });
});

describe("installmentCardLabel", () => {
  it("joins what is known and is null when nothing is", () => {
    expect(installmentCardLabel(t, pricing)).toBeNull();
    expect(
      installmentCardLabel(t, {
        ...pricing,
        cardFamily: "bonus",
        cardType: "debit",
        businessCard: true,
      }),
    ).toBe(
      "bonus · admin.finance.payments.installment.cardTypes.debit · admin.finance.payments.installment.businessCard",
    );
  });
});
