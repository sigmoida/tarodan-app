import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../prisma";
import type { StorageService } from "../storage/storage.service";
import { InvoiceQueryService } from "./invoice-query.service";
import type { FiscalInvoicePdfService } from "./pdf/fiscal-invoice-pdf.service";
import type { EInvoiceProvider } from "./provider/e-invoice-provider";

/**
 * İndirmede sağlayıcı PDF veremiyorsa (Netsis) görsel kopya BİR KEZ basılır,
 * S3'e ve `pdfUrl`e yazılır; sonraki indirme kayıtlı dosyadan gelir.
 */

const RENDERED = Buffer.alloc(300, "r");
const FETCHED = Buffer.alloc(300, "f");

function build(
  opts: { pdfUrl?: string | null; storage?: boolean; provider?: string } = {},
) {
  const row: Record<string, unknown> = {
    id: "inv-1",
    ettn: "ettn-1",
    invoiceNumber: "EAR2026000000001",
    pdfUrl: opts.pdfUrl ?? null,
    provider: opts.provider ?? "netsis",
    providerRef: "ftSFat:EAR2026000000001",
  };
  const prisma = {
    fiscalInvoice: {
      findFirst: jest.fn(async () => ({ ...row })),
      // Kalıcılaştırma bir sonraki okumada görünür.
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return { ...row };
      }),
    },
  };
  const storage = {
    isStorageAvailable: jest.fn(() => opts.storage !== false),
    uploadFile: jest.fn(async () => ({ key: "elogo-invoices/EAR1.pdf" })),
    getPresignedDownloadUrl: jest.fn(async () => "https://s3.example/signed"),
  };
  const provider = {
    name: "netsis",
    fetchPdf: jest.fn(async (): Promise<Buffer | null> => null),
  };
  const pdfRenderer = {
    renderForRecord: jest.fn(async (): Promise<Buffer | null> => RENDERED),
  };
  const service = new InvoiceQueryService(
    prisma as unknown as PrismaService,
    provider as unknown as EInvoiceProvider,
    storage as unknown as StorageService,
    undefined,
    pdfRenderer as unknown as FiscalInvoicePdfService,
  );
  return { service, prisma, storage, provider, pdfRenderer };
}

describe("InvoiceQueryService.getInvoiceDownload — görsel kopya fallback'i", () => {
  it("pdfUrl boş + sağlayıcı null: bir kez basar, S3'e ve pdfUrl'e yazar; ikinci çağrı kayıtlıyı sunar", async () => {
    const { service, prisma, storage, provider, pdfRenderer } = build();

    const first = await service.getInvoiceDownload("inv-1", "u1");

    expect(first).toEqual({
      url: "https://s3.example/signed",
      invoiceNumber: "EAR2026000000001",
    });
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
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
    expect(prisma.fiscalInvoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { pdfUrl: "elogo-invoices/EAR1.pdf" },
    });

    const second = await service.getInvoiceDownload("inv-1", "u1");

    expect(second.url).toBe("https://s3.example/signed");
    // Yeniden ne sağlayıcıya ne basıcıya gidildi; yükleme de tekrarlanmadı.
    expect(provider.fetchPdf).toHaveBeenCalledTimes(1);
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.getPresignedDownloadUrl).toHaveBeenLastCalledWith(
      "documents",
      "elogo-invoices/EAR1.pdf",
      3600,
    );
  });

  it("sağlayıcı PDF verirse kopya basılmaz", async () => {
    const { service, storage, provider, pdfRenderer } = build();
    provider.fetchPdf.mockResolvedValue(FETCHED);

    await service.getInvoiceDownload("inv-1", "u1");

    expect(pdfRenderer.renderForRecord).not.toHaveBeenCalled();
    expect(storage.uploadFile).toHaveBeenCalledWith(
      FETCHED,
      expect.anything(),
    );
  });

  it("pdfUrl doluysa ne sağlayıcıya ne basıcıya gidilir", async () => {
    const { service, provider, pdfRenderer } = build({
      pdfUrl: "elogo-invoices/EAR1.pdf",
    });

    await service.getInvoiceDownload("inv-1");

    expect(provider.fetchPdf).not.toHaveBeenCalled();
    expect(pdfRenderer.renderForRecord).not.toHaveBeenCalled();
  });

  it("storage yoksa kopya buffer olarak döner (son çare), bir kez basılır", async () => {
    const { service, pdfRenderer, storage } = build({ storage: false });

    const result = await service.getInvoiceDownload("inv-1", "u1");

    expect(result).toEqual({
      buffer: RENDERED,
      invoiceNumber: "EAR2026000000001",
    });
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("S3 yüklemesi düşerse aynı kopya buffer olarak sunulur, yeniden basılmaz", async () => {
    const { service, storage, pdfRenderer } = build();
    storage.uploadFile.mockRejectedValue(new Error("s3"));

    const result = await service.getInvoiceDownload("inv-1", "u1");

    expect(result.buffer).toBe(RENDERED);
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledTimes(1);
  });

  it("sağlayıcı da basıcı da PDF veremezse bulunamadı fırlatır", async () => {
    const { service, pdfRenderer } = build();
    pdfRenderer.renderForRecord.mockResolvedValue(null);

    await expect(service.getInvoiceDownload("inv-1", "u1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("kayıt tamamı ile basıcıya verilir (sahiplik süzgeci findFirst'te)", async () => {
    const { service, prisma, pdfRenderer } = build();

    await service.getInvoiceDownload("inv-1", "u1");

    expect(prisma.fiscalInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-1", recipientUserId: "u1" },
    });
    expect(pdfRenderer.renderForRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inv-1", invoiceNumber: "EAR2026000000001" }),
    );
  });
});
