import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../prisma";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import { INVOICE_MAX_SEND_ATTEMPTS } from "./helpers/invoice-retry-policy";
import type {
  EInvoiceErrorCategory,
  EInvoiceProvider,
  EInvoiceSendContext,
  EInvoiceSendResult,
  EInvoiceStatus,
  FiscalDocumentInput,
} from "./provider/e-invoice-provider";
import type { InvoiceProviderRegistry } from "./provider/provider-registry";

/**
 * `provider` numaralandırma (Netsis): numarayı ERP verir. Teslim katmanı
 * kaydı NUMARASIZ açar, sayacı hiç ilerletmez, numarayı ve referansı gönderim
 * sonucundan yazar; belge sağlayıcıda oluşup yalnız gönderimi düştüyse
 * referansı saklar ve sonraki denemede yalnız gönderimi ister. Yerel
 * numaralandırmanın (eLogo) davranışı `invoice-delivery.provider-port.spec`
 * ve `invoicing.service.spec`'te sabittir.
 */

type Row = Record<string, unknown> & { id: string; attemptCount: number };

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as { increment?: number; decrement?: number };
      if ("increment" in op || "decrement" in op) {
        row[key] =
          Number(row[key] ?? 0) + (op.increment ?? 0) - (op.decrement ?? 0);
        continue;
      }
    }
    row[key] = value;
  }
}

