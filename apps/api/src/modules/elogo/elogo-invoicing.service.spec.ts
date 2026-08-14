import { ConfigService } from "@nestjs/config";
import { ElogoInvoicingService } from "./elogo-invoicing.service";
import { ElogoDocumentService } from "./elogo-document.service";
import { ElogoDeliveryService } from "./elogo-delivery.service";
import { ElogoIssuingService } from "./elogo-issuing.service";
import { ElogoReversalService } from "./elogo-reversal.service";
import { ElogoService } from "./elogo.service";

function fakeConfig(values: Record<string, string> = {}): ConfigService {
  const base: Record<string, string> = {
    ELOGO_COMPANY_VKN: "7620277268",
    ELOGO_COMPANY_TITLE: "TARODAN",
    ELOGO_VAT_RATE: "20",
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
  const store: any = {
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
      // Paketin tüm siparişleri teslim mi? 0 = bekleyen yok (fatura kesilebilir).
      count: jest.fn(async () => seed.pendingPackageOrders ?? 0),
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
    // Komisyon/hizmet bedeli faturaları SATICI PAKETİ başına kesilir. Bu
    // dosyadaki senaryolar tek ürünlüdür, dolayısıyla paket = o siparişin
    // kendisi: aynı id ile tek siparişlik bir paket türetilir. Çok ürünlü
    // gruplama ayrıca order-checkout-group.spec.ts'te ölçülür.
    orderPackage: {
      findUnique: jest.fn(async ({ where }: any) => {
        const order = seed.orders?.[where.id];
        if (!order) return null;
        return {
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          orders: [{ id: where.id, ...order }],
        };
      }),
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
  // Komisyon MATRAH bazlıdır: ledger tutarı KDV hariçtir (KDV artık siparişte
  // ayrı kolonda), fatura KDV'yi ÜSTÜNE ekler → 120 matrah + 24 KDV = 144.
  it("komisyon: satıcıya e-Arşiv keser, matrah 120 → KDV 24, gönderim şekli marker", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    const params = (elogo.sendDocument as jest.Mock).mock.calls[0][0];
    expect(params.documentType).toBe("EARCHIVE");
    expect(params.documentNumber).toMatch(/^TRD\d{13}$/);
    expect(params.ublXml).toContain("<cbc:ID>gonderimSekli</cbc:ID>");
    expect(params.ublXml).toContain("120.00"); // matrah = saklanan tutar
    expect(params.xsltUuid).toBe("XSLT-UUID");
    const rec = prisma.invoices[0];
    expect(rec.status).toBe("sent");
    expect(Number(rec.netAmount)).toBeCloseTo(120, 2);
    expect(Number(rec.taxAmount)).toBeCloseTo(24, 2);
    expect(Number(rec.total)).toBeCloseTo(144, 2);
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(86.4, 2); // (120 − 48) matrah + %20
  });

  it("komisyon: tam iade (net ≤ 0) → fatura kesilmez (#88)", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 120 } },
      users: { s1: { displayName: "Satıcı X", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");

    expect(elogo.sendDocument).not.toHaveBeenCalled();
  });

  it("üyelik: üyeye fatura keser (membershipPayment.amount)", async () => {
    const prisma = makePrisma({
      memberships: { mp1: { amount: 99.99, membership: { userId: "u1" } } },
      users: { u1: { displayName: "Üye", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );
    const adjustment = {
      orderId: "o1",
      refundAttemptId: "ra1",
      refundRatio: 0.25,
      fullyRefunded: false,
    };

    await svc.handleOrderRefund("o1", adjustment);
    await svc.handleOrderRefund("o1", adjustment);

    expect(elogo.cancelEArchiveInvoice).not.toHaveBeenCalled();
    const returns = prisma.invoices.filter(
      (i: any) => i.type === "return_invoice",
    );
    expect(returns).toHaveLength(1);
    expect(returns[0].sourceId).toBe("i1:ra1");
    // 25 matrah + %20 KDV (komisyon matrah bazlı)
    expect(Number(returns[0].total)).toBeCloseTo(36, 2);
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = makeElogo();
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.handleOrderRefund("o1", {
      orderId: "o1",
      refundAttemptId: "ra1",
      refundRatio: 0.25,
      fullyRefunded: false,
    });

    expect(prisma.invoices[0].status).toBe("pending");
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(108, 2); // 90 matrah + %20
    expect(prisma.invoices[0].refundAdjustedAt).toEqual(finalizedAt);
  });

  it("takas v1: komisyon faturası matrah üzerinden kesilir (KDV üstüne eklenir)", async () => {
    const prisma = makePrisma({
      tradeCash: { tcp1: { payerId: "p1", commission: 60, tradeFeeAmount: 0 } },
      users: { p1: { displayName: "Ödeyen", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueTradeCashFeeInvoice("tcp1");
    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].type).toBe("trade_commission");
    expect(Number(prisma.invoices[0].netAmount)).toBeCloseTo(60, 2);
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(72, 2);
  });

  it("takas v2: hizmet bedeli KDV DAHİL kesilir (tutarın İÇİNDEN ayrıştırılır)", async () => {
    // Admin kurala KDV dahil 60 TL girdi; taraftan tahsil edilen de 60 TL'dir.
    // Fatura 72 TL çıkarsa tahsilatla fatura ayrışır — v1'in KDV yönü buraya taşınamaz.
    const prisma = makePrisma({
      tradeCash: { tcp1: { payerId: "p1", commission: 0, tradeFeeAmount: 60 } },
      users: { p1: { displayName: "Ödeyen", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueTradeCashFeeInvoice("tcp1");
    expect(prisma.invoices[0].type).toBe("trade_service_fee");
    expect(Number(prisma.invoices[0].netAmount)).toBeCloseTo(50, 2);
    expect(Number(prisma.invoices[0].taxAmount)).toBeCloseTo(10, 2);
    expect(Number(prisma.invoices[0].total)).toBeCloseTo(60, 2);
  });

  it("takas: ücretsiz satır için fatura KESMEZ", async () => {
    const prisma = makePrisma({
      tradeCash: { tcp1: { payerId: "p1", commission: 0, tradeFeeAmount: 0 } },
      users: { p1: { displayName: "Ödeyen", taxId: null } },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueTradeCashFeeInvoice("tcp1");
    expect(elogo.sendDocument).not.toHaveBeenCalled();
  });

  it("takas iadesi: v2 hizmet bedeli faturasını da iptal eder", async () => {
    const prisma = makePrisma();
    prisma.invoices.push({
      id: "t2",
      type: "trade_service_fee",
      sourceId: "tcp2",
      documentType: "EARCHIVE",
      status: "sent",
      ettn: "te2",
      invoiceNumber: "TRD2026000000010",
      elogoRefId: "10",
      issuedAt: new Date(),
    });
    const elogo = makeElogo({ refundStrategy: jest.fn(() => "CANCEL") });
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.handleTradeCashRefund("tcp2");
    expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith("te2", "10");
    expect(prisma.invoices[0].status).toBe("cancelled");
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.handleOrderRefund("o1");
    const returns = prisma.invoices.filter(
      (i: any) => i.type === "return_invoice",
    );
    expect(returns).toHaveLength(2); // çakışma yok: sourceId = orijinal fatura id
    expect(returns.map((r: any) => r.sourceId).sort()).toEqual(["c1", "s1"]);
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
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1"); // platform satıcı → komisyon kesilmez
    expect(elogo.sendDocument).not.toHaveBeenCalled();

    await svc.issuePlatformSaleInvoice("o1"); // alıcıya ürün e-Arşivi
    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].type).toBe("platform_sale");
    expect(prisma.invoices[0].recipientUserId).toBe("b1");
  });

  /**
   * İNDİRİMLİ platform satışında belge, tahsil edilen tutara kesilir.
   *
   * Belge toplamı kalemlerden türer ve ürün kalemi `order.subtotal`'dan kurulur.
   * O kolon indirim ÖNCESİ liste fiyatını tutarken (520,22 tahsil edilen ürün
   * için 634,41 yazılıyken) alıcıya ödediğinden ~114 TL fazlaya e-Arşiv
   * kesiliyordu. Kolon artık tahsil edilen tabanı tutuyor; bu test o bağı kilitler.
   */
  it("platform satışı faturası tahsil edilen tutara eşittir (indirimli üründe de)", async () => {
    const prisma = makePrisma({
      orders: {
        o1: {
          sellerId: "plat",
          buyerId: "b1",
          // 520,22 (indirimli ürün) + 50 kargo + 52,02 alıcı ücreti + 20,40 KDV
          totalAmount: 642.64,
          subtotal: 520.22,
          quantity: 1,
          buyerShippingAmount: 50,
          buyerFeeAmount: 52.02,
          product: { title: "Motorsport Efsaneleri Seti", categoryId: null },
        },
      },
      users: {
        plat: { displayName: "Tarodan Official Store", sellerType: "platform" },
        b1: { displayName: "Alıcı", taxId: null },
      },
    });
    const elogo = makeElogo();
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issuePlatformSaleInvoice("o1");

    const doc = prisma.invoices[0];
    expect(Number(doc.total)).toBeCloseTo(642.64, 2);
    expect(Number(doc.netAmount) + Number(doc.taxAmount)).toBeCloseTo(
      642.64,
      2,
    );

    // Ürün satırı adıyla ve tahsil edilen bedeliyle durur (KDV dahil 520,22).
    const [productLine] = doc.lineItems as Array<{
      name: string;
      net: number;
      vatRate: number;
    }>;
    expect(productLine.name).toBe("Motorsport Efsaneleri Seti");
    expect(productLine.net * (1 + productLine.vatRate / 100)).toBeCloseTo(
      520.22,
      2,
    );
  });

  it("eLogo kapalıysa göndermez ama retry için pending kayıt bırakır", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    const elogo = makeElogo({ isEnabled: jest.fn(() => false) });
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");
    expect(elogo.sendDocument).not.toHaveBeenCalled();
    expect(prisma.invoices).toHaveLength(1);
    expect(prisma.invoices[0].status).toBe("pending");
  });

  it("pending faturayı aynı numara ve ETTN ile retry ederek gönderir", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    const enabled = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const elogo = makeElogo({ isEnabled: enabled });
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");
    const identity = {
      invoiceNumber: prisma.invoices[0].invoiceNumber,
      ettn: prisma.invoices[0].ettn,
    };

    await svc.retryPendingInvoices();

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0]).toMatchObject({
      ...identity,
      status: "sent",
      attemptCount: 1,
    });
  });

  it("eşzamanlı retry worker'larında gönderim lease'ini yalnız biri kazanır", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    const enabled = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const elogo = makeElogo({ isEnabled: enabled });
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");
    await Promise.all([svc.retryPendingInvoices(), svc.retryPendingInvoices()]);

    expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
    expect(prisma.invoices[0].status).toBe("sent");
  });

  it("düşmüş processing lease'inde önce sağlayıcıyla mutabakat yapar", async () => {
    const prisma = makePrisma({
      orders: { o1: { sellerId: "s1" } },
      ledgers: { o1: { sellerCommission: 120, refundedSellerCommission: 0 } },
      users: { s1: { displayName: "X" } },
    });
    const enabled = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const elogo = makeElogo({
      isEnabled: enabled,
      getDocumentStatus: jest.fn().mockResolvedValue({
        documentUuid: "u",
        status: 2,
        code: 1300,
        description: "accepted",
      }),
    });
    // Tek zincir, PAYLAŞILAN örnekler: kesim ve ters kayıt aynı belge ve
    // gönderim nesnelerini kullanmalı, yoksa casuslar ve vergi/ledger
    // ayarları çalışmayan bir kopyada kalır.
    const elogoClient = elogo;
    const documents = new ElogoDocumentService(
      prisma,
      elogoClient,
      fakeConfig(),
    );
    const delivery = new ElogoDeliveryService(prisma, elogoClient, documents);
    const svc = new ElogoInvoicingService(
      {} as any, // queries
      delivery,
      new ElogoIssuingService(prisma, documents, delivery),
      new ElogoReversalService(prisma, elogoClient, documents, delivery),
    );

    await svc.issueCommissionInvoice("o1");
    Object.assign(prisma.invoices[0], {
      status: "processing",
      attemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    await svc.retryPendingInvoices();

    expect(elogo.getDocumentStatus).toHaveBeenCalledWith(
      prisma.invoices[0].ettn,
      "EARCHIVE",
    );
    expect(elogo.sendDocument).not.toHaveBeenCalled();
    expect(prisma.invoices[0]).toMatchObject({
      status: "sent",
      attemptCount: 1,
      elogoResultCode: 1300,
    });
  });
});
