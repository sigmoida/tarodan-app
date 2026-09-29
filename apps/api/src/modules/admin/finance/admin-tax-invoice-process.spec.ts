import { AdminTaxService } from "./admin-tax.service";

/**
 * Admin fatura listesi her satırda belgenin dayandığı İŞLEMİ (numara +
 * bağlantı hedefi) döner ve işlem numarasıyla aranabilir. Çözümün kendisi
 * `invoice-process*.spec.ts`'te kilitli; burada listenin onu doğru yere
 * bağladığı sabitlenir.
 */
describe("AdminTaxService.getElogoInvoices — işlem referansı", () => {
  const invoiceRow = {
    id: "inv-1",
    type: "trade_service_fee",
    sourceId: "tcp-1",
    status: "sent",
    documentType: "EARCHIVE",
    invoiceNumber: "TRD2026000000001",
    ettn: null,
    sourceReference: null,
    lineDescription: null,
    context: "trade",
    recipientName: null,
    recipientVknTckn: null,
    recipientUserId: null,
    recipientEmail: null,
    seller: null,
    buyer: null,
    netAmount: 10,
    taxAmount: 2,
    total: 12,
    discountTotal: 0,
    vatRate: 20,
    billingReference: null,
    pdfUrl: null,
    emailSentAt: null,
    elogoResultMsg: null,
    issuedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date("2026-09-01"),
  };

  const makeService = (rows: unknown[] = []) => {
    const prisma = {
      elogoInvoice: {
        count: jest.fn().mockResolvedValue(rows.length),
        // `select: { id }` yalnız iade faturası araması için atılır.
        findMany: jest
          .fn()
          .mockImplementation(({ select }) =>
            Promise.resolve(Object.keys(select).length === 1 ? [] : rows),
          ),
      },
      tradeCashPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "tcp-1",
            tradeId: "trade-1",
            trade: { tradeNumber: "TKS-AAA" },
          },
        ]),
      },
      trade: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ cashPayments: [{ id: "tcp-1" }] }),
      },
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: "rr-1" }),
      },
    };
    const service = new AdminTaxService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const pageWhere = () =>
      prisma.elogoInvoice.findMany.mock.calls.find(
        ([args]) => Object.keys(args.select).length > 1,
      )?.[0].where;
    return { service, prisma, pageWhere };
  };

  it("her satıra işlemin referanslarını ekler", async () => {
    const { service, prisma } = makeService([invoiceRow]);

    const result = await service.getElogoInvoices({});

    expect(result.data[0].process).toEqual({
      kind: "trade",
      refs: [{ kind: "trade", label: "TKS-AAA", targetId: "trade-1" }],
    });
    expect(prisma.tradeCashPayment.findMany).toHaveBeenCalledTimes(1);
  });

  it("İşlem No filtresi numarayı kaynak anahtarına çevirir", async () => {
    const { service, prisma, pageWhere } = makeService();

    await service.getElogoInvoices({ processRef: "rfd-aaa" });

    expect(prisma.refundRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { refundNumber: "RFD-AAA" } }),
    );
    expect(pageWhere().AND).toContainEqual({
      OR: [{ type: { in: ["penalty"] }, sourceId: { in: ["rr-1"] } }],
    });
  });

  it("İşlem No filtresine numara olmayan metin girilirse sonuç boştur", async () => {
    const { service, pageWhere } = makeService();

    await service.getElogoInvoices({ processRef: "komisyon" });

    expect(pageWhere().AND).toContainEqual({ id: { in: [] } });
  });

  it("genel arama işlem numarasını da eşleştirir, metin aramasını korur", async () => {
    const { service, pageWhere } = makeService();

    await service.getElogoInvoices({ search: "TKS-AAA" });

    const search = pageWhere().AND.at(-1);
    expect(search.OR).toHaveLength(2);
    expect(search.OR[0].OR).toContainEqual({
      invoiceNumber: { contains: "TKS-AAA", mode: "insensitive" },
    });
    expect(search.OR[1]).toEqual({
      OR: [
        {
          type: { in: expect.arrayContaining(["trade_service_fee"]) },
          sourceId: { in: ["tcp-1"] },
        },
      ],
    });
  });

  it("işlem numarası olmayan genel arama kaynak tablolarına gitmez", async () => {
    const { service, prisma, pageWhere } = makeService();

    await service.getElogoInvoices({ search: "komisyon" });

    expect(prisma.trade.findUnique).not.toHaveBeenCalled();
    expect(pageWhere().AND.at(-1).OR).toContainEqual({
      invoiceNumber: { contains: "komisyon", mode: "insensitive" },
    });
  });
});
