import { ForbiddenException } from "@nestjs/common";
import { BlockedIpGuard } from "./blocked-ip.guard";

/**
 * "IP Engelle" ucu eskiden yalnız bir SecurityLog satırı yazıyordu — hiçbir
 * guard/middleware o satırları okumadığı için "engellendi" denilen IP istek
 * atmaya devam ediyordu (kayıt var, uygulama yok). Bu guard kaydı gerçeğe
 * çevirir: çözülmemiş `ip_block` satırındaki IP'lerden gelen istekler 403 alır.
 *
 * Engeli kaldırmak = ip_block kaydını ÇÖZMEK (resolve) — ayrı bir "unblock"
 * ucu yok, mevcut çözme aksiyonu yeniden kullanılır.
 *
 * Admin yüzeyi (/api/admin, /api/auth/admin) bilerek muaftır: engel ancak o
 * yüzeyden kaldırılabilir; super_admin kendi IP'sini engellerse kalıcı olarak
 * kilitlenmemeli.
 */
describe("BlockedIpGuard", () => {
  const makeGuard = (blockedIps: string[], opts?: { dbThrows?: boolean }) => {
    const findMany = jest.fn(() =>
      opts?.dbThrows
        ? Promise.reject(new Error("db down"))
        : Promise.resolve(blockedIps.map((ip) => ({ ipAddress: ip }))),
    );
    const prisma = { securityLog: { findMany } } as any;
    return { guard: new BlockedIpGuard(prisma), findMany };
  };

  const ctx = (req: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as any;

  const req = (over: Record<string, unknown> = {}) => ({
    originalUrl: "/api/products",
    headers: {},
    ip: "10.0.0.9",
    ...over,
  });

  it("engelli IP'den gelen istek 403 alır", async () => {
    const { guard } = makeGuard(["10.0.0.9"]);
    await expect(guard.canActivate(ctx(req()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("engelli olmayan IP geçer", async () => {
    const { guard } = makeGuard(["1.2.3.4"]);
    await expect(guard.canActivate(ctx(req()))).resolves.toBe(true);
  });

  it("sahte X-Forwarded-For ile engel ATLATILAMAZ (req.ip esastır)", async () => {
    // `trust proxy` ayarlı: Express req.ip'i güvenilen proxy zincirinden doğru
    // çözer. Ham XFF'in İLK girdisi ise istemci kontrolündedir — nginx
    // istemcinin gönderdiği başlığa EKLEME yapar ("8.8.8.8, gerçekIP").
    // Guard ilk girdiyi okusaydı engelli istemci sahte başlıkla kaçardı.
    const { guard } = makeGuard(["10.0.0.9"]);
    await expect(
      guard.canActivate(
        ctx(
          req({
            headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.9" },
            ip: "10.0.0.9", // trust proxy'nin çözdüğü gerçek istemci
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("XFF'te sahte IP engelliyken gerçek IP temizse istek GEÇER (iftira olmaz)", async () => {
    const { guard } = makeGuard(["8.8.8.8"]);
    await expect(
      guard.canActivate(
        ctx(
          req({
            headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" },
            ip: "10.0.0.1",
          }),
        ),
      ),
    ).resolves.toBe(true);
  });

  it("admin yüzeyi muaftır (engel oradan kaldırılır — kilitlenme olmasın)", async () => {
    const { guard } = makeGuard(["10.0.0.9"]);
    await expect(
      guard.canActivate(ctx(req({ originalUrl: "/api/admin/logs/security" }))),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx(req({ originalUrl: "/api/auth/admin/login" }))),
    ).resolves.toBe(true);
  });

  it("liste yalnız ÇÖZÜLMEMİŞ ip_block kayıtlarından kurulur", async () => {
    const { guard, findMany } = makeGuard([]);
    await guard.canActivate(ctx(req()));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: "ip_block",
          resolved: false,
        }),
      }),
    );
  });

  it("DB hatasında fail-open: API'yi düşürmek engellemekten pahalı", async () => {
    const { guard } = makeGuard([], { dbThrows: true });
    await expect(guard.canActivate(ctx(req()))).resolves.toBe(true);
  });
});
