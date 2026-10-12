import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../prisma";
import type { OutboxService } from "../outbox/outbox.service";
import { OUTBOX_NETSIS_ACCOUNTING_SYNC } from "../outbox/outbox.types";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import type {
  EInvoiceProvider,
  EInvoiceSendResult,
} from "./provider/e-invoice-provider";

/**
 * Netsis'in kestiği belge `sent` olunca muhasebe senkronunun tahsilat olayı
 * (`netsis_accounting.sync`) durum yazımıyla AYNI işlemde sıraya alınır; eLogo
 * kayıtları için olay yoktur. İki `sent` yolu (sağlayıcı kabulü ve "önceki
 * deneme zaten tamamlanmış" mutabakatı) aynı `markSent`'ten geçer.
 */

type Row = Record<string, unknown> & { id: string; attemptCount: number };

/** Transaction istemcisi ana istemciden AYRI bir nesne: yazımın nereye gittiği ayırt edilir. */
function makePrisma(row: Row) {
  const applyTo = (data: Record<string, unknown>) => Object.assign(row, data);
  const client = (label: "root" | "tx") => ({
    label,
    fiscalInvoice: {
      findUnique: jest.fn(async () => ({ ...row })),
      updateMany: jest.fn(
        async ({ data }: { data: Record<string, unknown> }) => {
          applyTo(data);
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        applyTo(data);
        return { ...row };
      }),
    },
    fiscalDocSequence: { upsert: jest.fn(async () => ({ lastValue: 2 })) },
    user: { findUnique: jest.fn(async () => null) },
    address: { findFirst: jest.fn(async () => null) },
  });
  const tx = client("tx");
  const root = Object.assign(client("root"), {
    $transaction: jest.fn(
      async (fn: (t: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
    ),
  });
  return { root, tx };
}

function fakeProvider(
  send: EInvoiceSendResult = { accepted: true, providerRef: "REF-1" },
  getStatus: unknown = { state: "unknown" },
) {
  return {
    name: "netsis" as const,
    numbering: "local" as const,
    isEnabled: jest.fn(() => true),
    resolveRecipientKind: jest.fn(async () => null),
    send: jest.fn(async () => send),
    getStatus: jest.fn(async () => getStatus),
    cancelEArchive: jest.fn(),
    fetchPdf: jest.fn(async () => null),
    eArchiveReversalStrategy: jest.fn(() => "CANCEL"),
    classifyError: jest.fn(() => "unknown"),
  };
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
    provider: "netsis",
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
  const { root, tx } = makePrisma(row);
  const port = provider as unknown as EInvoiceProvider;
  const documents = new InvoiceDocumentService(
    root as unknown as PrismaService,
    port,
    {
      get: (_key: string, def?: string) => def,
    } as unknown as ConfigService,
  );
  const outbox = { enqueue: jest.fn(async () => undefined) };
  const delivery = new InvoiceDeliveryService(
    root as unknown as PrismaService,
    port,
    documents,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    outbox as unknown as OutboxService,
  );
  return { delivery, root, tx, outbox };
}

describe("InvoiceDeliveryService — Netsis muhasebe senkronu olayı", () => {
  it("Netsis kabulü: tek olay, fatura kimliğiyle ve durum yazımıyla aynı işlemde", async () => {
    const row = pendingInvoice();
    const { delivery, root, tx, outbox } = build(row, fakeProvider());

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({ status: "sent", providerRef: "REF-1" });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: OUTBOX_NETSIS_ACCOUNTING_SYNC,
        payload: { kind: "invoice_collection", sourceId: "inv-1" },
        dedupeKey: `${OUTBOX_NETSIS_ACCOUNTING_SYNC}:invoice_collection:inv-1`,
      }),
    );
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    // 'sent' yazımı transaction istemcisine gider, ana istemciye değil.
    expect(tx.fiscalInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({ status: "sent" }),
      }),
    );
    expect(root.fiscalInvoice.update).not.toHaveBeenCalled();
  });

  it("mutabakat yolu: sağlayıcı 'completed' diyorsa aynı olay yayılır", async () => {
    const row = pendingInvoice({ attemptCount: 1, providerRef: "REF-0" });
    const provider = fakeProvider(undefined, {
      state: "completed",
      resultCode: 1300,
      resultMsg: "accepted",
    });
    const { delivery, tx, outbox } = build(row, provider);

    await delivery.sendRecord("inv-1");

    expect(provider.send).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "sent", providerResultCode: 1300 });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        payload: { kind: "invoice_collection", sourceId: "inv-1" },
      }),
    );
  });

  it("eLogo kaydı: olay yok, ek transaction yok", async () => {
    const row = pendingInvoice({ provider: "elogo" });
    const { delivery, root, outbox } = build(row, fakeProvider());

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({ status: "sent" });
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(root.$transaction).not.toHaveBeenCalled();
  });

  it("gönderim reddedilirse (sent değil) olay yok", async () => {
    const row = pendingInvoice();
    const { delivery, outbox } = build(
      row,
      fakeProvider({ accepted: false, category: "unknown", resultMsg: "red" }),
    );

    await delivery.sendRecord("inv-1");

    expect(row).toMatchObject({ status: "failed" });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
