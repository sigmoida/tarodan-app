import { Injectable } from "@nestjs/common";
import type {
  AdminHeroSlideDto,
  AdminTrustBadgeDto,
  HeroHomeVisibilityDto,
} from "@tarodan/types";
import { HeroSlideService } from "../../hero/hero-slide.service";
import { HeroVisibilityService } from "../../hero/hero-visibility.service";
import { TrustBadgeService } from "../../hero/trust-badge.service";
import {
  CreateHeroSlideDto,
  CreateTrustBadgeDto,
  UpdateHeroHomeVisibilityDto,
  UpdateHeroSlideDto,
  UpdateTrustBadgeDto,
} from "../../hero/dto";
import { AdminAuditService } from "../ops/admin-audit.service";

/**
 * Vitrin hero'su + güven rozetleri ekranının admin yüzü. Yazma domain
 * servisinden geçer (§1); bu katman yalnız denetim kaydını ekler — her
 * yazım için önce/sonra çiftiyle bir satır. İçerik yazımı para/politika
 * değil: denetim best-effort (`createAuditLog`), yazılamazsa değişiklik geri
 * alınmaz, hata log'lanır.
 */
@Injectable()
export class AdminHeroService {
  constructor(
    private readonly heroSlides: HeroSlideService,
    private readonly trustBadges: TrustBadgeService,
    private readonly visibility: HeroVisibilityService,
    private readonly audit: AdminAuditService,
  ) {}

  // ==================== HERO SLIDES ====================

  async createSlide(
    adminId: string,
    dto: CreateHeroSlideDto,
  ): Promise<AdminHeroSlideDto> {
    const slide = await this.heroSlides.create(dto);
    await this.audit.createAuditLog(
      adminId,
      "hero_slide_create",
      "HeroSlide",
      slide.id,
      null,
      slide,
    );
    return slide;
  }

  async updateSlide(
    adminId: string,
    id: string,
    dto: UpdateHeroSlideDto,
  ): Promise<AdminHeroSlideDto> {
    const before = await this.heroSlides.get(id);
    const after = await this.heroSlides.update(id, dto);
    await this.audit.createAuditLog(
      adminId,
      "hero_slide_update",
      "HeroSlide",
      id,
      before,
      after,
    );
    return after;
  }

  async removeSlide(adminId: string, id: string): Promise<void> {
    const before = await this.heroSlides.get(id);
    await this.heroSlides.remove(id);
    await this.audit.createAuditLog(
      adminId,
      "hero_slide_delete",
      "HeroSlide",
      id,
      before,
      null,
    );
  }

  async reorderSlides(
    adminId: string,
    ids: string[],
  ): Promise<AdminHeroSlideDto[]> {
    const slides = await this.heroSlides.reorder(ids);
    await this.audit.createAuditLog(
      adminId,
      "hero_slide_reorder",
      "HeroSlide",
      // Sıralama bir yerleşimin bütününe dokunur; kayıt yerleşimle anılır.
      slides[0]?.placement ?? "hero_slides",
      null,
      { ids },
    );
    return slides;
  }

  /**
   * Ana sayfa hero'sunun istemci başına anahtarı. Denetim kaydı yalnız
   * gerçekten değişen satır için, satırın kendi kimliğiyle yazılır; değer
   * zaten aynıysa (ya da gövde boşsa) kayıt düşülmez.
   */
  async updateHomeVisibility(
    adminId: string,
    dto: UpdateHeroHomeVisibilityDto,
  ): Promise<HeroHomeVisibilityDto> {
    const { visibility, changes } = await this.visibility.updateHome(dto);
    for (const change of changes) {
      await this.audit.createAuditLog(
        adminId,
        "hero_visibility_update",
        "PlatformSetting",
        change.settingId,
        { settingKey: change.settingKey, enabled: change.before },
        { settingKey: change.settingKey, enabled: change.after },
      );
    }
    return visibility;
  }

  // ==================== TRUST BADGES ====================

  async createBadge(
    adminId: string,
    dto: CreateTrustBadgeDto,
  ): Promise<AdminTrustBadgeDto> {
    const badge = await this.trustBadges.create(dto);
    await this.audit.createAuditLog(
      adminId,
      "trust_badge_create",
      "TrustBadge",
      badge.id,
      null,
      badge,
    );
    return badge;
  }

  async updateBadge(
    adminId: string,
    id: string,
    dto: UpdateTrustBadgeDto,
  ): Promise<AdminTrustBadgeDto> {
    const before = await this.trustBadges.get(id);
    const after = await this.trustBadges.update(id, dto);
    await this.audit.createAuditLog(
      adminId,
      "trust_badge_update",
      "TrustBadge",
      id,
      before,
      after,
    );
    return after;
  }

  async removeBadge(adminId: string, id: string): Promise<void> {
    const before = await this.trustBadges.get(id);
    await this.trustBadges.remove(id);
    await this.audit.createAuditLog(
      adminId,
      "trust_badge_delete",
      "TrustBadge",
      id,
      before,
      null,
    );
  }

  async reorderBadges(
    adminId: string,
    ids: string[],
  ): Promise<AdminTrustBadgeDto[]> {
    const badges = await this.trustBadges.reorder(ids);
    await this.audit.createAuditLog(
      adminId,
      "trust_badge_reorder",
      "TrustBadge",
      "trust_badges",
      null,
      { ids },
    );
    return badges;
  }
}
