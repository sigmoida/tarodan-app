import { ConfigService } from "@nestjs/config";
import { ElogoInvoicingService } from "./elogo-invoicing.service";
import { ElogoService } from "./elogo.service";
import { VAT_SOURCE_BY_TYPE } from "./invoice-vat-rate";

/**
 * Bir faturadaki KDV ORANI, o KDV'nin nasıl tahsil edildiğiyle aynı yerden gelmek
 * zorunda.
 *
 *  - Hizmet bedelleri checkout'ta `PlatformSetting.service_vat_rate` ile tahsil
 *    edilir → fatura da AYNI ayarı kullanmalı. Eskiden fatura `TaxRegion/TaxRule`
 *    ya da `ELOGO_VAT_RATE` env'inden okuyordu: admin ayarı değiştirince tahsil
 *    edilen KDV ile beyan edilen KDV sessizce ayrışıyordu.
 *  - Ürün satışında (platform satıcı) oran ÜRÜNÜN KATEGORİSİNDEN gelir. Tek
 *    global oran, indirimli oranlı ürünlerde (%1/%10) yanlış KDV beyan ediyordu.
 */

function fakeConfig(values: Record<string, string> = {}): ConfigService {
  const base: Record<string, string> = {
    ELOGO_COMPANY_VKN: "7620277268",
    ELOGO_COMPANY_TITLE: "TARODAN",
    ELOGO_VAT_RATE: "20",
    ELOGO_INVOICE_PREFIX: "TRD",
    ...values,
  };
  return {
    get: (k: string, d?: string) => (k in base ? base[k] : d),
  } as unknown as ConfigService;
}

function makePrisma(seed: any = {}) {
  const invoices: any[] = [];
  let seq = 0;
  let idCounter = 0;
  const store: any = {
    invoices,
    elogoInvoice: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return invoices.find((i) => i.id === where.id) ?? null;
        if (where.type_sourceId)
          return (
            invoices.find(
              (i) =>
                i.type === where.type_sourceId.type &&
                i.sourceId === where.type_sourceId.sourceId,
            ) ?? null
          );
        return null;
      }),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => {
        const rec = {
          id: `inv-${++idCounter}`,
          attemptCount: 0,
          createdAt: new Date(),
          originalTotal: data.total,
          ...data,
        };
        invoices.push(rec);
        return rec;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const rec = invoices.find((i) => i.id === where.id);
        Object.assign(rec, data);
        return rec;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rec = invoices.find((i) => i.id === where.id);
        if (!rec) return { count: 0 };
        Object.assign(rec, data);
        return { count: 1 };
      }),
    },
    elogoDocSequence: { upsert: jest.fn(async () => ({ lastValue: ++seq })) },
    order: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.orders?.[where.id] ?? null,
      ),
      count: jest.fn(async () => 0),
    },
    orderPackage: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.packages?.[where.id] ?? null,
      ),
    },
    commissionLedger: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.ledgers?.[where.orderId] ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.orderId?.in ?? [])
          .map((id: string) => seed.ledgers?.[id])
          .filter(Boolean),
      ),
    },
    productBoost: { findUnique: jest.fn(async () => null) },
    membershipPayment: { findFirst: jest.fn(async () => null) },
    payment: { findFirst: jest.fn(async () => null) },
    address: { findFirst: jest.fn(async () => null) },
    user: {
      findUnique: jest.fn(async () => ({
        displayName: "Kullanıcı",
        email: "u@example.com",
        taxId: null,
      })),
    },
    $transaction: jest.fn(async (fn: any) => fn(store)),
  };
  return store;
}

function makeElogo(): ElogoService {
  return {
    isEnabled: jest.fn(() => true),
    checkUser: jest.fn(async () => null),
    sendDocument: jest.fn(async () => ({ success: true, code: 1, refId: 9 })),
    getEArchiveInvoicePdf: jest.fn(async () => null),
    getDocumentStatus: jest.fn(async () => ({ documentUuid: "u", status: -1 })),
    refundStrategy: jest.fn(() => "CANCEL"),
  } as unknown as ElogoService;
}

/** Checkout'un kullandığı hizmet KDV'si politikası. */
function makeTaxPolicy(
  over: Partial<{ serviceVatEnabled: boolean; serviceVatRate: number }> = {},
) {
  const policy = {
    serviceVatEnabled: true,
    serviceVatRate: 18,
    withholdingRate: 1,
    withholdingAppliesToIndividual: false,
    ...over,
  };
  return {
    resolve: jest.fn(async () => policy),
    effectiveServiceVatRate: (p: any) =>
      p.serviceVatEnabled ? p.serviceVatRate : 0,
  } as any;
}

/** Kategori bazlı oran döndüren vergi servisi. */
function makeTaxService(byCategory: Record<string, number>, fallback = 20) {
  return {
    resolveTaxRate: jest.fn(
      async (_c?: string, _r?: string | null, categoryId?: string | null) => ({
        taxRateId: "t1",
        name: "KDV",
        rate: (categoryId && byCategory[categoryId]) || fallback,
      }),
    ),
  } as any;
}

