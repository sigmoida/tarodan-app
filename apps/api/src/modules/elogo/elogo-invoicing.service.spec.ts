import { ConfigService } from "@nestjs/config";
import { ElogoInvoicingService } from "./elogo-invoicing.service";
import { ElogoService } from "./elogo.service";

function fakeConfig(values: Record<string, string> = {}): ConfigService {
  const base: Record<string, string> = {
    ELOGO_COMPANY_VKN: "7620277268",
    ELOGO_COMPANY_TITLE: "TARODAN",
    ELOGO_VAT_RATE: "20",
    ELOGO_AMOUNTS_INCLUDE_VAT: "true",
    ELOGO_INVOICE_PREFIX: "TRD",
    ELOGO_INVOICE_XSLT_UUID: "XSLT-UUID",
    ...values,
  };
  return {
    get: (k: string, d?: string) => (k in base ? base[k] : d),
  } as unknown as ConfigService;
}

/** Minimal in-memory Prisma mock — sadece ElogoInvoicingService'in kullandığı yollar. */
function makePrisma(seed: any = {}) {
  const invoices: any[] = [];
  let seq = 0;
  let idCounter = 0;
  const store = {
    seq: () => seq,
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
      findMany: jest.fn(async ({ where }: any) => {
        return invoices.filter((i) => {
          if (where.sourceId && i.sourceId !== where.sourceId) return false;
          if (
            where.billingReference &&
            i.billingReference !== where.billingReference
          )
            return false;
          if (where.type?.in && !where.type.in.includes(i.type)) return false;
          if (typeof where.type === "string" && i.type !== where.type)
            return false;
          if (where.status?.in && !where.status.in.includes(i.status))
            return false;
          if (where.status?.not && i.status === where.status.not) return false;
          if (
            where.attemptCount?.lt != null &&
            !(i.attemptCount < where.attemptCount.lt)
          )
            return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }: any) => {
        const rec = {
          id: `inv-${++idCounter}`,
          attemptCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          originalTotal: data.total,
          ...data,
        };
        invoices.push(rec);
        return rec;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const rec = invoices.find((i) => i.id === where.id);
        if (!rec) throw new Error("not found");
        for (const [k, v] of Object.entries<any>(data)) {
          rec[k] =
            v && typeof v === "object" && "increment" in v
              ? (rec[k] ?? 0) + v.increment
              : v;
        }
        return rec;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rec = invoices.find(
          (i) =>
            i.id === where.id &&
            (where.status == null || i.status === where.status) &&
            (where.attemptCount == null ||
              i.attemptCount === where.attemptCount) &&
            (where.lastAttemptAt === undefined ||
              i.lastAttemptAt === where.lastAttemptAt),
        );
        if (!rec) return { count: 0 };
        for (const [k, v] of Object.entries<any>(data)) {
          rec[k] =
            v && typeof v === "object" && "increment" in v
              ? (rec[k] ?? 0) + v.increment
              : v;
        }
        return { count: 1 };
      }),
    },
    elogoDocSequence: {
      upsert: jest.fn(async () => ({ lastValue: ++seq })),
    },
    order: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.orders?.[where.id] ?? null,
      ),
    },
    commissionLedger: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.ledgers?.[where.orderId] ?? null,
      ),
    },
    membershipPayment: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.memberships?.[where.id] ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: any) =>
          Object.values<any>(seed.memberships ?? {}).find(
            (m) => m.providerPaymentId === where.providerPaymentId,
          ) ?? null,
      ),
    },
    productBoost: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id
          ? (seed.boosts?.[where.id] ?? null)
          : (Object.entries<any>(seed.boosts ?? {})
              .map(([id, b]) => ({ id, ...b }))
              .find((b) => b.orderId === where.orderId) ?? null),
      ),
    },
    tradeCashPayment: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.tradeCash?.[where.id] ?? null,
      ),
    },
    payment: {
      findFirst: jest.fn(
        async ({ where }: any) => seed.payments?.[where.orderId] ?? null,
      ),
    },
    refundAttempt: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.refundAttempts?.[where.id] ?? null,
      ),
    },
    address: {
      findFirst: jest.fn(
        async ({ where }: any) => seed.addresses?.[where.userId] ?? null,
      ),
    },
    user: {
      findUnique: jest.fn(
        async ({ where }: any) => seed.users?.[where.id] ?? null,
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(store)),
  };
  return store as any;
}

