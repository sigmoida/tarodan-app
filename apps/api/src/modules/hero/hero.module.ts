import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { MediaModule } from "../media/media.module";
import { HeroSlideController } from "./hero-slide.controller";
import { HeroSlideService } from "./hero-slide.service";
import { HeroTrackingService } from "./hero-tracking.service";
import { HeroVisibilityService } from "./hero-visibility.service";
import { TrustBadgeController } from "./trust-badge.controller";
import { TrustBadgeService } from "./trust-badge.service";

/**
 * Admin'in yönettiği vitrin içeriği: hero slaytları (ana sayfa + auth) ve
 * güven rozetleri (docs/HERO_CMS.md). Admin uçları AdminModule'de
 * (`AdminHeroController`), yazma bu modülün servislerinden geçer.
 *
 * CacheService global modülden gelir (CacheModule @Global). Süre değerleri
 * saf okuma katmanından (`common/timing-rules`) okunur; TimingRulesModule
 * import edilmez.
 */
@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [HeroSlideController, TrustBadgeController],
  providers: [
    HeroSlideService,
    HeroTrackingService,
    HeroVisibilityService,
    TrustBadgeService,
  ],
  exports: [HeroSlideService, HeroVisibilityService, TrustBadgeService],
})
export class HeroModule {}
