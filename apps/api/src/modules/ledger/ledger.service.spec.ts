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

  /**
   * İDEMPOTENCY: aynı iş olayı iki kez işlenirse (outbox backstop, callback tekrarı,
   * cron retry) defter ÇİFT grup yazmamalı. Koruma DB'de: (idempotency_key, line_no)
   * UNIQUE — ikinci yazım P2002 ile düşer. Satırlar tek `createMany` ile yazıldığı
   * için grup ya tamamen yazılır ya hiç (yarım grup imkânsız).
   */
  describe("idempotency", () => {
    it("her satıra anahtarı ve sıra numarasını damgalar", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.record(tx, {
        eventType: LedgerEventType.adjustment,
        idempotencyKey: "adjustment:payout:p1",
        entries: [
          {
            account: LedgerAccount.seller_debt_recovery,
            direction: LedgerDirection.debit,
            amount: 30,
          },
          {
            account: LedgerAccount.seller_escrow,
            direction: LedgerDirection.credit,
            amount: 30,
          },
        ],
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      expect(rows.map((r: any) => r.idempotencyKey)).toEqual([
        "adjustment:payout:p1",
        "adjustment:payout:p1",
      ]);
      // line_no grup içinde benzersiz → unique index hesap/yön varsayımı YAPMAZ
      expect(rows.map((r: any) => r.lineNo)).toEqual([0, 1]);
    });

    it("anahtar verilmezse null damgalar (eski çağrılar yazılmaya devam eder)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.record(tx, {
        eventType: LedgerEventType.adjustment,
        entries: [
          {
            account: LedgerAccount.seller_debt_recovery,
            direction: LedgerDirection.debit,
            amount: 5,
          },
          {
            account: LedgerAccount.seller_escrow,
            direction: LedgerDirection.credit,
            amount: 5,
          },
        ],
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      expect(rows.every((r: any) => r.idempotencyKey === null)).toBe(true);
    });

    it("recordCapture anahtarı siparişten türetir (sipariş başına TEK capture)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.recordCapture(tx, {
        orderId: "order-1",
        paymentId: "payment-1",
        gross: 100,
        sellerNet: 90,
        commission: 10,
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0].idempotencyKey).toBe("capture:order:order-1");
    });

    it("recordTradeCashCapture anahtarı takas nakit ödemesinden türetir", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.recordTradeCashCapture(tx, {
        tradeId: "t1",
        tradeCashPaymentId: "tcp-1",
        totalAmount: 90,
        netAmount: 78,
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0].idempotencyKey).toBe("capture:trade-cash:tcp-1");
    });

    it("recordRefund anahtarı iade denemesinden türetir (deneme başına TEK ters kayıt)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.recordRefund(tx, {
        orderId: "order-1",
        refundAttemptId: "attempt-1",
        orderTotal: 100,
        commission: 15,
        withholdingTax: 3,
        refundAmount: 100,
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0].idempotencyKey).toBe("refund:attempt:attempt-1");
    });
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

  describe("recordRefund", () => {
    it("tam iade: refund debit = Σ ters kredi (escrow+komisyon+stopaj), DENGELİ", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // T=100 (C=15, W=3, sellerNet=82), tam iade R=100
      await svc.recordRefund(tx, {
        orderId: "o1",
        orderTotal: 100,
        commission: 15,
        withholdingTax: 3,
        refundAmount: 100,
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      const byAcc = Object.fromEntries(
        rows.map((r: any) => [r.account, [r.direction, Number(r.amount)]]),
      );
      expect(byAcc[LedgerAccount.refund]).toEqual([LedgerDirection.debit, 100]);
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.credit,
        15,
      ]);
      expect(byAcc[LedgerAccount.withholding_tax]).toEqual([
        LedgerDirection.credit,
        3,
      ]);
      // seller_escrow kalanı emer: 100 − 15 − 3 = 82
      expect(byAcc[LedgerAccount.seller_escrow]).toEqual([
        LedgerDirection.credit,
        82,
      ]);
    });

    it("kısmi iade (yarısı): oransal + seller_escrow kalanı emer → yuvarlama drift'siz DENGELİ", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // T=100.01 (C=15.01, W=0), R=50 → ratio~0.4999; komisyon round(15.01*0.4999)=7.50,
      // sellerPortion = 50 − 7.50 = 42.50 (drift emildi)
      await svc.recordRefund(tx, {
        orderId: "o1",
        orderTotal: 100.01,
        commission: 15.01,
        withholdingTax: 0,
        refundAmount: 50,
      });
      const rows = tx.ledgerEntry.createMany.mock.calls[0][0].data;
      const debit = rows
        .filter((r: any) => r.direction === LedgerDirection.debit)
        .reduce((s: number, r: any) => s + Number(r.amount), 0);
      const credit = rows
        .filter((r: any) => r.direction === LedgerDirection.credit)
        .reduce((s: number, r: any) => s + Number(r.amount), 0);
      expect(debit).toBeCloseTo(credit, 2); // dengeli (record() de zorlardı)
      expect(debit).toBe(50);
    });

    it("tutar 0 / dejenere split → null (kayıt yok)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      expect(
        await svc.recordRefund(tx, {
          orderTotal: 0,
          commission: 0,
          withholdingTax: 0,
          refundAmount: 10,
        }),
      ).toBeNull();
      expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
    });
  });

  describe("recordTradeCashCapture", () => {
    const byAccount = (tx: any) =>
      Object.fromEntries(
        tx.ledgerEntry.createMany.mock.calls[0][0].data.map((r: any) => [
          r.account,
          [r.direction, Number(r.amount)],
        ]),
      );
    /** Grup dengesi: debit toplamı = credit toplamı (reconcile invaryantı #1). */
    const signedNet = (tx: any) =>
      tx.ledgerEntry.createMany.mock.calls[0][0].data.reduce(
        (sum: number, r: any) =>
          sum +
          (r.direction === LedgerDirection.debit
            ? Number(r.amount)
            : -Number(r.amount)),
        0,
      );

    it("v1 takas komisyonu KDV'siyle birlikte platform_commission'a düşer (grup DENGELİ)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // v1: total 100.4 = fark 78 + komisyon 12 + komisyon KDV 2.4. Eski kod yalnız
      // komisyonu yazıyor, KDV'yi düşürüyordu → grup KDV kadar dengesizdi.
      await svc.recordTradeCashCapture(tx, {
        tradeId: "t1",
        payerId: "payer-1",
        recipientId: "rcp-1",
        totalAmount: 92.4,
        netAmount: 78,
      });
      const byAcc = byAccount(tx);
      expect(byAcc[LedgerAccount.buyer_payment]).toEqual([
        LedgerDirection.credit,
        92.4,
      ]);
      expect(byAcc[LedgerAccount.seller_escrow]).toEqual([
        LedgerDirection.debit,
        78,
      ]);
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.debit,
        14.4,
      ]);
      expect(signedNet(tx)).toBeCloseTo(0, 2);
      expect(tx.ledgerEntry.createMany.mock.calls[0][0].data[0].tradeId).toBe(
        "t1",
      );
    });

    it("v2: hizmet bedeli gelire, kargo shipping_income'a, fark escrow'a gider", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // taraf 295 öder = 200 fark + 35 hizmet bedeli + 60 kargo (2 bacak)
      await svc.recordTradeCashCapture(tx, {
        tradeId: "t1",
        payerId: "payer-1",
        recipientId: "rcp-1",
        totalAmount: 295,
        netAmount: 200,
        shipping: 60,
      });
      const byAcc = byAccount(tx);
      expect(byAcc[LedgerAccount.seller_escrow]).toEqual([
        LedgerDirection.debit,
        200,
      ]);
      expect(byAcc[LedgerAccount.shipping_income]).toEqual([
        LedgerDirection.debit,
        60,
      ]);
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.debit,
        35,
      ]);
      expect(signedNet(tx)).toBeCloseTo(0, 2);
    });

    it("v2: farkı olmayan taraf da deftere yazılır (ücret + kargo gerçek para)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // Eski koşul netAmount > 0 arıyordu: fark ödemeyen tarafın 95 TL'si hiç
      // deftere girmiyordu — tahsilat defterde görünmeyen para olurdu.
      const group = await svc.recordTradeCashCapture(tx, {
        tradeId: "t1",
        payerId: "payer-2",
        recipientId: null,
        totalAmount: 95,
        netAmount: 0,
        shipping: 60,
      });
      expect(group).not.toBeNull();
      const byAcc = byAccount(tx);
      expect(byAcc[LedgerAccount.seller_escrow]).toBeUndefined();
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.debit,
        35,
      ]);
      expect(signedNet(tx)).toBeCloseTo(0, 2);
    });

    it("tahsilat yoksa (total <= 0) kayıt yazmaz", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      expect(
        await svc.recordTradeCashCapture(tx, { totalAmount: 0, netAmount: 0 }),
      ).toBeNull();
      expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
    });

    it("iade kargoya verilmeden yapıldıysa üç kalemi de geri alır", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      await svc.recordTradeCashRefund(tx, {
        tradeId: "t1",
        refundAttemptId: "att-1",
        refundAmount: 295,
        escrowReversal: 200,
        shippingReversal: 60,
      });
      const byAcc = byAccount(tx);
      expect(byAcc[LedgerAccount.refund]).toEqual([LedgerDirection.debit, 295]);
      expect(byAcc[LedgerAccount.seller_escrow]).toEqual([
        LedgerDirection.credit,
        200,
      ]);
      expect(byAcc[LedgerAccount.shipping_income]).toEqual([
        LedgerDirection.credit,
        60,
      ]);
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.credit,
        35,
      ]);
      expect(signedNet(tx)).toBeCloseTo(0, 2);
    });

    it("kargoya verildikten sonraki iadede kargo hesabı AÇIK kalır", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // 295'in 60'ı kargoya gitti → yalnız 235 iade edilir, shipping_income ters
      // kayıt ALMAZ (para gerçekten taşıyıcıya ödendi).
      await svc.recordTradeCashRefund(tx, {
        tradeId: "t1",
        refundAttemptId: "att-2",
        refundAmount: 235,
        escrowReversal: 200,
        shippingReversal: 0,
      });
      const byAcc = byAccount(tx);
      expect(byAcc[LedgerAccount.shipping_income]).toBeUndefined();
      expect(byAcc[LedgerAccount.platform_commission]).toEqual([
        LedgerDirection.credit,
        35,
      ]);
      expect(signedNet(tx)).toBeCloseTo(0, 2);
      expect(
        tx.ledgerEntry.createMany.mock.calls[0][0].data[0].idempotencyKey,
      ).toBe("refund:trade-cash:att-2");
    });

    it("kalemler toplamı tahsilatı AŞIYORSA hiç yazmaz (dengesiz grup basmaz)", async () => {
      const svc = new LedgerService({} as any);
      const tx = makeTx();
      // Bozuk veri: fark + kargo, tahsil edilenden büyük. Dengesiz bir grup basmak
      // yerine hiç yazmamak doğrudur — reconcile alarmı gürültüye boğulmaz.
      expect(
        await svc.recordTradeCashCapture(tx, {
          totalAmount: 100,
          netAmount: 90,
          shipping: 60,
        }),
      ).toBeNull();
      expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
    });
  });
});
