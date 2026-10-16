import { HeroSlideController } from "./hero-slide.controller";
import type { HeroSlideService } from "./hero-slide.service";
import type { HeroTrackingService } from "./hero-tracking.service";

/**
 * Public okuma: istemci kendini `?platform=` ile tanıtır. Parametresiz istek
 * yalnız eski mobil sürümlerden gelir → `app`. Yanıt şekli (çıplak dizi)
 * değişmez.
 */
function makeController() {
  const heroSlides = { listLive: jest.fn().mockResolvedValue([]) };
  const controller = new HeroSlideController(
    heroSlides as unknown as HeroSlideService,
    {} as HeroTrackingService,
  );
  return { controller, heroSlides };
}

describe("HeroSlideController.list", () => {
  it("platform verilmezse app sayılır", async () => {
    const { controller, heroSlides } = makeController();
    await expect(controller.list({ placement: "home" })).resolves.toEqual([]);
    expect(heroSlides.listLive).toHaveBeenCalledWith("home", "app");
  });

  it.each(["web", "app"] as const)(
    "platform=%s olduğu gibi geçer",
    async (platform) => {
      const { controller, heroSlides } = makeController();
      await controller.list({ placement: "auth_default", platform });
      expect(heroSlides.listLive).toHaveBeenCalledWith(
        "auth_default",
        platform,
      );
    },
  );
});
