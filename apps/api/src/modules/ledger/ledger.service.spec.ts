import { LedgerService } from "./ledger.service";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
} from "@prisma/client";

describe("LedgerService", () => {
  const makeTx = () => ({ ledgerEntry: { createMany: jest.fn() } }) as any;

  it("dengeli grubu yazar (Σdebit == Σcredit)", async () => {
    const svc = new LedgerService({} as any);
    const tx = makeTx();
    await svc.record(tx, {
      eventType: LedgerEventType.payment_captured,
      entries: [
        {
          account: LedgerAccount.buyer_payment,
          direction: LedgerDirection.credit,
          amount: 100,
        },
        {
          account: LedgerAccount.seller_escrow,
          direction: LedgerDirection.debit,
          amount: 90,
        },
        {
          account: LedgerAccount.platform_commission,
          direction: LedgerDirection.debit,
          amount: 10,
        },
      ],
    });
    expect(tx.ledgerEntry.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    // Aynı entryGroupId ile bağlı
    expect(new Set(rows.map((r: any) => r.entryGroupId)).size).toBe(1);
  });

  it("DENGESİZ grubu REDDEDER (fırlatır, hiç yazmaz)", async () => {
    const svc = new LedgerService({} as any);
    const tx = makeTx();
    await expect(
      svc.record(tx, {
        eventType: LedgerEventType.payment_captured,
        entries: [
          {
            account: LedgerAccount.buyer_payment,
            direction: LedgerDirection.credit,
            amount: 100,
          },
          {
            account: LedgerAccount.seller_escrow,
            direction: LedgerDirection.debit,
            amount: 80,
          },
        ],
      }),
    ).rejects.toThrow(/DENGESİZ/);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("negatif/sıfır tutarı reddeder", async () => {
    const svc = new LedgerService({} as any);
    await expect(
      svc.record(makeTx(), {
        eventType: LedgerEventType.adjustment,
        entries: [
          {
            account: LedgerAccount.buyer_payment,
            direction: LedgerDirection.credit,
            amount: 0,
          },
        ],
      }),
    ).rejects.toThrow(/pozitif/);
  });

  it("recordCapture stopajı dengeler (gross = sellerNet + commission + stopaj)", async () => {
    const svc = new LedgerService({} as any);
    const tx = makeTx();
    // gross 100 = sellerNet 82 + commission 15 + stopaj 3
    await svc.recordCapture(tx, {
      orderId: "o1",
      gross: 100,
      sellerNet: 82,
      commission: 15,
      withholdingTax: 3,
    });
    const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(4);
    const byAccount = Object.fromEntries(
      rows.map((r: any) => [r.account, Number(r.amount)]),
    );
    expect(byAccount[LedgerAccount.buyer_payment]).toBe(100);
    expect(byAccount[LedgerAccount.seller_escrow]).toBe(82);
    expect(byAccount[LedgerAccount.platform_commission]).toBe(15);
    expect(byAccount[LedgerAccount.withholding_tax]).toBe(3);
  });

  it("recordCapture komisyon/stopaj 0 iken sadece buyer+escrow yazar", async () => {
    const svc = new LedgerService({} as any);
    const tx = makeTx();
    await svc.recordCapture(tx, {
      orderId: "o2",
      gross: 50,
      sellerNet: 50,
      commission: 0,
      withholdingTax: 0,
    });
    const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
  });
});
