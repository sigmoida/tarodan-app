import { StorageService } from "./storage.service";

/**
 * Staging, production'ın maskeli kopyasıyla çalışır (docs/UAT_REFRESH.md):
 * satırlar `prod/…` key'leri taşır. Bir ortam başka bir ortamın nesnesini
 * ASLA silmez — `deleteFileByKey` yalnız kendi önekindeki key'i S3'ten siler.
 */
describe("StorageService.deleteFileByKey — environment prefix boundary", () => {
  function makeService(envPrefix: string) {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === "S3_ENV_PREFIX" ? envPrefix : fallback,
    };
    const prisma = {
      mediaFile: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    };
    const svc = new StorageService(config as never, prisma as never);
    const send = jest.fn().mockResolvedValue({});
    Object.assign(svc as object, { isS3Available: true, s3Client: { send } });
    return { svc, send, prisma };
  }

  it("deletes an object under its own prefix", async () => {
    const { svc, send, prisma } = makeService("staging");
    await svc.deleteFileByKey("staging/products/temp/a.webp");
    expect(prisma.mediaFile.deleteMany).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never deletes a production object from staging (row only)", async () => {
    const { svc, send, prisma } = makeService("staging");
    await svc.deleteFileByKey("prod/products/uploads/a.webp");
    expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({
      where: { key: "prod/products/uploads/a.webp" },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
