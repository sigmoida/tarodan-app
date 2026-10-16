import {
  adDeviceTypeFor,
  adSlotConflictWhere,
  firstAdPerPosition,
  overlappingAdPlatforms,
  resolveAdClientPlatform,
  type AdSlotCandidate,
} from "./ad-platform.helper";

/**
 * Platform (web / uygulama / ikisi) eşlemeleri ve "yuvada tek reklam"
 * kuralının sorgusu. Servis bu sorguyu olduğu gibi `findFirst`'e verir;
 * burada sabitlenen her satır create ve update'i birlikte bağlar.
 */
describe("adDeviceTypeFor — eski istemciler için türetilmiş deviceType", () => {
  it.each([
    ["web", "desktop"],
    ["app", "mobile"],
    ["all", "all"],
  ] as const)("%s → %s", (platform, device) => {
    expect(adDeviceTypeFor(platform)).toBe(device);
  });
});

describe("resolveAdClientPlatform", () => {
  it("platform esastır (web / app)", () => {
    expect(resolveAdClientPlatform("web")).toBe("web");
    expect(resolveAdClientPlatform("app", "desktop")).toBe("app");
  });

  it("parametre yoksa app (yalnız eski mobil sürümler göndermez)", () => {
    expect(resolveAdClientPlatform()).toBe("app");
    expect(resolveAdClientPlatform(undefined, undefined)).toBe("app");
  });

  it("platform yok ama eski device var → eski web istemcisi", () => {
    expect(resolveAdClientPlatform(undefined, "desktop")).toBe("web");
    expect(resolveAdClientPlatform(undefined, "mobile")).toBe("web");
  });

  it("bilinmeyen platform (ya da istemci olmayan `all`) eşleşmez", () => {
    expect(resolveAdClientPlatform("ios")).toBeNull();
    expect(resolveAdClientPlatform("all")).toBeNull();
  });
});

describe("overlappingAdPlatforms", () => {
  it("web ve app birbiriyle çakışmaz, all ile çakışır", () => {
    expect(overlappingAdPlatforms("web").sort()).toEqual(["all", "web"]);
    expect(overlappingAdPlatforms("app").sort()).toEqual(["all", "app"]);
  });

  it("all her üçüyle çakışır", () => {
    expect(overlappingAdPlatforms("all").sort()).toEqual(["all", "app", "web"]);
  });
});

describe("adSlotConflictWhere", () => {
  const NOW = new Date("2026-10-16T09:00:00Z");
  const DAY = 86_400_000;
  const at = (days: number) => new Date(NOW.getTime() + days * DAY);

  const candidate = (over: Partial<AdSlotCandidate> = {}): AdSlotCandidate => ({
    position: "popup",
    platform: "web",
    isActive: true,
    startDate: null,
    endDate: null,
    ...over,
  });

  it("pasif aday yuva tutmaz → sorgu yok", () => {
    expect(adSlotConflictWhere(candidate({ isActive: false }), NOW)).toBeNull();
  });

  it("tamamen geçmişte kalan aday kimseyi engellemez → sorgu yok", () => {
    expect(
      adSlotConflictWhere(
        candidate({ startDate: at(-10), endDate: at(-1) }),
        NOW,
      ),
    ).toBeNull();
  });

  it("aynı yuva, çakışan platformlar, yalnız aktif rakipler; kendisi hariç", () => {
    expect(adSlotConflictWhere(candidate(), NOW, "ad-1")).toMatchObject({
      id: { not: "ad-1" },
      position: "popup",
      platform: { in: expect.arrayContaining(["web", "all"]) },
      isActive: true,
    });
  });

  it("oluşturmada id süzmesi yok", () => {
    expect(adSlotConflictWhere(candidate(), NOW)).not.toHaveProperty("id");
  });

  it("app adayı web rakibine bakmaz", () => {
    const where = adSlotConflictWhere(candidate({ platform: "app" }), NOW);
    expect(where?.platform).toEqual({ in: ["app", "all"] });
  });

  it("all adayı her platforma bakar", () => {
    const where = adSlotConflictWhere(candidate({ platform: "all" }), NOW);
    expect(
      ((where?.platform as { in: string[] }).in ?? []).slice().sort(),
    ).toEqual(["all", "app", "web"]);
  });

  it("sınırsız aday: bugünden sonra biten ya da bitişsiz her rakip çakışır (geçmiş engel değil)", () => {
    const where = adSlotConflictWhere(candidate(), NOW);
    expect(where?.AND).toEqual([
      { OR: [{ endDate: null }, { endDate: { gte: NOW } }] },
    ]);
  });

  it("gelecekteki pencere: rakip adayın başlangıcından önce bitiyorsa çakışmaz", () => {
    const start = at(5);
    const end = at(10);
    const where = adSlotConflictWhere(
      candidate({ startDate: start, endDate: end }),
      NOW,
    );
    expect(where?.AND).toEqual([
      { OR: [{ endDate: null }, { endDate: { gte: start } }] },
      { OR: [{ startDate: null }, { startDate: { lte: end } }] },
    ]);
  });

  it("başlamış aday: alt sınır bugündür (geçmişte biten rakip engel değil)", () => {
    const end = at(3);
    const where = adSlotConflictWhere(
      candidate({ startDate: at(-5), endDate: end }),
      NOW,
    );
    expect(where?.AND).toEqual([
      { OR: [{ endDate: null }, { endDate: { gte: NOW } }] },
      { OR: [{ startDate: null }, { startDate: { lte: end } }] },
    ]);
  });
});

describe("firstAdPerPosition — vitrin güvenlik ağı", () => {
  it("her yuvadan sıradaki ilk reklam kalır", () => {
    const ads = [
      { id: "h1", position: "header" as const },
      { id: "p1", position: "popup" as const },
      { id: "h2", position: "header" as const },
      { id: "p2", position: "popup" as const },
    ];
    expect(firstAdPerPosition(ads).map((a) => a.id)).toEqual(["h1", "p1"]);
  });
});
