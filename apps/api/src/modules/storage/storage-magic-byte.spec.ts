import { BadRequestException } from "@nestjs/common";
import { StorageService } from "./storage.service";

/**
 * #71 — image uploads must be validated by their real magic bytes, not the
 * client-supplied Content-Type (which is spoofable). A payload that claims
 * `image/png` but is not actually an image must be rejected.
 */
describe("StorageService — upload magic-byte validation", () => {
  function makeService() {
    const config = { get: (_k: string, d?: unknown) => d } as any;
    const prisma = {} as any;
    const svc = new StorageService(config, prisma);
    // Reach the validation path without real S3 credentials.
    (svc as any).isS3Available = true;
    (svc as any).s3Client = { send: jest.fn().mockResolvedValue({}) };
    return svc;
  }

  it("rejects a spoofed image (declared image/png, non-image bytes)", async () => {
    const svc = makeService();
    const fakeImage = Buffer.from('<?php echo "not an image"; ?>', "utf8");

    await expect(
      svc.uploadFile(fakeImage, {
        bucket: "products",
        mimeType: "image/png",
        filename: "evil.png",
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a declared type outside the allow-list (unchanged behaviour)", async () => {
    const svc = makeService();
    await expect(
      svc.uploadFile(Buffer.from("x"), {
        bucket: "products",
        mimeType: "application/pdf",
      } as any),
    ).rejects.toThrow(/Geçersiz dosya tipi/);
  });

  it("passes magic-byte validation for a real PNG (fails later at the S3 step, not the sniff)", async () => {
    const svc = makeService();
    // 8-byte PNG signature + IHDR so file-type detects image/png.
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    ]);

    // A valid PNG must NOT be rejected with the content-type error — any later
    // failure is the (unmocked) S3/persist pipeline, not the magic-byte gate.
    await expect(
      svc.uploadFile(png, {
        bucket: "products",
        mimeType: "image/png",
        filename: "ok.png",
      } as any),
    ).rejects.not.toThrow(/geçerli bir resim değil/);
  });

  // #71 — documents/tickets buckets previously skipped content validation, so a
  // spoofed "PDF" (e.g. a seller invoice upload) could smuggle active content in.
  it("rejects a spoofed document (declared application/pdf, non-PDF/non-image bytes)", async () => {
    const svc = makeService();
    const fakePdf = Buffer.from(
      "<html><script>alert(1)</script></html>",
      "utf8",
    );

    await expect(
      svc.uploadFile(fakePdf, {
        bucket: "documents",
        mimeType: "application/pdf",
        filename: "evil.pdf",
      } as any),
    ).rejects.toThrow(/geçerli bir belge/);
  });

  it("passes magic-byte validation for a real PDF in the documents bucket", async () => {
    const svc = makeService();
    // "%PDF-1.4" header — file-type detects application/pdf, as a real
    // server-generated invoice PDF would.
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.4\n", "ascii"),
      Buffer.from("1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "ascii"),
    ]);

    await expect(
      svc.uploadFile(pdf, {
        bucket: "documents",
        mimeType: "application/pdf",
        filename: "invoice.pdf",
      } as any),
    ).rejects.not.toThrow(/geçerli bir belge/);
  });
});
