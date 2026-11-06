import { LedgerAccount, LedgerDirection, Prisma } from "@prisma/client";
import { LedgerService } from "../../ledger/ledger.service";
import { escrowHoldAmountOf } from "../helpers/escrow-hold-amount";
import { orderChargedTotalOf } from "../helpers/charged-amount";
import { INSTALLMENT_FEE_VAT_RATE_PCT } from "./installment-config";
import {
  allocateInstallmentFee,
  priceInstallment,
} from "./installment-pricing";

/**
 * Seller net invariance (ADR 0019 decision 3, plan 4.6.4 and 6.1): the same
 * order pays the seller exactly the same whether the buyer paid in one, in
 * 3 installments under the default rule (the buyer pays F), or in 3
 * installments under a 100 % platform share (F = 0, the platform bears P).
 * The escrow hold, the ledger's seller escrow line and the commission derive
 * from the order (goods scale) and never read the installment fee.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// One order of plan 4.4's 1,000.00 TL cart with a commission and stopaj.
const ORDER = {
  totalAmount: D("1000.00"),
  commissionAmount: D("100.00"),
  withholdingTaxAmount: D("8.50"),
  buyerServiceTaxAmount: D("0"),
  sellerServiceTaxAmount: D("0"),
  buyerShippingAmount: D("0"),
  sellerShippingAmount: D("0"),
  shippingCost: D("0"),
  platformFundedDiscount: D("0"),
};

const RATES = { singleRatePct: D("3"), installmentRatePct: D("8") };

function paidAs(count: number, platformSharePct: number) {
  const price = priceInstallment({
    baseAmount: ORDER.totalAmount,
    count,
    ...RATES,
    platformSharePct: D(platformSharePct),
    feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
  });
  const [feeShare] = allocateInstallmentFee(price.feeAmount, [
    ORDER.totalAmount,
  ]);
  return { price, order: { ...ORDER, installmentFeeAmount: feeShare } };
}

async function captureLines(order: ReturnType<typeof paidAs>["order"]) {
  const createMany = jest.fn();
  const gross = Number(order.totalAmount);
  const commission = Number(order.commissionAmount);
  const withholdingTax = Number(order.withholdingTaxAmount);
  await new LedgerService({} as never).recordCapture(
    { ledgerEntry: { createMany } } as never,
    {
      orderId: "o1",
      gross,
      sellerNet: Number((gross - commission - withholdingTax).toFixed(2)),
      commission,
      withholdingTax,
      installmentFee: Number(order.installmentFeeAmount),
    },
  );
  const rows = createMany.mock.calls[0][0].data as Array<{
    account: LedgerAccount;
    direction: LedgerDirection;
    amount: Prisma.Decimal;
  }>;
  const amountOf = (account: LedgerAccount) =>
    rows.find((r) => r.account === account)?.amount.toFixed(2) ?? "0.00";
  return {
    sellerEscrow: amountOf(LedgerAccount.seller_escrow),
    commission: amountOf(LedgerAccount.platform_commission),
    buyerPayment: amountOf(LedgerAccount.buyer_payment),
    installmentFee: amountOf(LedgerAccount.installment_fee),
  };
}

describe("seller net is the same for single, default installments and a 100% share", () => {
  const single = paidAs(1, 0);
  const defaultRule = paidAs(3, 0);
  const fullShare = paidAs(3, 100);

  it("prices the three cases as plan 4.4 says", () => {
    expect(single.price.chargedAmount.toFixed(2)).toBe("1000.00");
    expect(defaultRule.price.chargedAmount.toFixed(2)).toBe("1066.38");
    expect(defaultRule.price.feeAmount.toFixed(2)).toBe("66.38");
    expect(fullShare.price.chargedAmount.toFixed(2)).toBe("1000.00");
    expect(fullShare.price.platformCostAmount.toFixed(2)).toBe("50.00");
  });

  it("holds the same escrow amount for the seller", () => {
    const holds = [single, defaultRule, fullShare].map(
      ({ order }) => escrowHoldAmountOf(order).sellerAmount,
    );
    expect(holds).toEqual([891.5, 891.5, 891.5]);
  });

  it("books the same seller escrow and commission at capture; only the buyer side carries F", async () => {
    const [a, b, c] = await Promise.all(
      [single, defaultRule, fullShare].map(({ order }) => captureLines(order)),
    );
    expect([a.sellerEscrow, b.sellerEscrow, c.sellerEscrow]).toEqual([
      "891.50",
      "891.50",
      "891.50",
    ]);
    expect([a.commission, b.commission, c.commission]).toEqual([
      "100.00",
      "100.00",
      "100.00",
    ]);
    expect([a.buyerPayment, b.buyerPayment, c.buyerPayment]).toEqual([
      "1000.00",
      "1066.38",
      "1000.00",
    ]);
    expect([a.installmentFee, b.installmentFee, c.installmentFee]).toEqual([
      "0.00",
      "66.38",
      "0.00",
    ]);
  });

  it("charges the order slice C_o = T_o + F_o on the PSP scale only", () => {
    expect(orderChargedTotalOf(defaultRule.order).toFixed(2)).toBe("1066.38");
    expect(orderChargedTotalOf(fullShare.order).toFixed(2)).toBe("1000.00");
  });
});
