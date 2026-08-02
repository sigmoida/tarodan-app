import { HealthService } from "./health.service";

/**
 * CRITICAL: readiness kontrolü 5 dakikadan eski `processing` outbox satırı
 * görünce /ready'yi FAIL yapıyordu — hiçbir rol filtresi yok. Traefik
 * /api/health/ready'yi sağlık kontrolü olarak kullandığı için tek bir crash
 * TÜM API replikalarını yükten çekiyordu (sitewide 503), üstelik yeniden
 * başlatmak da düzeltmiyordu.
 *
 * Doğru davranış: bayat satır bir ALARM'dır (drain turu onu zaten kurtarır),
 * trafiği kesme gerekçesi değildir. Yalnız kurtarılamayan birikme (DLQ eşiği)
 * hazır-değil sayılır.
 */
describe("HealthService — outbox readiness", () => {
  const makeService = (counts: { stale: number; dead: number }) => {
    const prisma = {
      outboxEvent: {
        count: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.status === "dead" ? counts.dead : counts.stale,
            ),
          ),
      },
    };
    const logger = { error: jest.fn(), warn: jest.fn() };
    const service = new HealthService(
      prisma as any,
      { get: () => undefined } as any,
      {} as any,
    );
    (service as any).logger = logger;
    return { service, logger, prisma };
  };

  const callCheck = (service: HealthService): Promise<boolean> =>
    (service as any).checkOutbox();

  const originalEnv = process.env.NODE_ENV;
  beforeAll(() => {
    process.env.NODE_ENV = "production";
  });
  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("bayat processing satırı trafiği KESMEZ, yalnız alarm verir", async () => {
    const { service, logger } = makeService({ stale: 3, dead: 0 });

    await expect(callCheck(service)).resolves.toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("OUTBOX_STALE_PROCESSING"),
    );
  });

  it("DLQ birikmesi hazır-değil sayılır (kurtarılamayan yan-etki)", async () => {
    const { service } = makeService({ stale: 0, dead: 25 });

    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("temiz outbox → hazır, alarm yok", async () => {
    const { service, logger } = makeService({ stale: 0, dead: 0 });

    await expect(callCheck(service)).resolves.toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
