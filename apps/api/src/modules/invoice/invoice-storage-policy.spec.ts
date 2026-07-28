import { InvoiceService } from "./invoice.service";

describe("InvoiceService storage policy", () => {
  it("does not issue an invoice record when durable PDF storage fails", async () => {
    const order = {
      id: "order-1",
      orderNumber: "ORDER1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      subtotal: 100,
      taxAmount: 0,
      buyerFeeAmount: 0,
      totalAmount: 100,
      shippingCost: 0,
      commissionAmount: 10,
      shippingAddress: null,
      quantity: 1,
      unitPrice: 100,
      buyer: {
        displayName: "Buyer",
        email: "buyer@example.com",
        phone: null,
        taxId: null,
      },
      seller: {
        displayName: "Seller",
        email: "seller@example.com",
        phone: null,
        taxId: null,
      },
      product: { title: "Product", categoryId: "category-1" },
      payment: { provider: "paytr", paidAt: new Date() },
      checkoutGroup: null,
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
      invoice: {
        create: jest.fn(),
      },
    };
    const storage = {
      isStorageAvailable: jest.fn().mockReturnValue(true),
      uploadFile: jest.fn().mockRejectedValue(new Error("S3 unavailable")),
    };
    const pdf = {
      generateInvoiceNumber: jest.fn().mockResolvedValue("TRD-202607-000001"),
      generateInvoiceHtml: jest.fn().mockReturnValue("<html />"),
      generatePdfFromData: jest.fn().mockResolvedValue(Buffer.from("pdf")),
      resolveInvoicePdfUrl: jest.fn(),
    };
    const service = new InvoiceService(
      prisma as any,
      {} as any,
      storage as any,
      {} as any,
      {} as any,
      {
        resolveTaxRate: jest.fn(),
        calculateTaxAmount: jest.fn(),
      } as any,
      pdf as any,
    );

    await expect(service.generateForOrder(order.id)).rejects.toThrow(
      "S3 unavailable",
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});