function makeElogo(over: Partial<Record<string, any>> = {}): ElogoService {
  return {
    isEnabled: jest.fn(() => true),
    checkUser: jest.fn(async () => null),
    sendDocument: jest.fn(async () => ({
      success: true,
      code: 1,
      refId: 999,
      documentUuid: "u",
    })),
    cancelEArchiveInvoice: jest.fn(async () => ({ success: true, code: 1 })),
    getEArchiveInvoicePdf: jest.fn(async () => null),
    getDocumentStatus: jest.fn(async () => ({
      documentUuid: "u",
      status: -1,
    })),
    refundStrategy: jest.fn(() => "CANCEL"),
    ...over,
  } as unknown as ElogoService;
}

describe("ElogoInvoicingService", () => {
  it("komisyon: satıcıya e-Arşiv keser, KDV-dahil 120 → matrah 100, gönderim şekli marker", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    const params = (elogo.sendDocument as jest.Mock).mock.calls[0][0];
    expect(params.documentType).toBe("EARCHIVE");
    expect(params.documentNumber).toMatch(/^TRD\d{13}$/);
    expect(params.ublXml).toContain("<cbc:ID>gonderimSekli</cbc:ID>");
    expect(params.ublXml).toContain("100.00"); // matrah
    expect(params.xsltUuid).toBe("XSLT-UUID");
    const rec = prisma.invoices[0];
    expect(rec.status).toBe("sent");
    expect(Number(rec.total)).toBeCloseTo(120, 2);
    expect(Number(rec.taxAmount)).toBeCloseTo(20, 2);
  });

  it("alıcı adresi UBL PostalAddress'e yazılır (Country-only şema hatası önlenir)", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
      addresses: {
        s1: {
          city: "Bursa",
          district: "Nilüfer",
          address: "Koleksiyon Sok. No:3",
        },
      },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());
    await svc.issueCommissionInvoice("o1");
    const xml = (elogo.sendDocument as jest.Mock).mock.calls[0][0].ublXml;
    expect(xml).toContain("<cbc:CityName>Bursa</cbc:CityName>");
    expect(xml).toContain(
      "<cbc:CitySubdivisionName>Nilüfer</cbc:CitySubdivisionName>",
    );
  });

  it("adres yoksa fallback ile geçerli PostalAddress (yalnız Country olmaz)", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());
    await svc.issueCommissionInvoice("o1");
    const xml = (elogo.sendDocument as jest.Mock).mock.calls[0][0].ublXml;
    expect(xml).toContain("<cbc:CityName>Belirtilmemiş</cbc:CityName>");
  });

  it('idempotency: zaten "sent" kayıt varsa tekrar göndermez', async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    prisma.invoices.push({
      id: "pre",
      type: "commission",
      sourceId: "o1",
      status: "sent",
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");
    expect(elogo.sendDocument).not.toHaveBeenCalled();
  });

  it("hizmet bedeli: buyerFee=0 ise fatura kesilmez", async () => {
    const prisma = makePrisma({
      orders: { o1: { buyerId: "b1" } },
      ledgers: { o1: { buyerFee: 0, refundedBuyerFee: 0 } },
      users: { b1: { displayName: "Alıcı" } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueServiceFeeInvoice("o1");
    expect(elogo.sendDocument).not.toHaveBeenCalled();
  });

  it("e-Fatura: alıcı GİB mükellefiyse EINVOICE + alias, gönderim şekli YOK", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 240, refundedSellerCommission: 0 } },
      users: {
        s1: {
          displayName: "Kurumsal A.Ş.",
          taxId: "1234567890",
          companyName: "Kurumsal A.Ş.",
        },
      },
    });
    const elogo = makeElogo({
      checkUser: jest.fn(async () => ({
        identifier: "1234567890",
        isEInvoiceUser: true,
        eInvoicePkAlias: "urn:mail:pk",
      })),
    });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");

    const params = (elogo.sendDocument as jest.Mock).mock.calls[0][0];
    expect(params.documentType).toBe("EINVOICE");
    expect(params.alias).toBe("urn:mail:pk");
    expect(params.ublXml).toContain(
      "<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>",
    );
    expect(params.ublXml).not.toContain("gonderimSekli");
  });

  it("komisyon: kısmi iade → NET komisyon faturalanır (#88)", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 48 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(72, 2); // 120 - 48
  });

  it("komisyon: tam iade (net ≤ 0) → fatura kesilmez (#88)", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 120 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).not.toHaveBeenCalled();
  });

  it("üyelik: üyeye fatura keser (membershipPayment.amount)", async () => {
    const prisma = makePrisma({
      memberships: { mp1: { amount: 99.99, membership: { userId: "u1" } } },
      users: { u1: { displayName: "Üye", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueMembershipInvoice("mp1");
    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].type).toBe("membership");
  });

  it("iade ≤8 gün: e-Arşiv İPTAL edilir", async () => {
    const prisma = makePrisma();
    prisma.invoices.push({
      id: "i1",
      type: "commission",
      sourceId: "o1",
      documentType: "EARCHIVE",
      status: "sent",
      ettn: "ettn-1",
      invoiceNumber: "TRD2026000000001",
      elogoRefId: "42",
      issuedAt: new Date(),
    });
    const elogo = makeElogo({ refundStrategy: jest.fn(() => "CANCEL") });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.handleOrderRefund("o1");
    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith("ettn-1", "42");
    expect(prisma.invoices[0].status).toBe("cancelled");
  });

  it("kısmi iade: orijinali iptal etmez, attempt-bazlı tutar kadar IADE faturası keser", async () => {
    const finalizedAt = new Date("2026-07-20T10:00:00Z");
    const issuedAt = new Date("2026-07-18T10:00:00Z");
    const prisma = makePrisma({
      refundAttempts: {
        ra1: {
          id: "ra1",
          orderId: "o1",
          status: "finalized",
          finalizedAt,
        },
      },
      ledgers: {
        o1: {
          sellerCommission: 120,
          refundedSellerCommission: 30,
          buyerFee: 0,
          refundedBuyerFee: 0,
        },
      },
      users: { s1: { displayName: "Satıcı", taxId: null } },
    });
    prisma.invoices.push({
      id: "i1",
      type: "commission",
      sourceId: "o1",
      documentType: "EARCHIVE",
      status: "sent",
      ettn: "ettn-1",
      invoiceNumber: "TRD2026000000001",
      issuedAt,
      sentAt: issuedAt,
      recipientUserId: "s1",
      recipientVknTckn: "11111111111",
      recipientName: "Satıcı",
      netAmount: 100,
      taxAmount: 20,
      total: 120,
      originalTotal: 120,
      vatRate: 20,
      attemptCount: 1,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
    const elogo = makeElogo({ refundStrategy: jest.fn(() => "CANCEL") });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());
    const adjustment = {
      orderId: "o1",
      refundAttemptId: "ra1",
      refundRatio: 0.25,
      fullyRefunded: false,
    };

    await svc.handleOrderRefund("o1", adjustment);
    await svc.handleOrderRefund("o1", adjustment);

    expect(elogo.cancelEArchiveInvoice).not.toHaveBeenCalled();
    const returns = prisma.invoices.filter((i) => i.type === "return_invoice");
    expect(returns).toHaveLength(1);
    expect(returns[0].sourceId).toBe("i1:ra1");
    expect(Number(returns[0].total)).toBeCloseTo(30, 2);
    expect(returns[0].billingReferenceIssueDate).toEqual(issuedAt);
  });

  it("pending fatura kısmi iade sonrası güncel ledger netine düşürülür", async () => {
    const finalizedAt = new Date("2026-07-20T10:00:00Z");
    const prisma = makePrisma({
      refundAttempts: {
        ra1: {
          id: "ra1",
          orderId: "o1",
          status: "finalized",
          finalizedAt,
        },
      },
      ledgers: {
        o1: {
          sellerCommission: 120,
          refundedSellerCommission: 30,
          buyerFee: 0,
          refundedBuyerFee: 0,
        },
      },
    });
    prisma.invoices.push({
      id: "i1",
      type: "commission",
      sourceId: "o1",
      documentType: "EARCHIVE",
      status: "failed",
      invoiceNumber: "TRD2026000000001",
      ettn: "ettn-1",
      netAmount: 100,
      taxAmount: 20,
      total: 120,
      originalTotal: 120,
      vatRate: 20,
      attemptCount: 1,
      createdAt: new Date("2026-07-18T10:00:00Z"),
      updatedAt: new Date("2026-07-18T10:00:00Z"),
    });
    const svc = new ElogoInvoicingService(prisma, makeElogo(), fakeConfig());

    await svc.handleOrderRefund("o1", {
      orderId: "o1",
      refundAttemptId: "ra1",
      refundRatio: 0.25,
      fullyRefunded: false,
    });

    expect(prisma.invoices[0].status).toBe("pending");
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(90, 2);
    expect(prisma.invoices[0].refundAdjustedAt).toEqual(finalizedAt);
  });

  it("takas komisyonu: ödeyene e-Arşiv keser (TradeCashPayment.commission)", async () => {
    const prisma = makePrisma({
      tradeCash: { tcp1: { payerId: "p1", commission: 60 } },
      users: { p1: { displayName: "Ödeyen", taxId: null } },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueTradeCashCommissionInvoice("tcp1");
    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].type).toBe("trade_commission");
  });

  it("takas iadesi: takas komisyon faturasını iptal eder", async () => {
    const prisma = makePrisma();
    prisma.invoices.push({
      id: "t1",
      type: "trade_commission",
      sourceId: "tcp1",
      documentType: "EARCHIVE",
      status: "sent",
      ettn: "te1",
      invoiceNumber: "TRD2026000000009",
      elogoRefId: "9",
      issuedAt: new Date(),
    });
    const elogo = makeElogo({ refundStrategy: jest.fn(() => "CANCEL") });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.handleTradeCashRefund("tcp1");
    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith("te1", "9");
    expect(prisma.invoices[0].status).toBe("cancelled");
  });

  it("iade: boost faturasını da iptal eder (orderId → boost)", async () => {
    const prisma = makePrisma({ boosts: { b1: { orderId: "o1" } } });
    prisma.invoices.push({
      id: "i1",
      type: "boost",
      sourceId: "b1",
      documentType: "EARCHIVE",
      status: "sent",
      ettn: "e1",
      invoiceNumber: "TRD2026000000001",
      elogoRefId: "1",
      issuedAt: new Date(),
    });
    const elogo = makeElogo({ refundStrategy: jest.fn(() => "CANCEL") });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.handleOrderRefund("o1");
    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith("e1", "1");
    expect(prisma.invoices[0].status).toBe("cancelled");
  });

  it("iade >8 gün: komisyon + hizmet bedeli için AYRI iade faturası (çakışma yok)", async () => {
    const prisma = makePrisma({
      users: { r1: { displayName: "X", taxId: null } },
    });
    const old = new Date("2026-06-01");
    for (const [id, type, ettn, num, net] of [
      ["c1", "commission", "ec", "TRDc", 100],
      ["s1", "service_fee", "es", "TRDs", 5],
    ] as const) {
      prisma.invoices.push({
        id,
        type,
        sourceId: "o1",
        documentType: "EARCHIVE",
        status: "sent",
        ettn,
        invoiceNumber: num,
        issuedAt: old,
        recipientUserId: "r1",
        recipientVknTckn: "11111111111",
        recipientName: "X",
        netAmount: net,
        vatRate: 20,
      });
    }
    const elogo = makeElogo({
      refundStrategy: jest.fn(() => "RETURN_INVOICE"),
    });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.handleOrderRefund("o1");
    const returns = prisma.invoices.filter((i) => i.type === "return_invoice");
    expect(returns).toHaveLength(2); // çakışma yok: sourceId = orijinal fatura id
    expect(returns.map((r) => r.sourceId).sort()).toEqual(["c1", "s1"]);
  });

  it("platform satışı: komisyon ATLANIR, alıcıya platform_sale e-Arşivi kesilir", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "plat", buyerId: "b1", totalAmount: 237.31 } },
      ledgers: {
        o1: {
          sellerCommission: 14.51,
          refundedSellerCommission: 0,
          buyerFee: 0,
          refundedBuyerFee: 0,
        },
      },
      users: {
        plat: { displayName: "Tarodan Official Store", sellerType: "platform" },
        b1: { displayName: "Alıcı", taxId: null },
      },
    });
    const elogo = makeElogo();
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1"); // platform satıcı → komisyon kesilmez
    expect(elogo.sendDocument).not.toHaveBeenCalled();

    await svc.issuePlatformSaleInvoice("o1"); // alıcıya ürün e-Arşivi
    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].type).toBe("platform_sale");
    expect(prisma.invoices[0].recipientUserId).toBe("b1");
  });

  it("eLogo kapalıysa göndermez ama retry için pending kayıt bırakır", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    const elogo = makeElogo({ isEnabled: jest.fn(() => false) });
    const svc = new ElogoInvoicingService(prisma, elogo, fakeConfig());

    await svc.issueCommissionInvoice("o1");
    expect(elogo.sendDocument).not.toHaveBeenCalled();
    expect(prisma.invoices).toHaveLength(1);
    expect(prisma.invoices[0].status).toBe("pending");
  });
});
