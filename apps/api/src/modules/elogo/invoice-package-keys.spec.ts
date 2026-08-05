import { ConfigService } from "@nestjs/config";
import { ElogoInvoicingService } from "./elogo-invoicing.service";
import { ElogoService } from "./elogo.service";

/**
 * Komisyon ve hizmet bedeli faturaları SATICI PAKETİ başına kesilir
 * (`sourceId = orderPackage.id`). Bu dosya, o faturaları TÜKETEN yolların da aynı
 * anahtarı kullandığını kilitler.
 *
 * Yazma yolu pakete taşındığında okuma yolları taşınmamıştı: iade `sourceId`
 * olarak SİPARİŞ id'si arıyordu, hiçbir zaman eşleşmiyordu ve iade edilen bir
 * hizmet bedelinin faturası GİB'de duruyordu. Aynı sebeple sipariş detayındaki
 * "Faturayı İndir" hiç çıkmıyordu.
 *
 * Buradaki senaryolarda paket id'si sipariş id'sinden FARKLIDIR (`pkg1` vs `o1`) —
 * ikisinin aynı olduğu tek ürünlü kurgu bu hatayı gizliyordu.
 */

function fakeConfig(): ConfigService {
  const base: Record<string, string> = {
    ELOGO_COMPANY_VKN: "7620277268",
    ELOGO_COMPANY_TITLE: "TARODAN",
    ELOGO_VAT_RATE: "20",
    ELOGO_INVOICE_PREFIX: "TRD",
  };
  return {
    get: (k: string, d?: string) => (k in base ? base[k] : d),
  } as unknown as ConfigService;
}

/**
 * Paket `pkg1` = satıcı s1'in iki siparişi (o1, o2). Her siparişin komisyonu 60,
 * alıcı ücreti 25 → paket matrahı 120 / 50.
 */
function makePrisma(over: { ledgers?: Record<string, any> } = {}) {
  const invoices: any[] = [];
  let seq = 0;
  let idCounter = 0;

  const orders: Record<string, any> = {
    o1: { id: "o1", packageId: "pkg1", sellerId: "s1", buyerId: "b1" },
    o2: { id: "o2", packageId: "pkg1", sellerId: "s1", buyerId: "b1" },
  };
  const ledgers: Record<string, any> = over.ledgers ?? {
    o1: {
      sellerCommission: 60,
      refundedSellerCommission: 0,
      buyerFee: 25,
      refundedBuyerFee: 0,
    },
    o2: {
      sellerCommission: 60,
      refundedSellerCommission: 0,
      buyerFee: 25,
      refundedBuyerFee: 0,
    },
  };

  const matches = (i: any, where: any): boolean => {
    if (where.id && i.id !== where.id) return false;
    if (where.sourceId) {
      if (typeof where.sourceId === "string" && i.sourceId !== where.sourceId)
        return false;
      if (where.sourceId.in && !where.sourceId.in.includes(i.sourceId))
        return false;
    }
    if (where.recipientUserId && i.recipientUserId !== where.recipientUserId)
      return false;
    if (where.billingReference && i.billingReference !== where.billingReference)
      return false;
    if (where.type?.in && !where.type.in.includes(i.type)) return false;
    if (typeof where.type === "string" && i.type !== where.type) return false;
    if (where.status?.in && !where.status.in.includes(i.status)) return false;
    if (where.status?.not && i.status === where.status.not) return false;
    return true;
  };

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
      findFirst: jest.fn(
        async ({ where }: any) =>
          invoices.find((i) => matches(i, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        invoices.filter((i) => matches(i, where)),
      ),
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
        if (!rec) throw new Error("not found");
        Object.assign(rec, data);
        return rec;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rec = invoices.find(
          (i) =>
            i.id === where.id &&
            (where.status == null || i.status === where.status),
        );
        if (!rec) return { count: 0 };
        Object.assign(rec, data);
        return { count: 1 };
      }),
    },
    elogoDocSequence: { upsert: jest.fn(async () => ({ lastValue: ++seq })) },
    order: {
      findUnique: jest.fn(async ({ where }: any) => orders[where.id] ?? null),
      count: jest.fn(async () => 0),
    },
    orderPackage: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === "pkg1"
          ? {
              sellerId: "s1",
              buyerId: "b1",
              orders: Object.values(orders).map((o) => ({
                id: o.id,
                sellerCommissionAmount: 60,
                sellerPlatformFeeAmount: 0,
                buyerServiceFeeAmount: 25,
                buyerCommissionAmount: 0,
                shippingAddress: null,
              })),
            }
          : null,
      ),
    },
    commissionLedger: {
      findUnique: jest.fn(
        async ({ where }: any) => ledgers[where.orderId] ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.orderId?.in ?? [])
          .map((id: string) => ledgers[id])
          .filter(Boolean),
      ),
    },
    productBoost: { findUnique: jest.fn(async () => null) },
    membershipPayment: { findFirst: jest.fn(async () => null) },
    payment: { findFirst: jest.fn(async () => null) },
    refundAttempt: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id,
        orderId: "o1",
        status: "finalized",
        finalizedAt: new Date("2026-08-04T09:00:00.000Z"),
      })),
    },
    address: { findFirst: jest.fn(async () => null) },
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({
        displayName: where.id === "s1" ? "Satıcı" : "Alıcı",
        email: `${where.id}@example.com`,
        taxId: null,
      })),
    },
    $transaction: jest.fn(async (fn: any) => fn(store)),
  };
  return store;
}