const singleOrderPackage = (orderId: string, over: any = {}) => ({
  sellerId: "s1",
  buyerId: "b1",
  orders: [
    {
      id: orderId,
      sellerCommissionAmount: 100,
      sellerPlatformFeeAmount: 0,
      buyerServiceFeeAmount: 50,
      buyerCommissionAmount: 0,
      shippingAddress: null,
      ...over,
    },
  ],
});

describe("fatura KDV oranının kaynağı", () => {
  it("her fatura türünün bir oran kaynağı tanımlıdır", () => {
    for (const source of Object.values(VAT_SOURCE_BY_TYPE)) {
      expect(["service", "category", "standard"]).toContain(source);
    }
    expect(VAT_SOURCE_BY_TYPE.commission).toBe("service");
    expect(VAT_SOURCE_BY_TYPE.service_fee).toBe("service");
    expect(VAT_SOURCE_BY_TYPE.platform_sale).toBe("category");
  });

  it("komisyon faturası checkout'un hizmet KDV oranını kullanır (env'i değil)", async () => {
    const prisma = makePrisma({
      packages: { pkg1: singleOrderPackage("o1") },
      ledgers: {
        o1: {
          sellerCommission: 100,
          refundedSellerCommission: 0,
          buyerFee: 0,
          refundedBuyerFee: 0,
        },
      },
    });
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig({ ELOGO_VAT_RATE: "20" }),
      makeTaxService({}, 20),
      undefined,
      undefined,
      makeTaxPolicy({ serviceVatRate: 18 }),
    );

    await svc.issueCommissionInvoice("pkg1");

    const rec = prisma.invoices[0];
    expect(Number(rec.vatRate)).toBe(18);
    expect(Number(rec.netAmount)).toBeCloseTo(100, 2);
    expect(Number(rec.taxAmount)).toBeCloseTo(18, 2);
    expect(Number(rec.total)).toBeCloseTo(118, 2);
  });

  it("hizmet KDV'si kapalıysa fatura da KDV'siz kesilir", async () => {
    const prisma = makePrisma({
      packages: { pkg1: singleOrderPackage("o1") },
      ledgers: {
        o1: {
          sellerCommission: 0,
          refundedSellerCommission: 0,
          buyerFee: 50,
          refundedBuyerFee: 0,
        },
      },
    });
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
      makeTaxService({}, 20),
      undefined,
      undefined,
      makeTaxPolicy({ serviceVatEnabled: false }),
    );

    await svc.issueServiceFeeInvoice("pkg1");

    const rec = prisma.invoices[0];
    expect(Number(rec.vatRate)).toBe(0);
    expect(Number(rec.taxAmount)).toBe(0);
    expect(Number(rec.total)).toBeCloseTo(50, 2);
  });

  it("platform satışı ÜRÜN KATEGORİSİNİN oranını kullanır", async () => {
    const prisma = makePrisma({
      orders: {
        o1: {
          sellerId: "platform",
          buyerId: "b1",
          totalAmount: 110,
          quantity: 1,
          subtotal: 110,
          shippingCost: 0,
          buyerFeeAmount: 0,
          buyerServiceTaxAmount: 0,
          checkoutGroupId: null,
          shippingAddress: null,
          product: { title: "Kitap", categoryId: "cat-kitap" },
        },
      },
    });
    prisma.user.findUnique = jest.fn(async ({ where }: any) =>
      where.id === "platform"
        ? { sellerType: "platform" }
        : { displayName: "Alıcı", email: "b@example.com", taxId: null },
    );
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
      makeTaxService({ "cat-kitap": 10 }, 20),
      undefined,
      undefined,
      makeTaxPolicy(),
    );

    await svc.issuePlatformSaleInvoice("o1");

    const rec = prisma.invoices[0];
    // 110 KDV dahil, %10 → 100 matrah + 10 KDV. %20 ile 91.67 + 18.33 çıkardı.
    expect(Number(rec.vatRate)).toBe(10);
    expect(Number(rec.netAmount)).toBeCloseTo(100, 2);
    expect(Number(rec.taxAmount)).toBeCloseTo(10, 2);
  });

  it("politika servisi yoksa env oranına düşer (geriye uyum)", async () => {
    const prisma = makePrisma({
      packages: { pkg1: singleOrderPackage("o1") },
      ledgers: {
        o1: {
          sellerCommission: 100,
          refundedSellerCommission: 0,
          buyerFee: 0,
          refundedBuyerFee: 0,
        },
      },
    });
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig({ ELOGO_VAT_RATE: "20" }),
    );

    await svc.issueCommissionInvoice("pkg1");
    expect(Number(prisma.invoices[0].vatRate)).toBe(20);
  });
});
