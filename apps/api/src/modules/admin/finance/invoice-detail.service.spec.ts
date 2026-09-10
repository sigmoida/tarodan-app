import { InvoiceDetailService } from "./invoice-detail.service";

/**
 * Dökümün kaynak tablosu, faturanın dayandığı koliyi/siparişi okur. Buradaki
 * asıl risk tipsiz bir `select`: alan adı `Prisma.OrderSelect`e karşı
 * doğrulanmazsa yanlış bir ad derlemeden geçer ve ancak CANLIDA 500 olur —
 * `paidAt` (Order'da yok, Payment'ta var) tam olarak böyle kaçmıştı.
 */
describe("InvoiceDetailService.build — kaynak işlem tablosu", () => {
  const invoice = {
    id: "inv-1",
    type: "seller_commission",
    sourceId: "pkg-1",
    sourceReference: "KYT-ABC",
    lineDescription: "Satıcı Komisyonu",
    lineItems: null,
    documentType: "e-Arşiv",
    status: "sent",
    context: "direct_sale",
    ettn: "ettn-1",
    invoiceNumber: "TRD2026000000001",
    billingReference: null,
    issuedAt: new Date("2026-09-01"),
    createdAt: new Date("2026-09-01"),
    cancelledAt: null,
    cancelReason: null,
    recipientName: "Satıcı",
    recipientVknTckn: "1234567890",
    recipientEmail: "a@b.c",
    netAmount: 100,
    discountTotal: 0,
    taxAmount: 20,
    vatRate: 20,
    total: 120,
    seller: null,
    buyer: null,
  };

  const makeService = (orderRow: Record<string, unknown> | null) => {
    const orderPackage = {
      findUnique: jest
        .fn()
        .mockResolvedValue(orderRow ? { orders: [orderRow] } : null),
    };
    const prisma = {
      elogoInvoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      orderPackage,
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    return {
      service: new InvoiceDetailService(prisma as never),
      orderPackage,
    };
  };

  const order = {
    orderNumber: "ORD-1",
    quantity: 2,
    totalAmount: 250,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    payment: { paidAt: new Date("2026-09-02T08:00:00Z") },
    product: { title: "Fren balatası" },
  };

  it("siparişin ödeme tarihini PAYMENT üzerinden okur", async () => {
    const { service } = makeService(order);

    const detail = await service.build("inv-1");

    expect(detail.source).toEqual([
      {
        reference: "ORD-1",
        description: "Fren balatası",
        quantity: 2,
        amount: 250,
        occurredAt: new Date("2026-09-02T08:00:00Z"),
      },
    ]);
  });

  it("ödeme yoksa siparişin oluşturulma tarihine düşer", async () => {
    const { service } = makeService({ ...order, payment: null });

    const detail = await service.build("inv-1");

    expect(detail.source[0].occurredAt).toEqual(
      new Date("2026-09-01T10:00:00Z"),
    );
  });

  /**
   * Sözleşme testi: `Order`'da OLMAYAN bir alan istenirse Prisma çalışma
   * anında `PrismaClientValidationError` fırlatır. Seçilen alan listesini
   * burada sabitlemek, tipten kaçan bir adı en azından süitte yakalar.
   */
  it("Order'dan yalnız gerçekten var olan alanları seçer", async () => {
    const { service, orderPackage } = makeService(order);

    await service.build("inv-1");

    const select = orderPackage.findUnique.mock.calls[0][0].select.orders
      .select as Record<string, unknown>;
    expect(Object.keys(select).sort()).toEqual([
      "createdAt",
      "orderNumber",
      "payment",
      "product",
      "quantity",
      "totalAmount",
    ]);
    expect(select).not.toHaveProperty("paidAt");
  });
});
