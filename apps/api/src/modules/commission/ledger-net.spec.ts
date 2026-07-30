import { ledgerNetRevenue } from "./ledger-net";

/**
 * Platform NET gelirinin TEK formülü: (satıcı komisyonu − iade edileni) +
 * (alıcı ücreti − iade edileni). Stopaj satıcının vergi/payout akışına aittir,
 * platform geliri değildir — formüle girmez.
 *
 * Aynı formül dashboard metriklerinde ve finans özetinde kullanılır; iki yerde
 * elle yazılıp sessizce ayrışmasın diye tek yardımcıya indirildi.
 */
describe("ledgerNetRevenue", () => {
  it("net = (komisyon − iade) + (alıcı ücreti − iade)", () => {
    expect(
      ledgerNetRevenue({
        sellerCommission: 100,
        refundedSellerCommission: 20,
        buyerFee: 30,
        refundedBuyerFee: 10,
      }),
    ).toBe(100);
  });

  it("null/undefined alanlar 0 sayılır (Prisma _sum boş dönebilir)", () => {
    expect(
      ledgerNetRevenue({
        sellerCommission: null,
        refundedSellerCommission: null,
        buyerFee: undefined,
        refundedBuyerFee: undefined,
      }),
    ).toBe(0);
  });

  it("Prisma Decimal benzeri değerleri sayıya çevirir", () => {
    expect(
      ledgerNetRevenue({
        sellerCommission: { toString: () => "50.25" } as never,
        refundedSellerCommission: 0,
        buyerFee: "10.75" as never,
        refundedBuyerFee: 0,
      }),
    ).toBe(61);
  });
});
