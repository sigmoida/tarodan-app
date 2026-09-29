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

/**
 * Kaynak tablosu faturanın TÜRÜNE göre başka kayda bakar. Tür → tablo eşlemesi
 * tek kaynağa (`invoice-source.ts`) taşındığında dökümün ÇIKTISI değişmemeli;
 * her dal burada sabitlenir.
 */
describe("InvoiceDetailService.build — tür başına kaynak dalı", () => {
  const baseInvoice = {
    id: "inv-1",
    sourceReference: null,
    lineDescription: null,
    lineItems: null,
    documentType: "EARCHIVE",
    status: "sent",
    context: null,
    ettn: null,
    invoiceNumber: "TRD2026000000002",
    billingReference: null,
    issuedAt: null,
    createdAt: new Date("2026-09-01"),
    cancelledAt: null,
    cancelReason: null,
    recipientName: null,
    recipientVknTckn: null,
    recipientEmail: null,
    netAmount: 10,
    discountTotal: 0,
    taxAmount: 2,
    vatRate: 20,
    total: 12,
    seller: null,
    buyer: null,
  };

  const found = (value: unknown) => ({
    findUnique: jest.fn().mockResolvedValue(value),
  });
  const none = () => found(null);

  const build = (
    invoice: { type: string; sourceId: string },
    tables: Record<string, { findUnique: jest.Mock }> = {},
  ) => {
    const prisma = {
      elogoInvoice: found({ ...baseInvoice, ...invoice }),
      orderPackage: none(),
      order: none(),
      tradeCashPayment: none(),
      refundRequest: none(),
      productBoost: none(),
      membershipPayment: none(),
      ...tables,
    };
    return new InvoiceDetailService(prisma as never).build("inv-1");
  };

  const paidAt = new Date("2026-09-03T00:00:00Z");

  it("takas belgesi ödemenin dolu kalemlerini takas numarasıyla döker", async () => {
    const detail = await build(
      { type: "trade_service_fee", sourceId: "tcp-1" },
      {
        tradeCashPayment: found({
          amount: 0,
          tradeFeeAmount: 50,
          shippingAmount: 30,
          commission: 0,
          paidAt,
          createdAt: new Date("2026-09-01"),
          trade: { tradeNumber: "TKS-AAA" },
        }),
      },
    );

    expect(detail.source).toEqual([
      {
        reference: "TKS-AAA",
        description: "Takas hizmet bedeli",
        quantity: null,
        amount: 50,
        occurredAt: paidAt,
      },
      {
        reference: "TKS-AAA",
        description: "Takas kargo bedeli",
        quantity: null,
        amount: 30,
        occurredAt: paidAt,
      },
    ]);
  });

  it("ceza belgesi iade talebini siparişiyle birlikte döker", async () => {
    const detail = await build(
      { type: "penalty", sourceId: "rr-1" },
      {
        refundRequest: found({
          refundNumber: "RFD-AAA",
          amount: 75,
          createdAt: paidAt,
          order: { orderNumber: "ORD-AAA", product: { title: "Kaput" } },
        }),
      },
    );

    expect(detail.source).toEqual([
      {
        reference: "RFD-AAA",
        description: "İade talebi — Kaput (ORD-AAA)",
        quantity: null,
        amount: 75,
        occurredAt: paidAt,
      },
    ]);
  });

  it("öne çıkarma belgesi boost siparişinin numarasını taşır", async () => {
    const detail = await build(
      { type: "boost", sourceId: "boost-1" },
      {
        productBoost: found({
          packageName: "Vitrin",
          durationDays: 7,
          price: 99,
          purchasedAt: paidAt,
          createdAt: new Date("2026-09-01"),
          orderId: "order-b",
          product: { title: "Jant" },
        }),
        order: found({ orderNumber: "BST-AAA" }),
      },
    );

    expect(detail.source).toEqual([
      {
        reference: "BST-AAA",
        description: "Vitrin — Jant",
        quantity: 7,
        amount: 99,
        occurredAt: paidAt,
      },
    ]);
  });

  it("üyelik ödemesi anahtarlı belge ödemenin siparişinden çözülür", async () => {
    const order = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          orderNumber: "MEM-AAA",
          quantity: 1,
          totalAmount: 120,
          createdAt: paidAt,
          payment: null,
          product: { title: "Pro üyelik" },
        }),
    };
    const detail = await build(
      { type: "membership", sourceId: "mp-1" },
      { order, membershipPayment: found({ orderId: "order-m" }) },
    );

    expect(detail.source).toEqual([
      {
        reference: "MEM-AAA",
        description: "Pro üyelik",
        quantity: 1,
        amount: 120,
        occurredAt: paidAt,
      },
    ]);
    expect(order.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "order-m" } }),
    );
  });

  it("iade faturası ters çevirdiği belgenin kaynağını gösterir (kısmi anahtar dahil)", async () => {
    const elogoInvoice = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          ...baseInvoice,
          type: "return_invoice",
          sourceId: "inv-0:attempt-1",
        })
        .mockResolvedValueOnce({ type: "platform_sale", sourceId: "order-p" }),
    };
    const detail = await build(
      { type: "return_invoice", sourceId: "inv-0:attempt-1" },
      {
        elogoInvoice,
        order: found({
          orderNumber: "ORD-PPP",
          quantity: 1,
          totalAmount: 40,
          createdAt: paidAt,
          payment: null,
          product: { title: "Filtre" },
        }),
      },
    );

    expect(detail.source.map((row) => row.reference)).toEqual(["ORD-PPP"]);
    expect(elogoInvoice.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "inv-0" } }),
    );
  });

  it("iade faturasının kaynağı yine iade faturasıysa döngüye girmez", async () => {
    const elogoInvoice = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          ...baseInvoice,
          type: "return_invoice",
          sourceId: "inv-0",
        })
        .mockResolvedValueOnce({ type: "return_invoice", sourceId: "inv-1" }),
    };
    const detail = await build(
      { type: "return_invoice", sourceId: "inv-0" },
      { elogoInvoice },
    );

    expect(detail.source).toEqual([]);
  });
});