function makeElogo(over: Record<string, any> = {}): ElogoService {
  return {
    isEnabled: jest.fn(() => true),
    checkUser: jest.fn(async () => null),
    sendDocument: jest.fn(async () => ({ success: true, code: 1, refId: 9 })),
    cancelEArchiveInvoice: jest.fn(async () => ({ success: true, code: 1 })),
    getEArchiveInvoicePdf: jest.fn(async () => null),
    getDocumentStatus: jest.fn(async () => ({ documentUuid: "u", status: -1 })),
    refundStrategy: jest.fn(() => "CANCEL"),
    ...over,
  } as unknown as ElogoService;
}

/** Gönderilmiş (sent) paket faturası kaydı. */
function sentPackageInvoice(type: "commission" | "service_fee", total: number) {
  return {
    id: `${type}-inv`,
    type,
    sourceId: "pkg1",
    recipientUserId: type === "commission" ? "s1" : "b1",
    recipientVknTckn: "11111111111",
    recipientName: type === "commission" ? "Satıcı" : "Alıcı",
    documentType: "EARCHIVE",
    invoiceNumber: "TRD2026000000001",
    ettn: "ettn-1",
    netAmount: total / 1.2,
    taxAmount: total - total / 1.2,
    total,
    originalTotal: total,
    vatRate: 20,
    status: "sent",
    issuedAt: new Date("2026-08-01T09:00:00.000Z"),
    attemptCount: 1,
  };
}

const refundAdjustment = (over: Record<string, unknown> = {}) => ({
  orderId: "o1",
  refundAttemptId: "ra1",
  refundRatio: 0.5,
  fullyRefunded: false,
  ...over,
});

describe("paket anahtarlı fatura tüketicileri", () => {
  it("iade, PAKET anahtarlı komisyon faturasını tersler", async () => {
    const prisma = makePrisma();
    // 120 matrah + 24 KDV; o1'in payı 60 → yarısı iade edilir.
    prisma.invoices.push(sentPackageInvoice("commission", 144));
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma as any, elogo, fakeConfig());

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ sellerFeeRefundAmount: 60 }) as any,
    );

    const returns = prisma.invoices.filter(
      (i: any) => i.type === "return_invoice",
    );
    expect(returns).toHaveLength(1);
    expect(returns[0].billingReference).toBe("TRD2026000000001");
    // Paket matrahı 120, iade edilen 60 → oran 0.5 → 144'ün yarısı.
    expect(Number(returns[0].total)).toBeCloseTo(72, 2);
  });

  it("iade, PAKET anahtarlı hizmet bedeli faturasını tersler", async () => {
    const prisma = makePrisma();
    // 50 matrah + 10 KDV = 60; o1'in payı 25 → yarısı iade edilir.
    prisma.invoices.push(sentPackageInvoice("service_fee", 60));
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma as any, elogo, fakeConfig());

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ buyerFeeRefundAmount: 25 }) as any,
    );

    const returns = prisma.invoices.filter(
      (i: any) => i.type === "return_invoice",
    );
    expect(returns).toHaveLength(1);
    expect(Number(returns[0].total)).toBeCloseTo(30, 2);
  });

  it("paketin TAMAMI iade edilirse e-Arşiv iptal edilir", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(sentPackageInvoice("commission", 144));
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma as any, elogo, fakeConfig());

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({
        refundRatio: 1,
        fullyRefunded: true,
        sellerFeeRefundAmount: 120,
      }) as any,
    );

    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].status).toBe("cancelled");
  });

  it("SİPARİŞ anahtarlı eski faturalar da terslenmeye devam eder", async () => {
    const prisma = makePrisma();
    const legacy = sentPackageInvoice("commission", 144);
    legacy.sourceId = "o1"; // paket anahtarına geçilmeden önce kesilmiş kayıt
    prisma.invoices.push(legacy);
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma as any, elogo, fakeConfig());

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({
        refundRatio: 1,
        fullyRefunded: true,
        sellerFeeRefundAmount: 60,
      }) as any,
    );

    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledTimes(1);
  });

  it("gönderilmemiş paket faturası iade sonrası PAKET matrahına göre yeniden fiyatlanır", async () => {
    // o1 tamamen iade edilmiş: paketin kalan komisyonu yalnız o2'nin 60'ı.
    const prisma = makePrisma({
      ledgers: {
        o1: {
          sellerCommission: 60,
          refundedSellerCommission: 60,
          buyerFee: 25,
          refundedBuyerFee: 25,
        },
        o2: {
          sellerCommission: 60,
          refundedSellerCommission: 0,
          buyerFee: 25,
          refundedBuyerFee: 0,
        },
      },
    });
    const pending = sentPackageInvoice("commission", 144);
    pending.status = "pending";
    prisma.invoices.push(pending);
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ sellerFeeRefundAmount: 60 }) as any,
    );

    const rec = prisma.invoices[0];
    expect(rec.status).toBe("pending");
    expect(Number(rec.netAmount)).toBeCloseTo(60, 2);
    expect(Number(rec.total)).toBeCloseTo(72, 2);
  });

  it("sipariş detayı, paket anahtarlı hizmet bedeli faturasını bulur", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(sentPackageInvoice("service_fee", 60));
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    const found = await svc.findOrderInvoiceForUser("o1", "b1");

    expect(found).not.toBeNull();
    expect(found!.invoiceNumber).toBe("TRD2026000000001");
  });

  it("sipariş detayı, paketteki DİĞER siparişten de aynı faturaya ulaşır", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(sentPackageInvoice("commission", 144));
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    const found = await svc.findOrderInvoiceForUser("o2", "s1");
    expect(found).not.toBeNull();
  });

  it("başka kullanıcının paket faturası sızmaz", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(sentPackageInvoice("commission", 144));
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    expect(await svc.findOrderInvoiceForUser("o1", "someone-else")).toBeNull();
  });
});

