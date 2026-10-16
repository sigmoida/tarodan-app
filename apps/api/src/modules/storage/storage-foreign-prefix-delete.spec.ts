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

/**
 * `deleteFile` S3 hatasını varsayılan olarak yutar (best-effort çağıranlar);
 * yeniden deneyen çağıran (outbox) `throwOnError` ile hatayı görür.
 */
describe("StorageService.deleteFile — throwOnError", () => {
  function makeService() {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === "S3_ENV_PREFIX" ? "staging" : fallback,
    };
    const prisma = {
      mediaFile: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    };
    const svc = new StorageService(config as never, prisma as never);
    const send = jest.fn().mockRejectedValue(new Error("s3 down"));
    Object.assign(svc as object, { isS3Available: true, s3Client: { send } });
    return { svc, send };
  }

  it("varsayılan olarak S3 hatasını yalnız loglar", async () => {
    const { svc, send } = makeService();
    await expect(
      svc.deleteFile("avatars", "staging/avatars/a.webp"),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("throwOnError ile S3 hatasını yükseltir", async () => {
    const { svc } = makeService();
    await expect(
      svc.deleteFile("avatars", "staging/avatars/a.webp", {
        throwOnError: true,
      }),
    ).rejects.toThrow("s3 down");
  });
});
