import { InvoiceIssuingService } from "./invoice-issuing.service";
import type {
  InstallmentFeeBasis,
  InvoiceDocumentService,
} from "./invoice-document.service";
import type { InvoiceDeliveryService } from "./invoice-delivery.service";

/**
 * When the buyer's installment fee (vade farkı) document is cut (ADR 0019
 * D4): one `buyer_installment_fee` per package, at delivery with the other
 * buyer fee documents, for the fee left after refunds, VAT included at the
 * charge attempt's snapshotted rate. Never for a single payment or a zero
 * fee; Tarodan's own goods get the same document (AS-F2).
 */

type CutArgs = [
  type: string,
  sourceId: string,
  recipientUserId: string,
  grossAmount: number,
  opts?: {
    lineItems?: unknown;
    guestRecipient?: unknown;
    sourceReference?: string | null;
    snapshotVatRate?: number;
  },
];

const basisOf = (
  over: Partial<InstallmentFeeBasis> = {},
): InstallmentFeeBasis => ({
  buyerId: "b1",
  packageNumber: "PKG-K7X9M2QF3N",
  shippingAddress: null,
  orders: [{ id: "o1", fee: 66.38, refundedFee: 0 }],
  paymentFeeFullyRefunded: false,
  vatRatePct: 20,
  paymentPackageIds: [],
  ...over,
});

function makeService(
  options: {
    basis?: InstallmentFeeBasis | null;
    sellerType?: string;
    pendingOrders?: number;
  } = {},
) {
  const cut = jest.fn<Promise<void>, CutArgs>(async () => undefined);
  const prisma = {
    order: {
      findUnique: jest.fn(async () => ({ packageId: "pkg1" })),
      count: jest.fn(async () => options.pendingOrders ?? 0),
      update: jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async () => ({
        sellerType: options.sellerType ?? "individual",
      })),
    },
  };
  const documents = {
    resolveInstallmentFeeBasis: jest.fn(async () =>
      options.basis === undefined ? basisOf() : options.basis,
    ),
  };
  const service = new InvoiceIssuingService(
    prisma as never,
    documents as unknown as InvoiceDocumentService,
    { cut } as unknown as InvoiceDeliveryService,
  );
  return { service, cut, prisma, documents };
}

describe("InvoiceIssuingService.issueInstallmentFeeInvoice", () => {
  it("cuts one buyer document of 66.38 (55.32 + 11.06 VAT) keyed by the package", async () => {
    const { service, cut } = makeService();

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut).toHaveBeenCalledTimes(1);
    const [type, sourceId, recipient, gross, opts] = cut.mock.calls[0];
    expect([type, sourceId, recipient, gross]).toEqual([
      "buyer_installment_fee",
      "pkg1",
      "b1",
      66.38,
    ]);
    expect(opts).toEqual({
      lineItems: [
        {
          name: "Taksit vade farkı",
          quantity: 1,
          net: 55.32,
          unitPrice: 55.32,
          vatRate: 20,
          taxAmount: 11.06,
        },
      ],
      // The rate of the charge, never today's setting.
      snapshotVatRate: 20,
      sourceReference: "KYT-K7X9M2QF3N",
      guestRecipient: null,
    });
  });

  it("cuts the package's fee after refunds, at the snapshotted rate", async () => {
    const { service, cut } = makeService({
      basis: basisOf({
        orders: [
          { id: "o1", fee: 20.0, refundedFee: 0 },
          { id: "o2", fee: 13.19, refundedFee: 13.19 },
        ],
        vatRatePct: 10,
      }),
    });

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut.mock.calls[0][3]).toBe(20);
    expect(cut.mock.calls[0][4]).toMatchObject({
      snapshotVatRate: 10,
      lineItems: [{ net: 18.18, taxAmount: 1.82, vatRate: 10 }],
    });
  });

  it("addresses a guest's document to the real buyer from the shipping address", async () => {
    const { service, cut } = makeService({
      basis: basisOf({
        shippingAddress: {
          guestName: "Ayşe Yılmaz",
          guestEmail: "ayse@example.test",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Örnek Sk. 1",
        },
      }),
    });

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut.mock.calls[0][4]?.guestRecipient).toEqual({
      name: "Ayşe Yılmaz",
      email: "ayse@example.test",
      address: {
        city: "İstanbul",
        district: "Kadıköy",
        street: "Örnek Sk. 1",
        zipCode: null,
      },
    });
  });

  it("cuts the same separate document for Tarodan's own goods (AS-F2)", async () => {
    const { service, cut, prisma } = makeService({ sellerType: "platform" });

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut).toHaveBeenCalledTimes(1);
    expect(cut.mock.calls[0][0]).toBe("buyer_installment_fee");
    // No platform-seller exit: the seller is not even looked up.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("cuts nothing without a fee (single payment, 100 % share, installments off)", async () => {
    const { service, cut } = makeService({ basis: null });

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut).not.toHaveBeenCalled();
  });

  it("cuts nothing once the whole fee went back", async () => {
    const { service, cut } = makeService({
      basis: basisOf({
        orders: [{ id: "o1", fee: 66.38, refundedFee: 66.38 }],
      }),
    });

    await service.issueInstallmentFeeInvoice("pkg1");

    expect(cut).not.toHaveBeenCalled();
  });

  it("refuses a fee without the charge's VAT rate instead of guessing one", async () => {
    const { service, cut } = makeService({
      basis: basisOf({ vatRatePct: null }),
    });

    await expect(service.issueInstallmentFeeInvoice("pkg1")).rejects.toThrow(
      /INSTALLMENT_FEE_VAT_RATE_MISSING package=pkg1/,
    );
    expect(cut).not.toHaveBeenCalled();
  });
});

describe("InvoiceIssuingService.issueOrderRevenueInvoices with an installment fee", () => {
  it("cuts the fee document after the package fee documents once the package is delivered", async () => {
    const { service, prisma } = makeService();
    const order: string[] = [];
    jest
      .spyOn(service, "issuePackageFeeInvoices")
      .mockImplementation(async () => void order.push("package-fees"));
    jest
      .spyOn(service, "issueInstallmentFeeInvoice")
      .mockImplementation(async () => void order.push("installment-fee"));
    jest
      .spyOn(service, "issuePlatformSaleInvoice")
      .mockImplementation(async () => void order.push("platform-sale"));

    await service.issueOrderRevenueInvoices("o1");

    expect(order).toEqual(["package-fees", "installment-fee", "platform-sale"]);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" } }),
    );
  });

  it("does not stamp the order when the fee document fails, so the backfill retries it", async () => {
    const { service, prisma } = makeService();
    jest.spyOn(service, "issuePackageFeeInvoices").mockResolvedValue();
    jest.spyOn(service, "issuePlatformSaleInvoice").mockResolvedValue();
    jest
      .spyOn(service, "issueInstallmentFeeInvoice")
      .mockRejectedValue(new Error("INSTALLMENT_FEE_VAT_RATE_MISSING"));

    await service.issueOrderRevenueInvoices("o1");

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("waits for the whole package like the other package documents", async () => {
    const { service } = makeService({ pendingOrders: 1 });
    const fee = jest
      .spyOn(service, "issueInstallmentFeeInvoice")
      .mockResolvedValue();
    jest.spyOn(service, "issuePlatformSaleInvoice").mockResolvedValue();

    await service.issueOrderRevenueInvoices("o1");

    expect(fee).not.toHaveBeenCalled();
  });
});
