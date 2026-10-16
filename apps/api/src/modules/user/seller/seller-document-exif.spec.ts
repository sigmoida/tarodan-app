// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { SellerDocumentType } from "@prisma/client";
import { SellerDocumentService } from "./seller-document.service";

/**
 * Satıcı (KYC) belgesi görsellerinde EXIF/GPS silinir — kimlik fotoğrafını
 * çeken telefonun konumu depoya gitmez. PDF olduğu gibi yazılır.
 */
const MARKER = "SecretPhone";

function makeService() {
  const uploads: Array<{ buffer: Buffer; mimeType: string }> = [];
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    sellerDocument: {
      update: jest.fn(),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { documentType: data.documentType, status: "pending" };
      }),
    },
  };
  const prisma = {
    corporateApplication: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "app-1", status: "completing" }),
    },
    sellerDocument: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const storage = {
    uploadFile: jest.fn(async (buffer: Buffer, opts: { mimeType: string }) => {
      uploads.push({ buffer, mimeType: opts.mimeType });
      return { key: "dev/documents/seller-documents/x" };
    }),
  };
  return {
    service: new SellerDocumentService(prisma as never, storage as never),
    uploads,
    created,
  };
}

function file(buffer: Buffer, mimetype: string) {
  return {
    buffer,
    size: buffer.length,
    mimetype,
    originalname: "doc",
  } as Express.Multer.File;
}

describe("SellerDocumentService.uploadDocument — EXIF/GPS", () => {
  it("görsel belge meta verisiz ve dik yazılır", async () => {
    const { service, uploads, created } = makeService();
    const photo = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#c86432" },
    })
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Make: MARKER },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 0/1 0/1" },
      })
      .jpeg()
      .toBuffer();

    await service.uploadDocument(
      "u1",
      SellerDocumentType.tax_plate,
      undefined,
      file(photo, "image/jpeg"),
    );

    const meta = await sharp(uploads[0].buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(uploads[0].buffer.includes(MARKER)).toBe(false);
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(created[0]).toMatchObject({
      mimeType: "image/jpeg",
      size: uploads[0].buffer.length,
    });
  });

  it("PDF olduğu gibi yazılır", async () => {
    const { service, uploads } = makeService();
    const pdf = Buffer.from("%PDF-1.4 test document");

    await service.uploadDocument(
      "u1",
      SellerDocumentType.tax_plate,
      undefined,
      file(pdf, "application/pdf"),
    );

    expect(uploads[0]).toEqual({ buffer: pdf, mimeType: "application/pdf" });
  });

  it("çözülemeyen görsel 400 ile reddedilir", async () => {
    const { service, uploads } = makeService();

    await expect(
      service.uploadDocument(
        "u1",
        SellerDocumentType.tax_plate,
        undefined,
        file(Buffer.from("not an image"), "image/png"),
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.user.documentFormats" },
    });
    expect(uploads).toHaveLength(0);
  });
});
