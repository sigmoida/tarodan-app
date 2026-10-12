import type { PrismaService } from "../../prisma";
import type { SmtpProvider } from "../mail/smtp.provider";
import type { StorageService } from "../storage/storage.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import type { InvoiceDocumentService } from "./invoice-document.service";
import type { FiscalInvoicePdfService } from "./pdf/fiscal-invoice-pdf.service";
import type { EInvoiceProvider } from "./provider/e-invoice-provider";

jest.mock("../../common/helpers/email-template-renderer", () => ({
  renderManagedEmailTemplate: jest.fn(() => ({
    subject: "Faturanız",
    html: "<p>fatura</p>",
  })),
}));

/**
 * Sağlayıcı PDF veremediğinde (Netsis: `fetchPdf` → null) teslim katmanı
 * görsel kopyayı basar ve sağlayıcı PDF'iyle AYNI yoldan devam eder:
 * S3 yükleme, pdfUrl, tek seferlik e-posta.
 */

const FETCHED = Buffer.alloc(300, "a");
const RENDERED = Buffer.alloc(300, "b");

interface DeliverInput {
  id: string;
  ettn: string;
  invoiceNumber: string;
  type: string;
  total: number;
  currentPdfUrl: string | null;
  recipientName?: string | null;
  lineDescription?: string | null;
}

type DeliverPdf = (
  provider: EInvoiceProvider,
  inv: DeliverInput,
  recipientEmail: string | null,
) => Promise<void>;

function build(opts: { emailSentAt?: Date | null; row?: object | null } = {}) {
  const row = opts.row === undefined ? { id: "inv-1" } : opts.row;
  const prisma = {
    fiscalInvoice: {
      // deliverPdf iki farklı okuma yapar: emailSentAt kapısı ve kopya için tam kayıt.
      findUnique: jest.fn(async (args: { select?: object }) =>
        args.select ? { emailSentAt: opts.emailSentAt ?? null } : row,
      ),
      update: jest.fn(async () => ({})),
    },
    emailTemplate: { findUnique: jest.fn(async () => null) },
  };
  const storage = {
    isStorageAvailable: jest.fn(() => true),
    uploadFile: jest.fn(async () => ({ key: "elogo-invoices/EAR1.pdf" })),
  };
  const smtp = { sendEmail: jest.fn(async () => undefined) };
  const pdfRenderer = {
    renderForRecord: jest.fn(async (): Promise<Buffer | null> => RENDERED),
  };
  const delivery = new InvoiceDeliveryService(
    prisma as unknown as PrismaService,
    {} as EInvoiceProvider,
    {} as InvoiceDocumentService,
    storage as unknown as StorageService,
    smtp as unknown as SmtpProvider,
    undefined,
    undefined,
    undefined,
    pdfRenderer as unknown as FiscalInvoicePdfService,
  );
  const deliverPdf = (
    delivery as unknown as { deliverPdf: DeliverPdf }
  ).deliverPdf.bind(delivery);
  return { prisma, storage, smtp, pdfRenderer, deliverPdf };
}

function providerReturning(pdf: Buffer | null) {
  return { fetchPdf: jest.fn(async () => pdf) } as unknown as EInvoiceProvider;
}

const INVOICE: DeliverInput = {
  id: "inv-1",
  ettn: "ettn-1",
  invoiceNumber: "EAR2026000000001",
  type: "commission",
  total: 120,
  currentPdfUrl: null,
  recipientName: "Ada",
};

describe("InvoiceDeliveryService.deliverPdf — görsel kopya fallback'i", () => {
  it("sağlayıcı null verirse kopya basılır; S3, pdfUrl ve e-posta aynı yoldan gider", async () => {
    const { deliverPdf, pdfRenderer, storage, smtp, prisma } = build();
    const provider = providerReturning(null);

    await deliverPdf(provider, INVOICE, "ada@example.com");

    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledWith(
      { id: "inv-1" },
      "ada@example.com",
    );
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.uploadFile).toHaveBeenCalledWith(
      RENDERED,
      expect.objectContaining({
        bucket: "documents",
        folder: "elogo-invoices",
        filename: "EAR2026000000001.pdf",
        entityType: "elogo_invoice",
        entityId: "inv-1",
      }),
    );
    expect(smtp.sendEmail).toHaveBeenCalledTimes(1);
    expect(smtp.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        attachments: [
          { filename: "EAR2026000000001.pdf", content: RENDERED },
        ],
      }),
    );
    expect(prisma.fiscalInvoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        pdfUrl: "elogo-invoices/EAR1.pdf",
        emailSentAt: expect.any(Date),
      },
    });
  });

  it("sağlayıcı PDF verirse kopya basılmaz ve sağlayıcı PDF'i gider", async () => {
    const { deliverPdf, pdfRenderer, storage, smtp } = build();

    await deliverPdf(providerReturning(FETCHED), INVOICE, "ada@example.com");

    expect(pdfRenderer.renderForRecord).not.toHaveBeenCalled();
    expect(storage.uploadFile).toHaveBeenCalledWith(
      FETCHED,
      expect.anything(),
    );
    expect(smtp.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: "EAR2026000000001.pdf", content: FETCHED },
        ],
      }),
    );
  });

  it("e-posta daha önce gittiyse ne sağlayıcıya ne basıcıya gidilir", async () => {
    const { deliverPdf, pdfRenderer, smtp, storage } = build({
      emailSentAt: new Date(),
    });
    const provider = providerReturning(null);

    await deliverPdf(provider, INVOICE, "ada@example.com");

    expect(provider.fetchPdf).not.toHaveBeenCalled();
    expect(pdfRenderer.renderForRecord).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });

  it("kopya da basılamazsa (numara/ETTN yok) S3 ve e-posta atlanır", async () => {
    const { deliverPdf, pdfRenderer, smtp, storage, prisma } = build();
    pdfRenderer.renderForRecord.mockResolvedValue(null);

    await deliverPdf(providerReturning(null), INVOICE, "ada@example.com");

    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(smtp.sendEmail).not.toHaveBeenCalled();
    expect(prisma.fiscalInvoice.update).not.toHaveBeenCalled();
  });

  it("kayıt okunamazsa basıcı çağrılmaz", async () => {
    const { deliverPdf, pdfRenderer, smtp } = build({ row: null });

    await deliverPdf(providerReturning(null), INVOICE, "ada@example.com");

    expect(pdfRenderer.renderForRecord).not.toHaveBeenCalled();
    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });

  it("sağlayıcı fetchPdf'te fırlatırsa da kopyaya düşer", async () => {
    const { deliverPdf, pdfRenderer } = build();
    const provider = {
      fetchPdf: jest.fn(async () => {
        throw new Error("down");
      }),
    } as unknown as EInvoiceProvider;

    await deliverPdf(provider, INVOICE, null);

    expect(pdfRenderer.renderForRecord).toHaveBeenCalledWith(
      { id: "inv-1" },
      null,
    );
  });
});
