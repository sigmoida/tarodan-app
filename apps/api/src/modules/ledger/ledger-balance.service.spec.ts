import { LedgerBalanceService } from "./ledger-balance.service";
import { LedgerAccount, LedgerDirection } from "@prisma/client";

describe("LedgerBalanceService", () => {
  describe("deriveOrderBalances (saf türetim)", () => {
    it("capture + kısmi iade → captured/refunded/remaining/escrowNet türetir", () => {
      // capture: buyer 100 = escrow 82 + komisyon 15 + stopaj 3
      // iade 40: refund debit 40, escrow credit 33 (kalan), komisyon credit 6, stopaj credit 1
      const rows = [
        {
          account: LedgerAccount.buyer_payment,
          direction: LedgerDirection.credit,
          amount: 100,
          orderId: "o1",
        },
        {
          account: LedgerAccount.seller_escrow,
          direction: LedgerDirection.debit,
          amount: 82,
          orderId: "o1",
        },
        {
          account: LedgerAccount.platform_commission,
          direction: LedgerDirection.debit,
          amount: 15,
          orderId: "o1",
        },
        {
          account: LedgerAccount.withholding_tax,
          direction: LedgerDirection.debit,
          amount: 3,
          orderId: "o1",
        },
        {
          account: LedgerAccount.refund,
          direction: LedgerDirection.debit,
          amount: 40,
          orderId: "o1",
        },
        {
          account: LedgerAccount.seller_escrow,
          direction: LedgerDirection.credit,
          amount: 33,
          orderId: "o1",
        },
      ];
      const b = LedgerBalanceService.deriveOrderBalances(rows).get("o1")!;
      expect(b.captured).toBe(100);
      expect(b.refunded).toBe(40);
      expect(b.remainingRefundable).toBe(60);
      // escrow: +82 (debit) − 33 (credit) = 49 hâlâ askıda
      expect(b.escrowNet).toBe(49);
    });

    it("orderId'siz satırları (takas capture) atlar", () => {
      const rows = [
        {
          account: LedgerAccount.buyer_payment,
          direction: LedgerDirection.credit,
          amount: 90,
          orderId: null,
          tradeId: "t1",
        } as any,
      ];
      expect(LedgerBalanceService.deriveOrderBalances(rows).size).toBe(0);
    });

    it("birden çok siparişi ayrı ayrı toplar", () => {
      const rows = [
        {
          account: LedgerAccount.buyer_payment,
          direction: LedgerDirection.credit,
          amount: 100,
          orderId: "o1",
        },
        {
          account: LedgerAccount.buyer_payment,
          direction: LedgerDirection.credit,
          amount: 250,
          orderId: "o2",
        },
        {
          account: LedgerAccount.refund,
          direction: LedgerDirection.debit,
          amount: 250,
          orderId: "o2",
        },
      ];
      const m = LedgerBalanceService.deriveOrderBalances(rows);
      expect(m.get("o1")!.remainingRefundable).toBe(100);
      expect(m.get("o2")!.remainingRefundable).toBe(0);
    });
  });

  describe("orderRemainingRefundable (DB-backed)", () => {
    it("captured − refunded döndürür", async () => {
      const prisma = {
        ledgerEntry: {
          findMany: jest.fn().mockResolvedValue([
            {
              account: LedgerAccount.buyer_payment,
              direction: LedgerDirection.credit,
              amount: 100,
              orderId: "o1",
            },
            {
              account: LedgerAccount.refund,
              direction: LedgerDirection.debit,
              amount: 30,
              orderId: "o1",
            },
          ]),
        },
      } as any;
      const svc = new LedgerBalanceService(prisma);
      expect(await svc.orderRemainingRefundable("o1")).toBe(70);
    });

    it("kayıt yoksa sıfır", async () => {
      const prisma = {
        ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;
      const svc = new LedgerBalanceService(prisma);
      expect(await svc.orderRemainingRefundable("nope")).toBe(0);
    });
  });

  describe("sellerEscrowBalance", () => {
    it("signed escrow bakiyesi (debit − credit)", async () => {
      const prisma = {
        ledgerEntry: {
          groupBy: jest.fn().mockResolvedValue([
            { direction: LedgerDirection.debit, _sum: { amount: 200 } },
            { direction: LedgerDirection.credit, _sum: { amount: 120 } },
          ]),
        },
      } as any;
      const svc = new LedgerBalanceService(prisma);
      expect(await svc.sellerEscrowBalance("s1")).toBe(80);
    });
  });
});