/**
 * İADE faturası, düzelttiği faturanın MUHATABINA gider — dolayısıyla alıcının
 * iletişim ve adres snapshot'ını da taşımak zorunda.
 *
 * Misafir siparişlerinde tüm alıcılar tek sistem kullanıcısını paylaşır. Snapshot
 * kopyalanmayınca iade faturası kullanıcı kaydına düşüyor, yani belge sistem
 * e-postasına gidiyor ve adres "Belirtilmemiş" olarak yazılıyordu — orijinal
 * faturada çözülmüş olan hatanın iade tarafındaki kopyası.
 */
describe("iade faturası alıcı snapshot'ı", () => {
  const guestInvoice = () => ({
    ...sentPackageInvoice("service_fee", 60),
    recipientEmail: "misafir@example.com",
    recipientCity: "İzmir",
    recipientDistrict: "Karşıyaka",
    recipientStreet: "Cumhuriyet Cad. No:5",
  });

  it("alıcı e-postası ve adresi iade faturasına kopyalanır", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(guestInvoice());
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ buyerFeeRefundAmount: 25 }) as any,
    );

    const ret = prisma.invoices.find((i: any) => i.type === "return_invoice");
    expect(ret.recipientEmail).toBe("misafir@example.com");
    expect(ret.recipientCity).toBe("İzmir");
    expect(ret.recipientDistrict).toBe("Karşıyaka");
    expect(ret.recipientStreet).toBe("Cumhuriyet Cad. No:5");
  });

  it("iade faturasının UBL'i snapshot adresini kullanır (sistem kaydını değil)", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(guestInvoice());
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma as any, elogo, fakeConfig());

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ buyerFeeRefundAmount: 25 }) as any,
    );

    const xml = (elogo.sendDocument as jest.Mock).mock.calls.at(-1)![0].ublXml;
    expect(xml).toContain("<cbc:CityName>İzmir</cbc:CityName>");
    expect(xml).toContain("misafir@example.com");
  });

  it("orijinal faturada snapshot yoksa iade faturası da boş bırakır", async () => {
    const prisma = makePrisma();
    prisma.invoices.push(sentPackageInvoice("service_fee", 60));
    const svc = new ElogoInvoicingService(
      prisma as any,
      makeElogo(),
      fakeConfig(),
    );

    await svc.handleOrderRefund(
      "o1",
      refundAdjustment({ buyerFeeRefundAmount: 25 }) as any,
    );

    const ret = prisma.invoices.find((i: any) => i.type === "return_invoice");
    expect(ret.recipientEmail ?? null).toBeNull();
  });
});
