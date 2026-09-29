import {
  NO_INVOICE_MATCH,
  invoiceProcessWhere,
} from "./invoice-process-search";

/**
 * "İşlem No" araması: operatör işlemin numarasını (ORD-/BST-/MEM-/TKS-/RFD-)
 * yazar, fatura ise o işlemi tipsiz `sourceId` ile gösterir. Numara önce
 * kaynak kayıtların id'lerine çevrilir, sonra `type IN (...) AND sourceId IN
 * (...)` koşullarına — türler `invoice-source.ts`'teki tek eşlemeden gelir.
 */

function makePrisma(
  overrides: Partial<{
    order: unknown;
    trade: unknown;
    refundRequestByNumber: unknown;
    refundRequestIds: unknown[];
    boostIds: unknown[];
    membershipPaymentIds: unknown[];
    originals: unknown[];
  }> = {},
) {
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(overrides.order ?? null) },
    trade: { findUnique: jest.fn().mockResolvedValue(overrides.trade ?? null) },
    refundRequest: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.refundRequestByNumber ?? null),
      findMany: jest.fn().mockResolvedValue(overrides.refundRequestIds ?? []),
    },
    productBoost: {
      findMany: jest.fn().mockResolvedValue(overrides.boostIds ?? []),
    },
    membershipPayment: {
      findMany: jest
        .fn()
        .mockResolvedValue(overrides.membershipPaymentIds ?? []),
    },
    elogoInvoice: {
      findMany: jest.fn().mockResolvedValue(overrides.originals ?? []),
    },
  };
  return {
    prisma,
    client: prisma as unknown as Parameters<typeof invoiceProcessWhere>[0],
  };
}

const PACKAGE_OR_ORDER_TYPES = [
  "commission",
  "service_fee",
  "buyer_commission",
  "buyer_service_fee",
  "buyer_shipping",
  "seller_commission",
  "seller_platform_fee",
  "seller_shipping",
  "platform_sale",
];

const sourceCondition = (types: string[], ids: string[]) => ({
  type: { in: expect.arrayContaining(types) },
  sourceId: { in: ids },
});

describe("invoiceProcessWhere", () => {
  it("işlem numarası olmayan metinde null döner (genel aramaya karışmaz)", async () => {
    const { client, prisma } = makePrisma();

    await expect(invoiceProcessWhere(client, "komisyon")).resolves.toBeNull();
    await expect(invoiceProcessWhere(client, "PKG-AAA")).resolves.toBeNull();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("ORD numarası siparişin kolisine, kendisine, iade talebine, boost'una ve üyeliğine çevrilir", async () => {
    const { client, prisma } = makePrisma({
      order: { id: "o-1", packageId: "pkg-1" },
      refundRequestIds: [{ id: "rr-1" }],
      boostIds: [{ id: "boost-1" }],
      membershipPaymentIds: [{ id: "mp-1" }],
    });

    const where = await invoiceProcessWhere(client, " ord-aaa ");

    expect(prisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderNumber: "ORD-AAA" } }),
    );
    expect(where).toEqual({
      OR: expect.arrayContaining([
        sourceCondition(PACKAGE_OR_ORDER_TYPES, ["o-1", "pkg-1"]),
        sourceCondition(["membership"], ["o-1", "mp-1"]),
        sourceCondition(["boost"], ["boost-1"]),
        sourceCondition(["penalty"], ["rr-1"]),
      ]),
    });
  });

  it("paketsiz sipariş yalnız kendi id'siyle aranır", async () => {
    const { client } = makePrisma({ order: { id: "o-1", packageId: null } });

    const where = await invoiceProcessWhere(client, "ORD-AAA");

    expect(where).toEqual({
      OR: [
        {
          type: { in: expect.arrayContaining(PACKAGE_OR_ORDER_TYPES) },
          sourceId: { in: ["o-1"] },
        },
        { type: { in: ["membership"] }, sourceId: { in: ["o-1"] } },
      ],
    });
  });

  it.each(["BST-AAA", "MEM-AAA"])(
    "%s de sipariş numarasıdır ve aynı yoldan çözülür",
    async (code) => {
      const { client, prisma } = makePrisma({
        order: { id: "o-x", packageId: null },
      });

      await invoiceProcessWhere(client, code);

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orderNumber: code } }),
      );
    },
  );

  it("TKS numarası takasın nakit ödemelerine çevrilir", async () => {
    const { client, prisma } = makePrisma({
      trade: { cashPayments: [{ id: "tcp-1" }, { id: "tcp-2" }] },
    });

    const where = await invoiceProcessWhere(client, "TKS-AAA");

    expect(prisma.trade.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tradeNumber: "TKS-AAA" } }),
    );
    expect(where).toEqual({
      OR: [
        {
          type: {
            in: expect.arrayContaining([
              "trade_commission",
              "trade_service_fee",
              "trade_shipping",
            ]),
          },
          sourceId: { in: ["tcp-1", "tcp-2"] },
        },
      ],
    });
  });

  it("RFD numarası iade talebine (ceza faturası) çevrilir", async () => {
    const { client, prisma } = makePrisma({
      refundRequestByNumber: { id: "rr-1" },
    });

    const where = await invoiceProcessWhere(client, "RFD-AAA");

    expect(prisma.refundRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { refundNumber: "RFD-AAA" } }),
    );
    expect(where).toEqual({
      OR: [{ type: { in: ["penalty"] }, sourceId: { in: ["rr-1"] } }],
    });
  });

  it.each(["ORD-YOK", "TKS-YOK", "RFD-YOK"])(
    "bulunamayan %s boş sonuç verir — filtre sessizce düşmez",
    async (code) => {
      const { client } = makePrisma();

      await expect(invoiceProcessWhere(client, code)).resolves.toEqual(
        NO_INVOICE_MATCH,
      );
    },
  );

  it("işlemin faturalarını ters çeviren iade faturalarını da getirir (kısmi anahtar dahil)", async () => {
    const { client, prisma } = makePrisma({
      refundRequestByNumber: { id: "rr-1" },
      originals: [{ id: "inv-1" }, { id: "inv-2" }],
    });

    const where = await invoiceProcessWhere(client, "RFD-AAA");

    const direct = { type: { in: ["penalty"] }, sourceId: { in: ["rr-1"] } };
    expect(prisma.elogoInvoice.findMany).toHaveBeenCalledWith({
      where: { OR: [direct] },
      select: { id: true },
    });
    expect(where).toEqual({
      OR: [
        direct,
        {
          type: "return_invoice",
          OR: [
            { sourceId: { in: ["inv-1", "inv-2"] } },
            { sourceId: { startsWith: "inv-1:" } },
            { sourceId: { startsWith: "inv-2:" } },
          ],
        },
      ],
    });
  });
});
