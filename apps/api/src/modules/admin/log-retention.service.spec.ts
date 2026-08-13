import { LogRetentionService } from "./log-retention.service";

/**
 * Log tablolarının hiçbirinde temizlik yoktu: ne saklama süresi, ne cron, ne
 * tek bir `deleteMany`. En hızlı büyüyeni `error_logs` — interceptor 400'den
 * büyük HER yanıtı (her doğrulama hatası, süresi dolmuş token'dan gelen her
 * 401, her 404) stack trace ve redakte gövdeyle birlikte yazıyor.
 *
 * Saklama: hata 30g, güvenlik 180g, e-posta 90g. DENETİM İZİ SİLİNMEZ —
 * "kim neyi ne zaman değiştirdi"nin tek kaydı odur ve hacmi düşüktür.
 */
describe("LogRetentionService", () => {
  const makePrisma = (counts: Record<string, number>) => ({
    errorLog: {
      deleteMany: jest.fn().mockResolvedValue({ count: counts.error ?? 0 }),
    },
    securityLog: {
      deleteMany: jest.fn().mockResolvedValue({ count: counts.security ?? 0 }),
    },
    emailLog: {
      deleteMany: jest.fn().mockResolvedValue({ count: counts.email ?? 0 }),
    },
    notificationLog: {
      deleteMany: jest
        .fn()
        .mockResolvedValue({ count: counts.notification ?? 0 }),
    },
    auditLog: { deleteMany: jest.fn() },
  });

  const cutoffOf = (mock: jest.Mock) =>
    mock.mock.calls[0][0].where.createdAt.lt as Date;

  const daysAgo = (cutoff: Date) =>
    Math.round((Date.now() - cutoff.getTime()) / 86_400_000);

  it("her tabloyu kendi saklama süresiyle temizler", async () => {
    const prisma = makePrisma({
      error: 120,
      security: 3,
      email: 40,
      notification: 900,
    });
    const service = new LogRetentionService(prisma as any);

    const result = await service.purgeExpiredLogs();

    expect(daysAgo(cutoffOf(prisma.errorLog.deleteMany))).toBe(30);
    expect(daysAgo(cutoffOf(prisma.securityLog.deleteMany))).toBe(180);
    expect(daysAgo(cutoffOf(prisma.emailLog.deleteMany))).toBe(90);
    // Bildirim satırları (zil + teslimat izleri) süresiz birikiyordu; artık
    // TÜM kanallar (in_app dahil) varsayılan 180 günde silinir.
    expect(daysAgo(cutoffOf(prisma.notificationLog.deleteMany))).toBe(180);
    expect(result).toMatchObject({
      error: 120,
      security: 3,
      email: 40,
      notification: 900,
    });
  });

  it("bildirim saklama süresi NOTIFICATION_LOG_RETENTION_DAYS ile ayarlanır", async () => {
    process.env.NOTIFICATION_LOG_RETENTION_DAYS = "30";
    try {
      const prisma = makePrisma({});
      const service = new LogRetentionService(prisma as any);

      await service.purgeExpiredLogs();

      expect(daysAgo(cutoffOf(prisma.notificationLog.deleteMany))).toBe(30);
      // Kanal filtresi YOK: in_app dahil bütün eski satırlar silinir.
      const where = prisma.notificationLog.deleteMany.mock.calls[0][0].where;
      expect(where.channel).toBeUndefined();
    } finally {
      delete process.env.NOTIFICATION_LOG_RETENTION_DAYS;
    }
  });

  it("çözülmemiş ip_block kayıtları YAŞI NE OLURSA OLSUN silinmez", async () => {
    // Engel listesi = çözülmemiş ip_block SecurityLog satırları
    // (BlockedIpGuard). Temizlik yalnız yaşa baksaydı her IP engeli 180 günde
    // sessizce, iz bırakmadan kalkardı.
    const prisma = makePrisma({});
    const service = new LogRetentionService(prisma as any);

    await service.purgeExpiredLogs();

    const where = prisma.securityLog.deleteMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({ eventType: "ip_block", resolved: false });
  });

  it("DENETİM izine asla dokunmaz", async () => {
    const prisma = makePrisma({});
    const service = new LogRetentionService(prisma as any);

    await service.purgeExpiredLogs();

    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("silinecek satır yoksa sayaçlar sıfır döner", async () => {
    const prisma = makePrisma({});
    const service = new LogRetentionService(prisma as any);

    await expect(service.purgeExpiredLogs()).resolves.toEqual({
      error: 0,
      security: 0,
      email: 0,
      notification: 0,
    });
  });

  it("bir tablo patlasa da diğerleri temizlenir", async () => {
    const prisma = makePrisma({ security: 5, email: 7, notification: 11 });
    prisma.errorLog.deleteMany.mockRejectedValue(new Error("lock timeout"));
    const service = new LogRetentionService(prisma as any);

    const result = await service.purgeExpiredLogs();

    expect(result.error).toBe(0);
    expect(result.security).toBe(5);
    expect(result.email).toBe(7);
    expect(result.notification).toBe(11);
  });
});
