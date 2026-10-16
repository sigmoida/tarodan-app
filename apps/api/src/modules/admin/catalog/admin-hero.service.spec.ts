import { ConflictException } from "@nestjs/common";
import { AdminHeroService } from "./admin-hero.service";
import type { HeroSlideService } from "../../hero/hero-slide.service";
import type { TrustBadgeService } from "../../hero/trust-badge.service";
import type { HeroVisibilityService } from "../../hero/hero-visibility.service";
import type { AdminAuditService } from "../ops/admin-audit.service";

/**
 * Hero/rozet ekranının admin yüzü: yazma domain servisinden geçer, her
 * yazımdan sonra önce/sonra çiftiyle bir denetim satırı. Domain reddederse
 * (409) denetim yazılmaz.
 */

const slide = (over: Record<string, unknown> = {}) => ({
  id: "slide-1",
  placement: "home",
  isActive: true,
  ...over,
});
const badge = (over: Record<string, unknown> = {}) => ({
  id: "badge-1",
  icon: "truck",
  ...over,
});

function makeService() {
  const heroSlides = {
    create: jest.fn().mockResolvedValue(slide()),
    get: jest.fn().mockResolvedValue(slide()),
    update: jest.fn().mockResolvedValue(slide({ isActive: false })),
    remove: jest.fn().mockResolvedValue(undefined),
    reorder: jest.fn().mockResolvedValue([slide()]),
  };
  const trustBadges = {
    create: jest.fn().mockResolvedValue(badge()),
    get: jest.fn().mockResolvedValue(badge()),
    update: jest.fn().mockResolvedValue(badge({ icon: "shield-check" })),
    remove: jest.fn().mockResolvedValue(undefined),
    reorder: jest.fn().mockResolvedValue([badge()]),
  };
  const visibility = {
    getHome: jest.fn().mockResolvedValue({ web: true, app: true }),
    updateHome: jest
      .fn()
      .mockResolvedValue({ visibility: { web: true, app: true }, changes: [] }),
  };
  const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminHeroService(
    heroSlides as unknown as HeroSlideService,
    trustBadges as unknown as TrustBadgeService,
    visibility as unknown as HeroVisibilityService,
    audit as unknown as AdminAuditService,
  );
  return { service, heroSlides, trustBadges, visibility, audit };
}

describe("AdminHeroService — hero slaytları", () => {
  it("oluşturma: domain'e yazar, sonra denetler", async () => {
    const { service, heroSlides, audit } = makeService();
    const dto = { placement: "home" } as never;
    await expect(service.createSlide("admin-1", dto)).resolves.toEqual(slide());
    expect(heroSlides.create).toHaveBeenCalledWith(dto);
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "hero_slide_create",
      "HeroSlide",
      "slide-1",
      null,
      slide(),
    );
  });

  it("güncelleme: önce/sonra çiftini denetler", async () => {
    const { service, audit } = makeService();
    await service.updateSlide("admin-1", "slide-1", { isActive: false });
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "hero_slide_update",
      "HeroSlide",
      "slide-1",
      slide(),
      slide({ isActive: false }),
    );
  });

  it("silme: silinen slaytı denetler", async () => {
    const { service, heroSlides, audit } = makeService();
    await service.removeSlide("admin-1", "slide-1");
    expect(heroSlides.remove).toHaveBeenCalledWith("slide-1");
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "hero_slide_delete",
      "HeroSlide",
      "slide-1",
      slide(),
      null,
    );
  });

  it("domain 409 verirse denetim yazılmaz", async () => {
    const { service, heroSlides, audit } = makeService();
    heroSlides.remove.mockRejectedValueOnce(new ConflictException());
    await expect(
      service.removeSlide("admin-1", "slide-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  it("sıralama: yerleşimle anılan tek satır", async () => {
    const { service, audit } = makeService();
    await service.reorderSlides("admin-1", ["slide-1"]);
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "hero_slide_reorder",
      "HeroSlide",
      "home",
      null,
      { ids: ["slide-1"] },
    );
  });
});

describe("AdminHeroService — ana sayfa hero anahtarları", () => {
  it("değişen her satırı kendi kimliğiyle, önce/sonra değeriyle denetler", async () => {
    const { service, visibility, audit } = makeService();
    visibility.updateHome.mockResolvedValueOnce({
      visibility: { web: false, app: false },
      changes: [
        {
          platform: "web",
          settingId: "setting-web",
          settingKey: "hero_home_enabled_web",
          before: true,
          after: false,
        },
        {
          platform: "app",
          settingId: "setting-app",
          settingKey: "hero_home_enabled_app",
          before: true,
          after: false,
        },
      ],
    });
    await expect(
      service.updateHomeVisibility("admin-1", { web: false, app: false }),
    ).resolves.toEqual({ web: false, app: false });
    expect(visibility.updateHome).toHaveBeenCalledWith({
      web: false,
      app: false,
    });
    expect(audit.createAuditLog.mock.calls).toEqual([
      [
        "admin-1",
        "hero_visibility_update",
        "PlatformSetting",
        "setting-web",
        { settingKey: "hero_home_enabled_web", enabled: true },
        { settingKey: "hero_home_enabled_web", enabled: false },
      ],
      [
        "admin-1",
        "hero_visibility_update",
        "PlatformSetting",
        "setting-app",
        { settingKey: "hero_home_enabled_app", enabled: true },
        { settingKey: "hero_home_enabled_app", enabled: false },
      ],
    ]);
  });

  it("değer değişmediyse (ya da gövde boşsa) denetim yazılmaz", async () => {
    const { service, audit } = makeService();
    await expect(
      service.updateHomeVisibility("admin-1", { web: true }),
    ).resolves.toEqual({ web: true, app: true });
    await service.updateHomeVisibility("admin-1", {});
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  it("domain yazamazsa denetim yazılmaz", async () => {
    const { service, visibility, audit } = makeService();
    visibility.updateHome.mockRejectedValueOnce(new Error("db"));
    await expect(
      service.updateHomeVisibility("admin-1", { web: false }),
    ).rejects.toThrow("db");
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("AdminHeroService — güven rozetleri", () => {
  it("oluşturma/güncelleme/silme/sıralama denetlenir", async () => {
    const { service, audit } = makeService();
    await service.createBadge("admin-1", { icon: "truck" } as never);
    await service.updateBadge("admin-1", "badge-1", {
      icon: "shield-check",
    } as never);
    await service.removeBadge("admin-1", "badge-1");
    await service.reorderBadges("admin-1", ["badge-1"]);
    expect(audit.createAuditLog.mock.calls.map((c) => c.slice(1, 4))).toEqual([
      ["trust_badge_create", "TrustBadge", "badge-1"],
      ["trust_badge_update", "TrustBadge", "badge-1"],
      ["trust_badge_delete", "TrustBadge", "badge-1"],
      ["trust_badge_reorder", "TrustBadge", "trust_badges"],
    ]);
  });
});
