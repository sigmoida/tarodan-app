import { OutboxStatus } from "@prisma/client";
import { OutboxDrainerService } from "./outbox-drainer.service";

/**
 * CRITICAL: drainer satırları `pending → processing` CAS ile claim ediyor ama
 * bayat `processing` satırlarını geri alan HİÇBİR mekanizma yoktu. İşin ortasında
 * çöken bir süreç şunu bırakıyordu:
 *   1) para yan-etkisi (fulfillment yedeği, iade faturası ters kaydı, kargo iptali)
 *      bir daha ASLA denenmiyor;
 *   2) readiness kontrolü 5 dakikadan eski `processing` satırı görünce /ready'yi
 *      TÜM pod'larda düşürüyor → tek crash sitewide 503.
 * Bull'un stall kurtarması bu DB-tarafı claim'i göremez; reclaim şart.
 */
describe("OutboxDrainerService — stale processing reclaim", () => {
  const makeService = (rows: any[]) => {
    const updates: any[] = [];
    const prisma = {
      outboxEvent: {
        updateMany: jest.fn().mockImplementation((arg: any) => {
          updates.push(arg);
          return Promise.resolve({ count: rows.length });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new OutboxDrainerService(
      prisma as any,
      { get: jest.fn() } as any,
      { get: () => undefined } as any,
      {} as any,
    );
    return { service, prisma, updates };
  };

  it("bayat processing satırları pending'e döndürülür ve deneme sayacı artar", async () => {
    const { service, updates } = makeService([{ id: "e1" }]);

    const reclaimed = await service.reclaimStaleProcessing();

    expect(reclaimed).toBe(1);
    const promo = updates.find(
      (u: any) => u.data?.status === OutboxStatus.pending,
    );
    expect(promo).toBeDefined();
    // Yalnız processing satırlarına dokunmalı (tamamlananlar diriltilmemeli).
    expect(promo.where.status).toBe(OutboxStatus.processing);
    // Eşik: yalnız yeterince eski satırlar (aktif işi kesmemek için).
    expect(promo.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(promo.data.attempts).toEqual({ increment: 1 });
  });

  it("reclaim drain turunun parçası olarak çalışır", async () => {
    const { service, prisma } = makeService([{ id: "e1" }]);

    await service.runDrain();

    // Drain, önce bayat claim'leri geri alır; sonra due satırları işler.
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalled();
    expect(prisma.outboxEvent.findMany).toHaveBeenCalled();
  });

  it("reclaim edilen satır sayısı drain özetinde raporlanır", async () => {
    const { service } = makeService([{ id: "e1" }]);

    const result = await service.runDrain();

    expect(result.stats).toHaveProperty("reclaimed", 1);
    expect(result.summary).toContain("reclaim");
  });
});
