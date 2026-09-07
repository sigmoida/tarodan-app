import { assembleRevenueSplit, splitGrossByVat } from "./revenue-split.helper";

/**
 * S1 kimliği sabit bir fixture ile kapatılır:
 *  A direkt: subtotal 1000, bShip 50, sShip 30, bFee 50, sFee 100, bST 20, sST 26, wh 10
 *     → total 1120, hold 834
 *  Sepet (tek ödeme 281,20): B subtotal 200, bShip 40, bFee 10, sFee 20, bST 10, sST 4
 *     → 260, hold 176; C (kargo açığı) subtotal 20, sShip 60, bFee 1, sFee 2, bST .2,
 *     sST 12.4 → 21,20, hold 0, açık 54,40
 *  D platform kuponlu: subtotal 90, pfd 10, bFee 5, sFee 10, bST 1, sST 2 → 96, hold 88
 *  Takas: amount 300, tradeFee 120 (net 100 / KDV 20), kargo 80 → 500
 *  MEM 240 (200/40), BST 120 (100/20), üyelik yenilemesi 240 (200/40)
 *  Tahsilat 2597,20 = 1098 + 300 + 788 + 195,60 + 260 + 10 − 54,40
 */
const physical = {
  orderCount: 4,
  paymentCount: 3,
  total: 1120 + 260 + 21.2 + 96,
  sellerShare: 834 + 176 + 0 + 88,
  // commission − pfd: (150) + (30) + (3) + (15 − 10)
  platformFees: 150 + 30 + 3 + 5,
  serviceVat: 46 + 14 + 12.6 + 3,
  shipping: 80 + 40 + 60 + 0,
  withholding: 10,
  shippingDeficit: 54.4,
  productTax: 0,
  ordersWithoutHold: 0,
  commissionTotal: 150 + 30 + 3 + 15,
};
const trade = {
  count: 1,
  total: 500,
  counterpart: 300,
  tradeFeeGross: 120,
  legacyCommission: 0,
  legacyCommissionTax: 0,
  shipping: 80,
};
const inputs = {
  collectedTotal: physical.total + 500 + 240 + 120 + 240,
  collectedCount: 3 + 1 + 2 + 1,
  physical,
  trade,
  virtualOrders: { count: 2, gross: 360 },
  membershipRenewals: { count: 1, gross: 240 },
  commissionLedgerTotal: 198,
};
const rates = { serviceVatRate: 20, standardVatRate: 20 };

describe("splitGrossByVat", () => {
  it("splits a gross amount into net and VAT, all net at rate 0", () => {
    expect(splitGrossByVat(120, 20)).toEqual({ net: 100, vat: 20 });
    expect(splitGrossByVat(120, 0)).toEqual({ net: 120, vat: 0 });
  });
});

describe("assembleRevenueSplit", () => {
  it("closes the identity: collected = seller share + trade counterpart + fees + VAT + shipping + withholding − deficit", () => {
    const { section, platformFeesNet, diagnostics } = assembleRevenueSplit(
      inputs,
      rates,
    );

    expect(section.total.amount).toBe(2597.2);
    const byKey = Object.fromEntries(
      section.components.map((c) => [c.key, c.amount]),
    );
    expect(byKey).toEqual({
      sellerShare: 1098,
      tradeCounterpart: 300,
      platformFeesNet: 788,
      serviceVat: 195.6,
      shipping: 260,
      withholding: 10,
      shippingDeficit: -54.4,
    });
    expect(platformFeesNet).toBe(788);
    expect(section.difference).toBe(0);
    expect(section.balanced).toBe(true);
    expect(diagnostics).toEqual({
      paymentsWithoutOrders: 0,
      ordersWithoutHold: 0,
      productTaxTotal: 0,
      commissionLedgerDrift: 0,
    });
  });

  it("surfaces a missing hold as a red difference and a diagnostic count", () => {
    const { section, diagnostics } = assembleRevenueSplit(
      {
        ...inputs,
        physical: {
          ...physical,
          sellerShare: physical.sellerShare - 834,
          ordersWithoutHold: 1,
        },
      },
      rates,
    );

    expect(section.difference).toBe(834);
    expect(section.balanced).toBe(false);
    expect(diagnostics.ordersWithoutHold).toBe(1);
  });

  it("treats everything as net when VAT is off and flags ledger drift", () => {
    const { section, platformFeesNet, diagnostics } = assembleRevenueSplit(
      { ...inputs, commissionLedgerTotal: 190 },
      { serviceVatRate: 0, standardVatRate: 0 },
    );

    // Takas ücreti 120 ve sanal/üyelik 600'ün tamamı gelir; KDV yalnız sipariş KDV'si.
    expect(platformFeesNet).toBe(188 + 120 + 360 + 240);
    const byKey = Object.fromEntries(
      section.components.map((c) => [c.key, c.amount]),
    );
    expect(byKey.serviceVat).toBe(75.6);
    expect(section.difference).toBe(0);
    expect(diagnostics.commissionLedgerDrift).toBe(8);
  });

  it("counts payments that map to no order, trade or virtual record", () => {
    const { diagnostics } = assembleRevenueSplit(
      { ...inputs, collectedCount: inputs.collectedCount + 2 },
      rates,
    );
    expect(diagnostics.paymentsWithoutOrders).toBe(2);
  });
});
