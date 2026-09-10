import {
  contextFromOrigin,
  EMPTY_INVOICE_PARTIES,
  resolveInvoiceParties,
} from "./invoice-parties";

/**
 * Faturanın `source_id` alanı TİPSİZDİR: türüne göre koliyi, siparişi, takas
 * ödemesini, boost'u, üyelik ödemesini, iade talebini ya da başka bir faturayı
 * gösterir. Admin fatura ekranının "Satıcı", "Alıcı" ve "Sipariş Gerçekleşme
 * Şekli" kolonları ile taraf sekmeleri buna dayandığı için her dalın doğru
 * tabloya gitmesi kilitlenir — yanlış dal sessizce BOŞ kolon üretir, hata vermez.
 */

interface PrismaStub {
  elogoInvoice: { findUnique: jest.Mock };
  tradeCashPayment: { findUnique: jest.Mock };
  refundRequest: { findUnique: jest.Mock };
  productBoost: { findUnique: jest.Mock };
  membershipPayment: { findUnique: jest.Mock };
  orderPackage: { findUnique: jest.Mock };
  order: { findUnique: jest.Mock };
}

function makePrisma(
  overrides: Partial<Record<keyof PrismaStub, unknown>> = {},
) {
  const empty = () => ({ findUnique: jest.fn().mockResolvedValue(null) });
  const prisma: PrismaStub = {
    elogoInvoice: empty(),
    tradeCashPayment: empty(),
    refundRequest: empty(),
    productBoost: empty(),
    membershipPayment: empty(),
    orderPackage: empty(),
    order: empty(),
    ...(overrides as Partial<PrismaStub>),
  };
  return prisma as unknown as Parameters<typeof resolveInvoiceParties>[0];
}

const resolved = (value: unknown) => ({
  findUnique: jest.fn().mockResolvedValue(value),
});

describe("resolveInvoiceParties", () => {
  it("ücret belgesini KOLİDEN çözer ve gerçekleşme şeklini kolinin siparişinden alır", async () => {
    const prisma = makePrisma({
      orderPackage: resolved({
        sellerId: "seller-1",
        buyerId: "buyer-1",
        orders: [{ origin: "offer" }],
      }),
    });

    await expect(
      resolveInvoiceParties(prisma, "seller_commission", "pkg-1"),
    ).resolves.toEqual({
      sellerUserId: "seller-1",
      buyerUserId: "buyer-1",
      context: "offer",
    });
  });

  it("kolisi olmayan eski ücret belgesi SİPARİŞ anahtarından çözülür", async () => {
    const prisma = makePrisma({
      order: resolved({
        sellerId: "seller-2",
        buyerId: "buyer-2",
        origin: "direct_sale",
      }),
    });

    await expect(
      resolveInvoiceParties(prisma, "commission", "order-2"),
    ).resolves.toEqual({
      sellerUserId: "seller-2",
      buyerUserId: "buyer-2",
      context: "direct_sale",
    });
  });

  it("takasta ÖDEYEN taraf alıcı, karşı taraf satıcı olur", async () => {
    const prisma = makePrisma({
      tradeCashPayment: resolved({
        payerId: "receiver-1",
        trade: { initiatorId: "initiator-1", receiverId: "receiver-1" },
      }),
    });

    await expect(
      resolveInvoiceParties(prisma, "trade_service_fee", "tcp-1"),
    ).resolves.toEqual({
      sellerUserId: "initiator-1",
      buyerUserId: "receiver-1",
      context: "trade",
    });
  });

  it("ceza faturası taraflarını iade talebinin siparişinden alır", async () => {
    const prisma = makePrisma({
      refundRequest: resolved({
        order: {
          sellerId: "seller-3",
          buyerId: "buyer-3",
          origin: "platform_service",
        },
      }),
    });

    await expect(
      resolveInvoiceParties(prisma, "penalty", "rfd-1"),
    ).resolves.toEqual({
      sellerUserId: "seller-3",
      buyerUserId: "buyer-3",
      context: "platform_service",
    });
  });

  it("öne çıkarmada satıcı platform kullanıcısı, alıcı boost'u alandır", async () => {
    const prisma = makePrisma({
      productBoost: resolved({ userId: "advertiser-1", orderId: "order-9" }),
      order: resolved({ sellerId: "platform-user" }),
    });

    await expect(
      resolveInvoiceParties(prisma, "boost", "boost-1"),
    ).resolves.toEqual({
      sellerUserId: "platform-user",
      buyerUserId: "advertiser-1",
      context: "platform_service",
    });
  });

  it("üyelik belgesi sipariş anahtarlı değilse ÜYELİK ÖDEMESİNDEN çözülür", async () => {
    const prisma = makePrisma({
      membershipPayment: resolved({
        order: {
          sellerId: "platform-user",
          buyerId: "member-1",
          origin: "platform_service",
        },
      }),
    });

    await expect(
      resolveInvoiceParties(prisma, "membership", "mp-1"),
    ).resolves.toEqual({
      sellerUserId: "platform-user",
      buyerUserId: "member-1",
      context: "platform_service",
    });
  });

  it("iade faturası taraflarını ters çevirdiği belgeden devralır (kısmi iade anahtarı dahil)", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      sellerUserId: "seller-4",
      buyerUserId: "buyer-4",
      context: "direct_sale",
    });
    const prisma = makePrisma({ elogoInvoice: { findUnique } });

    await expect(
      resolveInvoiceParties(prisma, "return_invoice", "inv-4:attempt-7"),
    ).resolves.toEqual({
      sellerUserId: "seller-4",
      buyerUserId: "buyer-4",
      context: "direct_sale",
    });
    // Kısmi iadenin `<faturaId>:<refundAttemptId>` anahtarı, faturayı ararken
    // ayrıştırılmazsa hiçbir kayıt eşleşmez ve kolonlar sessizce boş kalır.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-4" } }),
    );
  });

  it("kaynak bulunamazsa boş döner — fatura kesimi bu yüzden durmamalı", async () => {
    await expect(
      resolveInvoiceParties(makePrisma(), "seller_shipping", "yok"),
    ).resolves.toEqual(EMPTY_INVOICE_PARTIES);
  });

  it("okuma hatası fırlatmaz, boş taraf döner", async () => {
    const prisma = makePrisma({
      orderPackage: {
        findUnique: jest.fn().mockRejectedValue(new Error("db down")),
      },
    });

    await expect(
      resolveInvoiceParties(prisma, "buyer_commission", "pkg-x"),
    ).resolves.toEqual(EMPTY_INVOICE_PARTIES);
  });
});

describe("contextFromOrigin", () => {
  it("sipariş kaynağını fatura bağlamına birebir çevirir", () => {
    expect(contextFromOrigin("direct_sale")).toBe("direct_sale");
    expect(contextFromOrigin("offer")).toBe("offer");
    expect(contextFromOrigin("platform_service")).toBe("platform_service");
  });

  it("kaynağı olmayan belgede null döner", () => {
    expect(contextFromOrigin(null)).toBeNull();
    expect(contextFromOrigin(undefined)).toBeNull();
  });
});