function makePrisma(rows: Row[] = []) {
  let created = 0;
  const byWhere = (where: {
    id?: string;
    type_sourceId?: { type: string; sourceId: string };
  }) =>
    rows.find((row) =>
      where.id
        ? row.id === where.id
        : row.type === where.type_sourceId?.type &&
          row.sourceId === where.type_sourceId?.sourceId,
    ) ?? null;
  const prisma = {
    fiscalInvoice: {
      findUnique: jest.fn(
        async ({ where }: { where: Parameters<typeof byWhere>[0] }) => {
          const row = byWhere(where);
          return row ? { ...row } : null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `new-${++created}`, attemptCount: 0, ...data };
        rows.push(row);
        return { ...row };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: unknown; attemptCount: unknown };
          data: Record<string, unknown>;
        }) => {
          const row = byWhere({ id: where.id });
          if (
            !row ||
            where.status !== row.status ||
            where.attemptCount !== row.attemptCount
          )
            return { count: 0 };
          applyData(row, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = byWhere(where);
          if (!row) throw new Error("not found");
          applyData(row, data);
          return { ...row };
        },
      ),
    },
    fiscalDocSequence: { upsert: jest.fn(async () => ({ lastValue: 1 })) },
    user: {
      findUnique: jest.fn(async () => ({
        displayName: "Ad Soyad",
        companyName: null,
        taxId: null,
        email: "a@example.com",
      })),
    },
    address: { findFirst: jest.fn(async () => null) },
  };
  return Object.assign(prisma, {
    $transaction: jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        fn(prisma),
    ),
  });
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = {
    ELOGO_INVOICE_PREFIX: "TRD",
    ELOGO_COMPANY_VKN: "7620277268",
    ELOGO_COMPANY_TITLE: "TARODAN",
  };
  return {
    get: (key: string, def?: string) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

type SendMock = jest.Mock<
  Promise<EInvoiceSendResult>,
  [FiscalDocumentInput, EInvoiceSendContext]
>;

function fakeProvider(
  over: Partial<Record<keyof EInvoiceProvider, unknown>> = {},
) {
  const send: SendMock = jest.fn<
    Promise<EInvoiceSendResult>,
    [FiscalDocumentInput, EInvoiceSendContext]
  >(async () => ({
    accepted: true as const,
    providerRef: "ftSFat:EAR2026000000001",
    documentNumber: "EAR2026000000001",
    ettn: "netsis-ettn-1",
  }));
  const base = {
    name: "netsis" as const,
    numbering: "provider" as const,
    isEnabled: jest.fn(() => true),
    resolveRecipientKind: jest.fn(async () => ({ kind: "EARCHIVE" as const })),
    send,
    getStatus: jest.fn(async (): Promise<EInvoiceStatus> => ({
      state: "unknown",
    })),
    cancelEArchive: jest.fn(),
    fetchPdf: jest.fn(async () => null),
    eArchiveReversalStrategy: jest.fn(() => "CANCEL"),
    classifyError: jest.fn((): EInvoiceErrorCategory => "unknown"),
  };
  return Object.assign(base, over);
}

function pendingInvoice(over: Partial<Row> = {}): Row {
  return {
    id: "inv-1",
    type: "seller_commission",
    sourceId: "pkg-1",
    provider: "netsis",
    status: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
    invoiceNumber: null,
    ettn: "our-ettn-1",
    providerRef: null,
    recipientUserId: "u1",
    recipientVknTckn: "11111111111",
    recipientName: "Ad Soyad",
    recipientEmail: "a@example.com",
    recipientCity: null,
    recipientDistrict: null,
    recipientStreet: null,
    documentType: "EARCHIVE",
    netAmount: 100,
    vatRate: 20,
    total: 120,
    lineItems: null,
    lineDescription: null,
    sourceReference: "KYT-K7X9M2QF3N",
    billingReference: null,
    billingReferenceIssueDate: null,
    pdfUrl: null,
    issuedAt: null,
    createdAt: new Date("2026-10-12T09:00:00Z"),
    ...over,
  };
}

function build(
  rows: Row[],
  provider: ReturnType<typeof fakeProvider>,
  registry?: Pick<InvoiceProviderRegistry, "get">,
) {
  const prisma = makePrisma(rows);
  const port = provider as unknown as EInvoiceProvider;
  const documents = new InvoiceDocumentService(
    prisma as unknown as PrismaService,
    port,
    fakeConfig(),
  );
  const delivery = new InvoiceDeliveryService(
    prisma as unknown as PrismaService,
    port,
    documents,
    undefined,
    undefined,
    undefined,
    undefined,
    registry as InvoiceProviderRegistry | undefined,
  );
  return { delivery, prisma };
}

describe("InvoiceDeliveryService — sağlayıcı numaralandırması (Netsis)", () => {
  it("kesim: kayıt NUMARASIZ açılır, numara sayacı hiç ilerlemez", async () => {
    const rows: Row[] = [];
    const provider = fakeProvider({ isEnabled: jest.fn(() => false) });
    const { delivery, prisma } = build(rows, provider);

    await delivery.cut("membership", "mp-1", "u1", 120);

    expect(prisma.fiscalInvoice.create).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      type: "membership",
      provider: "netsis",
      invoiceNumber: null,
      status: "pending",
    });
    expect(rows[0].ettn).toEqual(expect.any(String));
    expect(prisma.fiscalDocSequence.upsert).not.toHaveBeenCalled();
  });

  it("kaydı kesen sağlayıcı kapalıysa gönderilmez: pending kalır, bütçe tüketilmez", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({ isEnabled: jest.fn(() => false) });
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("kabul: belge numarasız gider; sağlayıcının numarası, referansı ve ETTN'i kayda yazılır", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider();
    const { delivery, prisma } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).toHaveBeenCalledTimes(1);
    const [document, context] = provider.send.mock.calls[0];
    expect(document.documentNumber).toBeUndefined();
    expect(document.ettn).toBe("our-ettn-1");
    expect(context).toEqual({
      invoiceType: "seller_commission",
      recipientUserId: "u1",
      sourceReference: "KYT-K7X9M2QF3N",
    });
    expect(rows[0]).toMatchObject({
      status: "sent",
      invoiceNumber: "EAR2026000000001",
      providerRef: "ftSFat:EAR2026000000001",
      // Netsis kendi ETTN'ini atadı: GİB'deki kimlik odur.
      ettn: "netsis-ettn-1",
      netAmount: 100,
      taxAmount: 20,
      total: 120,
    });
    expect(prisma.fiscalDocSequence.upsert).not.toHaveBeenCalled();
  });

  it("sağlayıcı ETTN döndürmezse bizim ETTN'imiz kalır", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: true,
        providerRef: "ftSFat:EAR2026000000001",
        documentNumber: "EAR2026000000001",
      })),
    });
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(rows[0]).toMatchObject({
      status: "sent",
      ettn: "our-ettn-1",
      invoiceNumber: "EAR2026000000001",
    });
  });

  it("fiş oluştu, e-belge ağ yüzünden gitmedi: referans + numara saklanır, bütçe tüketilmez", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: false,
        category: "network",
        resultMsg: "network: gateway timeout",
        providerRef: "ftSFat:EAR2026000000001",
        documentNumber: "EAR2026000000001",
      })),
    });
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(rows[0]).toMatchObject({
      status: "pending",
      attemptCount: 0,
      providerRef: "ftSFat:EAR2026000000001",
      invoiceNumber: "EAR2026000000001",
      providerResultMsg: "network: gateway timeout",
    });
  });

  it("yeniden deneme: mevcut referans sağlayıcıya verilir (yalnız gönderim), senaryo yeniden çözülmez", async () => {
    const rows = [
      pendingInvoice({
        recipientVknTckn: "12345678901",
        providerRef: "ftSFat:EAR2026000000001",
        invoiceNumber: "EAR2026000000001",
      }),
    ];
    const provider = fakeProvider();
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    const [, context] = provider.send.mock.calls[0];
    expect(context.existingProviderRef).toBe("ftSFat:EAR2026000000001");
    expect(provider.resolveRecipientKind).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: "sent",
      invoiceNumber: "EAR2026000000001",
    });
  });

  it("numara çakışması reddi yerel sayaçtan yeni numarayla yeniden DENENMEZ", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: false,
        category: "duplicate-number",
        resultMsg: "conflict",
      })),
    });
    const { delivery, prisma } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(prisma.fiscalDocSequence.upsert).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: "failed",
      attemptCount: 1,
      invoiceNumber: null,
    });
  });

  it("yapılandırma reddi (ör. tutar uyuşmazlığı): bütçe hemen tükenir, numara yazılmaz", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: false,
        category: "configuration",
        resultMsg: "tutarlar farklı",
      })),
    });
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(rows[0]).toMatchObject({
      status: "failed",
      attemptCount: INVOICE_MAX_SEND_ATTEMPTS,
      invoiceNumber: null,
      providerRef: null,
    });
  });

  it("fırlatılan ağ hatası: numara alanına boş değer YAZILMAZ", async () => {
    const rows = [pendingInvoice()];
    const provider = fakeProvider({
      send: jest.fn(async () => {
        throw new Error("ETIMEDOUT");
      }),
      classifyError: jest.fn(() => "network"),
    });
    const { delivery, prisma } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    const writes = prisma.fiscalInvoice.update.mock.calls.map(
      ([arg]) => arg.data,
    );
    expect(writes.some((data) => "invoiceNumber" in data)).toBe(false);
    expect(rows[0]).toMatchObject({ status: "pending", invoiceNumber: null });
  });

  it("e-Fatura alıcısı: ERP kendi carisinin etiketini kullanır, alias istenmez", async () => {
    const rows = [
      pendingInvoice({
        recipientVknTckn: "1234567890",
        documentType: "EINVOICE",
      }),
    ];
    const provider = fakeProvider({
      resolveRecipientKind: jest.fn(async () => ({ kind: "EINVOICE" })),
    });
    const { delivery } = build(rows, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].scenario).toBe("EINVOICE");
    expect(rows[0]).toMatchObject({ status: "sent" });
  });

  it("kayıt eski sağlayıcıyla kesildiyse gönderim/durum O sağlayıcıya gider", async () => {
    // Bağlı sağlayıcı Netsis; kayıt geçişten önce eLogo'yla açılmış.
    const rows = [
      pendingInvoice({ provider: "elogo", invoiceNumber: "TRD2026000000001" }),
    ];
    const netsis = fakeProvider();
    const elogo = fakeProvider({
      name: "elogo",
      numbering: "local",
      send: jest.fn(async () => ({ accepted: true, providerRef: "42" })),
    });
    const registry = {
      get: jest.fn((name: string) => (name === "elogo" ? elogo : netsis)),
    } as unknown as Pick<InvoiceProviderRegistry, "get">;
    const { delivery } = build(rows, netsis, registry);

    await delivery.sendRecord("inv-1");

    expect(netsis.send).not.toHaveBeenCalled();
    expect(elogo.send).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      status: "sent",
      invoiceNumber: "TRD2026000000001",
      providerRef: "42",
      ettn: "our-ettn-1",
    });
  });
});
