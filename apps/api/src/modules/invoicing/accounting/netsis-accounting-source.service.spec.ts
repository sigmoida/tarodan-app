import { Prisma } from "@prisma/client";
import { NetsisAccountingSourceService } from "./netsis-accounting-source.service";

const D = (value: string | number) => new Prisma.Decimal(value);

describe("NetsisAccountingSourceService", () => {
  const build = (rows: {
    invoice?: Record<string, unknown> | null;
    settlement?: Record<string, unknown> | null;
    payout?: Record<string, unknown> | null;
    refund?: Record<string, unknown> | null;
    user?: Record<string, unknown> | null;
  }) => {
    const prisma = {
      fiscalInvoice: { findUnique: jest.fn().mockResolvedValue(rows.invoice ?? null) },
      paytrSettlement: {
        findUnique: jest.fn().mockResolvedValue(rows.settlement ?? null),
      },
      payoutTransfer: { findUnique: jest.fn().mockResolvedValue(rows.payout ?? null) },
      refundAttempt: { findUnique: jest.fn().mockResolvedValue(rows.refund ?? null) },
      user: { findUnique: jest.fn().mockResolvedValue(rows.user ?? null) },
    };
    return {
      service: new NetsisAccountingSourceService(prisma as never),
      prisma,
    };
  };

  describe("invoice_collection", () => {
    const sent = {
      provider: "netsis",
      type: "seller_commission",
      status: "sent",
      invoiceNumber: "EAR2026000000007",
      providerRef: "ftSFat:EAR2026000000007",
      issuedAt: new Date("2026-10-05T10:00:00Z"),
      sentAt: new Date("2026-10-05T10:01:00Z"),
      createdAt: new Date("2026-10-05T09:00:00Z"),
      total: D("120.00"),
    };

    it("gönderilmiş Netsis faturası hazırdır", async () => {
      const { service } = build({ invoice: sent });
      await expect(service.load("invoice_collection", "inv-1")).resolves.toEqual({
        state: "ready",
        source: {
          kind: "invoice_collection",
          invoiceNumber: "EAR2026000000007",
          providerRef: "ftSFat:EAR2026000000007",
          issuedAt: sent.issuedAt,
          gross: sent.total,
        },
      });
    });

    it.each([
      ["eLogo faturası", { provider: "elogo" }],
      ["iade faturası", { type: "return_invoice" }],
      ["henüz gönderilmemiş", { status: "pending" }],
      ["numarasız", { invoiceNumber: null }],
    ])("%s: satır açılmaz (absent)", async (_label, override) => {
      const { service } = build({ invoice: { ...sent, ...override } });
      const load = await service.load("invoice_collection", "inv-1");
      expect(load.state).toBe("absent");
    });
  });

  describe("settlement_transfer", () => {
    const realized = {
      isProjection: false,
      paytrMerchant: "marketplace",
      datePaid: new Date("2026-10-01T00:00:00Z"),
      salesTotal: D(1000),
      returnTotal: D(100),
      netTotal: D("873.45"),
    };

    it("gerçekleşmiş hakediş hazırdır; projeksiyon absent; net ≤ 0 skipped", async () => {
      await expect(
        build({ settlement: realized }).service.load("settlement_transfer", "s-1"),
      ).resolves.toMatchObject({
        state: "ready",
        source: { kind: "settlement_transfer", merchant: "marketplace" },
      });
      await expect(
        build({ settlement: { ...realized, isProjection: true } }).service.load(
          "settlement_transfer",
          "s-1",
        ),
      ).resolves.toMatchObject({ state: "absent" });
      await expect(
        build({ settlement: { ...realized, netTotal: D(0) } }).service.load(
          "settlement_transfer",
          "s-1",
        ),
      ).resolves.toMatchObject({ state: "not_applicable" });
    });
  });

  describe("payout_transfer", () => {
    const completed = {
      status: "completed",
      netAmount: D("900.00"),
      submittedAmount: D("845.10"),
      processedAt: new Date("2026-10-05T10:00:00Z"),
      updatedAt: new Date("2026-10-05T10:00:00Z"),
      providerReference: "PTR-1",
      transId: "TRN-1",
      transferIban: "TR12 0006 4000 0011 2345 6789 01",
      transferName: "Ayşe Yılmaz",
      seller: {
        displayName: "ayse",
        companyName: null,
        taxId: "12345678901",
        adminCode: "B010001",
        isTestAccount: false,
      },
    };

    it("gerçekten gönderilen tutar, PayTR referansı, IBAN son 4 ve hesap sahibi", async () => {
      const { service } = build({ payout: completed });
      await expect(service.load("payout_transfer", "p-1")).resolves.toEqual({
        state: "ready",
        source: {
          kind: "payout_transfer",
          reference: "PTR-1",
          amount: completed.submittedAmount,
          completedAt: completed.processedAt,
          seller: {
            name: "Ayşe Yılmaz",
            taxId: "12345678901",
            adminCode: "B010001",
          },
          ibanLast4: "8901",
        },
      });
    });

    it("eski kayıt: submittedAmount yoksa net, referans yoksa transId", async () => {
      const { service } = build({
        payout: { ...completed, submittedAmount: null, providerReference: null },
      });
      const load = await service.load("payout_transfer", "p-1");
      expect(load).toMatchObject({
        state: "ready",
        source: { amount: completed.netAmount, reference: "TRN-1" },
      });
    });

    it("tamamlanmamış absent; net 0 ve test şeridi skipped", async () => {
      await expect(
        build({ payout: { ...completed, status: "processing" } }).service.load(
          "payout_transfer",
          "p-1",
        ),
      ).resolves.toMatchObject({ state: "absent" });
      await expect(
        build({ payout: { ...completed, submittedAmount: D(0) } }).service.load(
          "payout_transfer",
          "p-1",
        ),
      ).resolves.toMatchObject({ state: "not_applicable" });
      await expect(
        build({
          payout: {
            ...completed,
            seller: { ...completed.seller, isTestAccount: true },
          },
        }).service.load("payout_transfer", "p-1"),
      ).resolves.toMatchObject({ state: "not_applicable" });
    });
  });

  describe("refund_reversal", () => {
    const succeeded = {
      status: "finalized",
      amount: D("59.90"),
      providerSucceededAt: new Date("2026-10-07T08:00:00Z"),
      finalizedAt: new Date("2026-10-07T08:01:00Z"),
      updatedAt: new Date("2026-10-07T08:01:00Z"),
      order: { orderNumber: "ORD-K7X9M2QF3N", buyerId: "u-1" },
      trade: null,
      payment: { isTest: false, tradeCashPayment: null },
    };
    const buyer = {
      displayName: "Kaya Oto",
      companyName: "Kaya Oto A.Ş.",
      taxId: "1234567890",
      adminCode: "K010042",
    };

    it("sipariş iadesi: alıcı siparişin alıcısı, referans sipariş numarası", async () => {
      const { service, prisma } = build({ refund: succeeded, user: buyer });
      await expect(service.load("refund_reversal", "a-1")).resolves.toEqual({
        state: "ready",
        source: {
          kind: "refund_reversal",
          reference: "ORD-K7X9M2QF3N",
          amount: succeeded.amount,
          succeededAt: succeeded.providerSucceededAt,
          buyer: {
            name: "Kaya Oto A.Ş.",
            taxId: "1234567890",
            adminCode: "K010042",
          },
        },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u-1" } }),
      );
    });

    it("takas iadesi: alıcı satırı ödeyen taraf, referans takas numarası", async () => {
      const { service, prisma } = build({
        refund: {
          ...succeeded,
          order: null,
          trade: { tradeNumber: "TKS-10042" },
          payment: { isTest: false, tradeCashPayment: { payerId: "u-2" } },
        },
        user: buyer,
      });
      await expect(service.load("refund_reversal", "a-1")).resolves.toMatchObject({
        state: "ready",
        source: { reference: "TKS-10042" },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u-2" } }),
      );
    });

    it("sonuçlanmamış absent; test şeridi ve tarafı yok skipped", async () => {
      await expect(
        build({ refund: { ...succeeded, status: "submitting" } }).service.load(
          "refund_reversal",
          "a-1",
        ),
      ).resolves.toMatchObject({ state: "absent" });
      await expect(
        build({
          refund: { ...succeeded, payment: { isTest: true, tradeCashPayment: null } },
          user: buyer,
        }).service.load("refund_reversal", "a-1"),
      ).resolves.toMatchObject({ state: "not_applicable" });
      await expect(
        build({ refund: succeeded, user: null }).service.load(
          "refund_reversal",
          "a-1",
        ),
      ).resolves.toMatchObject({ state: "not_applicable" });
    });
  });

  it("kaynak satırı yoksa absent", async () => {
    const { service } = build({});
    for (const kind of [
      "invoice_collection",
      "settlement_transfer",
      "payout_transfer",
      "refund_reversal",
    ] as const) {
      await expect(service.load(kind, "x")).resolves.toMatchObject({
        state: "absent",
      });
    }
  });
});
