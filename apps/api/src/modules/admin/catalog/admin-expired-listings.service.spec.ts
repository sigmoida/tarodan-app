import { ForbiddenException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import { AdminExpiredListingsService } from "./admin-expired-listings.service";

/**
 * Tek seferlik bakım: bu özellikten önce süresi dolmuş (işaretsiz) ilanları
 * muhafazakâr bir kuralla bulur; önce kuru çalıştırma, sonra uygulama.
 */
describe("AdminExpiredListingsService", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const PUBLISHED = new Date("2026-05-01T10:00:00.000Z");

  /** Yayından `days` gün sonra son yazımı yapılmış pasif ilan. */
  const row = (
    id: string,
    days: number,
    patch: Record<string, unknown> = {},
  ) => ({
    id,
    title: `İlan ${id}`,
    publishedAt: PUBLISHED,
    createdAt: new Date(PUBLISHED.getTime() - 3 * DAY),
    updatedAt: new Date(PUBLISHED.getTime() + days * DAY),
    quantity: 3,
    seller: { isBanned: false, deletedAt: null },
    ...patch,
  });

  const makeService = (rows: ReturnType<typeof row>[]) => {
    const prisma = {
      product: {
        // Gerçek sayfalama davranışı: cursor'dan sonraki `take` kadar satır.
        findMany: jest.fn(
          async (args: {
            take: number;
            cursor?: { id: string };
            skip?: number;
          }) => {
            const start = args.cursor
              ? rows.findIndex((r) => r.id === args.cursor!.id) + (args.skip ?? 0)
              : 0;
            return rows.slice(start, start + args.take);
          },
        ),
      },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const audit = { createRequiredAuditLog: jest.fn().mockResolvedValue({}) };
    const renewal = {
      markExpired: jest.fn(async (ids: string[]) => ids),
      reactivateByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminExpiredListingsService(
      prisma as any,
      audit as any,
      renewal as any,
    );
    return { service, prisma, audit, renewal };
  };

  const rows = [
    row("expired-1", 61), // süre dolumu: seçilir
    row("expired-2", 60.5), // seçilir
    row("paused", 20), // ömür dolmadan elle pasife alma → seçilmez
    row("touched-later", 150), // pasife alındıktan çok sonra yazılmış → seçilmez
    row("no-stock", 61, { quantity: 0 }), // stok bitişi olabilir → seçilmez
    row("banned", 61, { seller: { isBanned: true, deletedAt: null } }),
  ];

  describe("seçim kuralı", () => {
    it("yalnız süre-dolumu izi taşıyanları seçer ve dışarıda bıraktıklarını nedene göre sayar", async () => {
      const { service } = makeService(rows);

      const report = await service.run("admin-1", {});

      expect(report.scanned).toBe(6);
      expect(report.matched).toBe(2);
      expect(report.sample.map((s) => s.id)).toEqual(["expired-1", "expired-2"]);
      expect(report.skipped).toEqual({
        not_at_lifetime: 1,
        touched_after_expiry: 1,
        out_of_stock: 1,
        seller_unavailable: 1,
      });
    });

    it("yalnız nedeni kayıtsız, pasif, gerçek ilanları tarar (karantina/moderasyon dokunulmaz)", async () => {
      const { service, prisma } = makeService(rows);
      await service.run("admin-1", {});

      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({
        kind: "listing",
        status: "inactive",
        inactiveReason: null,
      });
    });

    it("ömür parametresi verilmezse bugünkü Süreler ve Kurallar değerini kullanır", async () => {
      const { service } = makeService(rows);
      const report = await service.run("admin-1", {});
      expect(report.rule).toEqual({ ttlDays: 60, graceDays: 3 });
    });

    it("ömür ve tolerans parametreyle değiştirilebilir", async () => {
      const { service } = makeService([row("a", 31)]);
      const report = await service.run("admin-1", { ttlDays: 30, graceDays: 2 });
      expect(report.rule).toEqual({ ttlDays: 30, graceDays: 2 });
      expect(report.matched).toBe(1);
    });

    it("birden çok tarama sayfasını (500'lük) gezer", async () => {
      const many = Array.from({ length: 1203 }, (_, i) => row(`id-${i}`, 61));
      const { service, prisma } = makeService(many);

      const report = await service.run("admin-1", { limit: 5 });

      expect(report.scanned).toBe(1203);
      expect(report.matched).toBe(1203);
      expect(prisma.product.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe("kuru çalıştırma (varsayılan)", () => {
    it("hiçbir şey yazmaz, denetim kaydı da açmaz", async () => {
      const { service, audit, renewal } = makeService(rows);

      const report = await service.run("admin-1", {});

      expect(report.dryRun).toBe(true);
      expect(report.mode).toBe("mark");
      expect(report.applied).toBeNull();
      expect(renewal.markExpired).not.toHaveBeenCalled();
      expect(renewal.reactivateByAdmin).not.toHaveBeenCalled();
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });

    it("mod reactivate olsa bile dryRun açıkken yazmaz", async () => {
      const { service, renewal } = makeService(rows);
      await service.run("admin-1", { mode: "reactivate" });
      expect(renewal.markExpired).not.toHaveBeenCalled();
      expect(renewal.reactivateByAdmin).not.toHaveBeenCalled();
    });
  });

  describe("uygulama", () => {
    it("varsayılan mod yalnız işaretler; reaktive etmez", async () => {
      const { service, renewal } = makeService(rows);

      const report = await service.run("admin-1", { dryRun: false });

      expect(renewal.markExpired).toHaveBeenCalledWith(
        ["expired-1", "expired-2"],
        { stampBaseline: false },
      );
      expect(renewal.reactivateByAdmin).not.toHaveBeenCalled();
      expect(report.applied).toEqual({ marked: 2, reactivated: 0, failed: [] });
    });

    it("stampBaseline yalnız mark modunda iletilir", async () => {
      const { service, renewal } = makeService(rows);

      await service.run("admin-1", { dryRun: false, stampBaseline: true });
      expect(renewal.markExpired).toHaveBeenLastCalledWith(
        ["expired-1", "expired-2"],
        { stampBaseline: true },
      );

      await service.run("admin-1", {
        dryRun: false,
        mode: "reactivate",
        stampBaseline: true,
      });
      expect(renewal.markExpired).toHaveBeenLastCalledWith(
        ["expired-1", "expired-2"],
        { stampBaseline: false },
      );
    });

    it("reactivate modu önce işaretler, sonra her ilanı sırayla yeniden açar", async () => {
      const { service, renewal } = makeService(rows);

      const report = await service.run("admin-1", {
        dryRun: false,
        mode: "reactivate",
      });

      expect(renewal.reactivateByAdmin.mock.calls.map((c) => c[0])).toEqual([
        "expired-1",
        "expired-2",
      ]);
      expect(report.applied).toEqual({ marked: 2, reactivated: 2, failed: [] });
    });

    it("yeniden açılamayan ilan (limit vb.) gerekçesiyle raporlanır ve işaretli kalır", async () => {
      const { service, renewal } = makeService(rows);
      renewal.reactivateByAdmin
        .mockRejectedValueOnce(
          new ForbiddenException(
            i18nMessage("server.product.listingLimitReached", {
              tierName: "Free",
              maxListings: 3,
            }),
          ),
        )
        .mockResolvedValueOnce(undefined);

      const report = await service.run("admin-1", {
        dryRun: false,
        mode: "reactivate",
      });

      expect(report.applied).toEqual({
        marked: 2,
        reactivated: 1,
        failed: [
          { id: "expired-1", errorKey: "server.product.listingLimitReached" },
        ],
      });
    });

    it("limit uygulanır: yalnız ilk N işlenir, kalanı rapor edilir", async () => {
      const { service, renewal } = makeService(rows);

      const report = await service.run("admin-1", { dryRun: false, limit: 1 });

      expect(renewal.markExpired).toHaveBeenCalledWith(["expired-1"], {
        stampBaseline: false,
      });
      expect(report.selected).toBe(1);
      expect(report.remaining).toBe(1);
    });

    it("uygulamadan ÖNCE fail-closed denetim kaydı yazılır; yazılamazsa hiçbir ilana dokunulmaz", async () => {
      const { service, audit, renewal } = makeService(rows);
      audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

      await expect(
        service.run("admin-1", { dryRun: false }),
      ).rejects.toThrow("audit down");

      expect(renewal.markExpired).not.toHaveBeenCalled();
    });

    it("denetim kaydı modu, kuralı ve etkilenen ilanları taşır", async () => {
      const { service, audit } = makeService(rows);
      await service.run("admin-1", { dryRun: false });

      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "expired_listings_maintenance",
        "Product",
        "bulk",
        null,
        {
          mode: "mark",
          rule: { ttlDays: 60, graceDays: 3 },
          stampBaseline: false,
          productIds: ["expired-1", "expired-2"],
        },
      );
    });

    it("eşleşen yoksa yazmaz ve denetim açmaz", async () => {
      const { service, audit, renewal } = makeService([row("paused", 10)]);
      const report = await service.run("admin-1", { dryRun: false });
      expect(report.applied).toBeNull();
      expect(renewal.markExpired).not.toHaveBeenCalled();
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });
  });
});
