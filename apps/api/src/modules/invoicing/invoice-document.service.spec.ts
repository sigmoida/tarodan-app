import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma";
import { InvoiceDocumentService } from "./invoice-document.service";
import type {
  DocumentNumbering,
  EInvoiceProvider,
  RecipientKindResult,
} from "./provider/e-invoice-provider";

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { ELOGO_INVOICE_PREFIX: "TRD" };
  return {
    get: (key: string, def?: string) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

function fakeProvider(
  numbering: DocumentNumbering,
  resolveRecipientKind: (
    taxId: string,
  ) => Promise<RecipientKindResult | null> = async () => null,
) {
  return {
    numbering,
    resolveRecipientKind: jest.fn(resolveRecipientKind),
  };
}

function build(provider: ReturnType<typeof fakeProvider>, user?: object) {
  const upsert = jest.fn(async () => ({ lastValue: 7 }));
  const prisma = {
    fiscalDocSequence: { upsert },
    user: { findUnique: jest.fn(async () => user ?? null) },
  };
  const service = new InvoiceDocumentService(
    prisma as unknown as PrismaService,
    provider as unknown as EInvoiceProvider,
    fakeConfig(),
  );
  return { service, upsert, tx: prisma as unknown as Prisma.TransactionClient };
}

/**
 * Numara kapısı: belge numarasını kimin verdiği sağlayıcının
 * `numbering` bayrağından okunur. eLogo yereldir (boşluksuz TRD serisi);
 * numarayı ERP atayan bir sağlayıcıda sayaç hiç ilerlememeli — aksi halde
 * seride kullanılmayan numaralar kalır.
 */
describe("InvoiceDocumentService.allocateDocumentNumberInTransaction", () => {
  it("yerel numaralandırmada boşluksuz TRD numarası tahsis eder", async () => {
    const { service, upsert, tx } = build(fakeProvider("local"));

    const number = await service.allocateDocumentNumberInTransaction(tx, 2026);

    expect(number).toBe("TRD2026000000007");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("numarayı sağlayıcı veriyorsa kayıt numarasız açılır, sayaç ilerlemez", async () => {
    const { service, upsert, tx } = build(fakeProvider("provider"));

    const number = await service.allocateDocumentNumberInTransaction(tx, 2026);

    expect(number).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("InvoiceDocumentService.resolveRecipient — mükellefiyet sağlayıcıdan", () => {
  it("e-Fatura mükellefi: EINVOICE + posta kutusu etiketi", async () => {
    const provider = fakeProvider("local", async () => ({
      kind: "EINVOICE",
      alias: "urn:mail:pk@x",
    }));
    const { service } = build(provider, {
      companyName: "Firma A.Ş.",
      taxId: "1234567890",
    });

    const recipient = await service.resolveRecipient("u1");

    expect(provider.resolveRecipientKind).toHaveBeenCalledWith("1234567890");
    expect(recipient.documentType).toBe("EINVOICE");
    expect(recipient.alias).toBe("urn:mail:pk@x");
  });

  it("mükellef değilse etiket taşınmaz", async () => {
    const provider = fakeProvider("local", async () => ({
      kind: "EARCHIVE",
      alias: "urn:mail:stale@x",
    }));
    const { service } = build(provider, { taxId: "12345678901" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.documentType).toBe("EARCHIVE");
    expect(recipient.alias).toBeUndefined();
  });

  it("sorgu düşerse güvenli taraf: EARCHIVE", async () => {
    const provider = fakeProvider("local", async () => {
      throw new Error("ECONNRESET");
    });
    const { service } = build(provider, { taxId: "1234567890" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.documentType).toBe("EARCHIVE");
  });

  it("kimliği olmayan nihai tüketici için sağlayıcıya sorulmaz", async () => {
    const provider = fakeProvider("local");
    const { service } = build(provider, { displayName: "Ad Soyad" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.vknTckn).toBe("11111111111");
    expect(provider.resolveRecipientKind).not.toHaveBeenCalled();
  });
});

/**
 * The installment fee document (ADR 0019, D4) is invoiced at the VAT rate
 * snapshotted on the charge it was collected with. The generic resolver must
 * refuse it rather than invoice it at today's rate.
 */
describe("InvoiceDocumentService.resolveVatRate", () => {
  it("refuses a type whose rate is snapshotted on the charge", async () => {
    const { service } = build(fakeProvider("local"));

    await expect(
      service.resolveVatRate("buyer_installment_fee"),
    ).rejects.toThrow(/snapshotted on the charge/);
  });

  it("still resolves the standard fallback for other types", async () => {
    const { service } = build(fakeProvider("local"));

    await expect(service.resolveVatRate("membership")).resolves.toBe(20);
  });
});

/**
 * The cut gate: a `charge_snapshot` document is cut at the rate passed from
 * its charge and refuses to be cut without it; every other type resolves its
 * own rate and refuses a passed one.
 */
describe("InvoiceDocumentService.resolveCutVatRate", () => {
  it("takes the charge's rate for the installment fee document", async () => {
    const { service } = build(fakeProvider("local"));

    await expect(
      service.resolveCutVatRate("buyer_installment_fee", {
        snapshotVatRate: 20,
      }),
    ).resolves.toBe(20);
    // AS-F1 answered "not VAT-able": a 0 % snapshot is a valid rate.
    await expect(
      service.resolveCutVatRate("buyer_installment_fee", {
        snapshotVatRate: 0,
      }),
    ).resolves.toBe(0);
  });

  it.each([undefined, Number.NaN, -1])(
    "refuses to cut the installment fee document with rate %p",
    async (snapshotVatRate) => {
      const { service } = build(fakeProvider("local"));

      await expect(
        service.resolveCutVatRate("buyer_installment_fee", { snapshotVatRate }),
      ).rejects.toThrow(/snapshotted on the charge/);
    },
  );

  it("refuses a snapshot rate for a type that resolves its own", async () => {
    const { service } = build(fakeProvider("local"));

    await expect(
      service.resolveCutVatRate("membership", { snapshotVatRate: 10 }),
    ).rejects.toThrow(/not accepted/);
    await expect(service.resolveCutVatRate("membership")).resolves.toBe(20);
  });
});

/**
 * What the installment fee document of a package is built from: each
 * order's fee share, the fee given back by FINALIZED refunds, and the VAT
 * rate of the payment's captured charge attempt.
 */
describe("InvoiceDocumentService.resolveInstallmentFeeBasis", () => {
  const D = (v: string) => new Prisma.Decimal(v);

  function buildBasis(over: {
    orders?: Array<Record<string, unknown>>;
    payment?: Record<string, unknown> | null;
    refunds?: Array<Record<string, unknown>>;
    paymentOrders?: Array<{ packageId: string | null }>;
  }) {
    const prisma = {
      orderPackage: {
        findUnique: jest.fn(async () => ({
          buyerId: "b1",
          packageNumber: "PKG-K7X9M2QF3N",
          orders: over.orders ?? [
            {
              id: "o1",
              checkoutGroupId: "g1",
              shippingAddress: { guestName: "Ayşe Yılmaz" },
              installmentFeeAmount: D("39.83"),
            },
          ],
        })),
      },
      payment: {
        findFirst: jest.fn(async () =>
          over.payment === undefined
            ? {
                id: "p1",
                orderId: null,
                checkoutGroupId: "g1",
                installmentFeeAmount: D("66.38"),
                chargeAttempt: { feeVatRatePct: D("20.00") },
              }
            : over.payment,
        ),
      },
      refundAttempt: { findMany: jest.fn(async () => over.refunds ?? []) },
      order: {
        findMany: jest.fn(async () => over.paymentOrders ?? []),
      },
    };
    const service = new InvoiceDocumentService(
      prisma as unknown as PrismaService,
      fakeProvider("local") as unknown as EInvoiceProvider,
      fakeConfig(),
    );
    return { service, prisma };
  }

  it("reads the package's fee shares, finalized refunds and the attempt's VAT rate", async () => {
    const { service, prisma } = buildBasis({
      refunds: [
        { orderId: "o1", paymentId: "p1", installmentFeeAmount: D("10.62") },
        // Another package's order of the same cart.
        { orderId: "o9", paymentId: "p1", installmentFeeAmount: D("26.55") },
      ],
    });

    const basis = await service.resolveInstallmentFeeBasis("pkg1");

    expect(basis).toEqual({
      buyerId: "b1",
      packageNumber: "PKG-K7X9M2QF3N",
      shippingAddress: { guestName: "Ayşe Yılmaz" },
      orders: [{ id: "o1", fee: 39.83, refundedFee: 10.62 }],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
      paymentPackageIds: [],
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          installmentFeeAmount: { gt: 0 },
          chargeAttemptId: { not: null },
          OR: [
            { orderId: { in: ["o1"] } },
            { checkoutGroupId: { in: ["g1"] } },
          ],
        },
      }),
    );
    // Only refunds whose money went back count.
    expect(prisma.refundAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "finalized" }),
      }),
    );
  });

  it("names every package of the payment once its whole fee went back", async () => {
    const { service } = buildBasis({
      refunds: [
        { orderId: "o1", paymentId: "p1", installmentFeeAmount: D("36.00") },
        { orderId: "o9", paymentId: "p1", installmentFeeAmount: D("30.38") },
      ],
      paymentOrders: [
        { packageId: "pkg1" },
        { packageId: "pkg2" },
        { packageId: "pkg2" },
      ],
    });

    const basis = await service.resolveInstallmentFeeBasis("pkg1");

    expect(basis?.paymentFeeFullyRefunded).toBe(true);
    expect(basis?.paymentPackageIds).toEqual(["pkg1", "pkg2"]);
  });

  it("returns null without a fee in the package, before any payment read", async () => {
    const { service, prisma } = buildBasis({
      orders: [
        {
          id: "o1",
          checkoutGroupId: null,
          shippingAddress: null,
          installmentFeeAmount: D("0"),
        },
      ],
    });

    await expect(
      service.resolveInstallmentFeeBasis("pkg1"),
    ).resolves.toBeNull();
    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it("reports no VAT rate when no captured attempt carries the fee", async () => {
    const { service } = buildBasis({ payment: null });

    const basis = await service.resolveInstallmentFeeBasis("pkg1");

    expect(basis?.vatRatePct).toBeNull();
  });
});
