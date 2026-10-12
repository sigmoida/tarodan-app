import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../prisma";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import { INVOICE_MAX_SEND_ATTEMPTS } from "./helpers/invoice-retry-policy";
import type {
  EInvoiceErrorCategory,
  EInvoiceProvider,
  EInvoiceSendResult,
  EInvoiceStatus,
  FiscalDocumentInput,
} from "./provider/e-invoice-provider";

/**
 * Teslim katmanı entegratörü yalnız `EInvoiceProvider` portundan görür.
 * Bu spec eLogo'ya hiç dokunmayan sahte bir sağlayıcıyla, deneme bütçesi ve
 * kayıt yazımı kararlarının portun nötr sonuçlarından (kabul / red sınıfı /
 * fırlatılan hata sınıfı / durum) türediğini sabitler.
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

function makePrisma(row: Row) {
  let seq = 1;
  const prisma = {
    fiscalInvoice: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === row.id ? { ...row } : null,
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: unknown; attemptCount: unknown };
          data: Record<string, unknown>;
        }) => {
          if (
            where.id !== row.id ||
            where.status !== row.status ||
            where.attemptCount !== row.attemptCount
          )
            return { count: 0 };
          applyData(row, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        applyData(row, data);
        return { ...row };
      }),
    },
    fiscalDocSequence: {
      upsert: jest.fn(async () => ({ lastValue: ++seq })),
    },
    user: { findUnique: jest.fn(async () => null) },
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

function fakeProvider(over: Partial<Record<keyof EInvoiceProvider, unknown>>) {
  const base = {
    name: "netsis" as const,
    numbering: "local" as const,
    isEnabled: jest.fn(() => true),
    resolveRecipientKind: jest.fn(async () => null),
    send: jest.fn(
      async (_document: FiscalDocumentInput): Promise<EInvoiceSendResult> => ({
        accepted: true,
        providerRef: "REF-1",
        resultCode: 1,
        resultMsg: "OK",
      }),
    ),
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
    type: "commission",
    sourceId: "pkg-1",
    status: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
    invoiceNumber: "TRD2026000000001",
    ettn: "ettn-1",
    recipientUserId: "u1",
    // Bilinmeyen nihai tüketici: mükellef sorgusu yapılmaz.
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
    sourceReference: null,
    billingReference: null,
    billingReferenceIssueDate: null,
    pdfUrl: null,
    issuedAt: null,
    createdAt: new Date("2026-10-12T09:00:00Z"),
    ...over,
  };
}

function build(row: Row, provider: ReturnType<typeof fakeProvider>) {
  const prisma = makePrisma(row);
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
  );
  return { delivery, prisma };
}

describe("InvoiceDeliveryService — sağlayıcı portu üzerinden gönderim", () => {
  it("kabul: belge nötr girdiyle gider, kayıt sağlayıcı referansı ve aynı toplamlarla 'sent' olur", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({});
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).toHaveBeenCalledTimes(1);
    const [document, context] = provider.send.mock.calls[0] as unknown as [
      FiscalDocumentInput,
      object,
    ];
    expect(document).toEqual(
      expect.objectContaining({
        scenario: "EARCHIVE",
        kind: "SALE",
        documentNumber: "TRD2026000000001",
        ettn: "ettn-1",
        sendType: "ELEKTRONIK",
      }),
    );
    expect(document.lines).toEqual([
      expect.objectContaining({ quantity: 1, unitPrice: 100, vatRate: 20 }),
    ]);
    expect(context).toEqual({});
    expect(row).toMatchObject({
      status: "sent",
      providerRef: "REF-1",
      providerResultCode: 1,
      providerResultMsg: "OK",
      netAmount: 100,
      taxAmount: 20,
      total: 120,
      discountTotal: 0,
    });
  });

  it("numara çakışması reddi: yeni numarayla yeniden gönderir", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({
      send: jest
        .fn()
        .mockResolvedValueOnce({
          accepted: false,
          category: "duplicate-number",
          resultMsg: "dup",
        })
        .mockResolvedValue({ accepted: true, providerRef: "REF-2" }),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    const numbers = (
      provider.send.mock.calls as unknown as Array<[FiscalDocumentInput]>
    ).map(([doc]) => doc.documentNumber);
    expect(numbers).toHaveLength(2);
    expect(numbers[1]).not.toBe(numbers[0]);
    expect(row).toMatchObject({ status: "sent", invoiceNumber: numbers[1] });
  });

  it("yapılandırma reddi: deneme bütçesi hemen tükenir", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: false,
        category: "configuration",
        resultCode: -1,
        resultMsg: "tasarım yok",
      })),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({
      status: "failed",
      attemptCount: INVOICE_MAX_SEND_ATTEMPTS,
      providerResultMsg: "tasarım yok",
    });
  });

  it("diğer red: kayıt 'failed', deneme sayacı yalnız bir artar", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({
      send: jest.fn(async () => ({
        accepted: false,
        category: "unknown",
        resultMsg: "VKN geçersiz",
      })),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({ status: "failed", attemptCount: 1 });
  });

  it("ağ sınıfı hata: bütçe tüketilmez, kayıt 'pending' kalır", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({
      send: jest.fn(async () => {
        throw new Error("upstream down");
      }),
      classifyError: jest.fn(() => "network"),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.classifyError).toHaveBeenCalled();
    expect(row).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("ağ dışı fırlatılan hata: kayıt 'failed'", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({
      send: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({ status: "failed", attemptCount: 1 });
  });

  it("önceki denemesi olan kayıt: sağlayıcı 'completed' diyorsa yeniden gönderilmez", async () => {
    const row = pendingInvoice({ attemptCount: 1, providerRef: "REF-0" });
    const provider = fakeProvider({
      getStatus: jest.fn(async () => ({
        state: "completed",
        resultCode: 1300,
        resultMsg: "accepted",
      })),
    });
    const { delivery } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.getStatus).toHaveBeenCalledWith(
      { ettn: "ettn-1", providerRef: "REF-0" },
      "EARCHIVE",
    );
    expect(provider.send).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "sent", providerResultCode: 1300 });
  });

  it("sağlayıcı kapalıysa cron yeniden denemez", async () => {
    const row = pendingInvoice();
    const provider = fakeProvider({ isEnabled: jest.fn(() => false) });
    const { delivery, prisma } = build(row, provider);

    await delivery.retryPendingInvoices();

    expect(prisma.fiscalInvoice.findUnique).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });
});
