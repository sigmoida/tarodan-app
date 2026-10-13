import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TrustBadge } from "@prisma/client";
import {
  normalizeLocalizedText,
  type AdminTrustBadgeDto,
  type LocalizedText,
  type TrustBadgeDto,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";
import {
  defaultTimingValues,
  loadTimingValues,
  type TimingValues,
} from "../../common/timing-rules/timing-rules.resolver";
import { i18nMessage } from "../i18n";
import { CreateTrustBadgeDto, UpdateTrustBadgeDto } from "./dto";
import {
  localizedJson,
  nullableLocalizedJson,
} from "./helpers/hero-slide.mapper";
import { TRUST_BADGE_REVALIDATE_TAG } from "./helpers/hero.constants";
import {
  toAdminTrustBadgeDto,
  toTrustBadgeDto,
} from "./helpers/trust-badge.mapper";

const TRUST_BADGE_ORDER_BY: Prisma.TrustBadgeOrderByWithRelationInput[] = [
  { displayOrder: "asc" },
  { createdAt: "asc" },
];

/** Metin alanı yaması: `undefined` = dokunma; null ya da iki dili boş = temizle. */
function patchText(
  value: LocalizedText | null | undefined,
): LocalizedText | null | undefined {
  return value === undefined ? undefined : normalizeLocalizedText(value);
}

/**
 * Ana sayfa güven rozetleri — public okuma ve admin yazma yolu (denetim kaydı
 * admin katmanında, `AdminHeroService`). Her yazımdan sonra web'in
 * `home:trust` etiketi tazelenir.
 */
@Injectable()
export class TrustBadgeService {
  private readonly logger = new Logger(TrustBadgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Açık rozetler (public), sırasıyla. Metindeki herkese açık süre
   * belirteçleri (`{returnWindowDays}`) Süreler ve Kurallar'ın güncel
   * değeriyle doldurulur.
   */
  async listLive(): Promise<TrustBadgeDto[]> {
    const badges = await this.prisma.trustBadge.findMany({
      where: { isActive: true },
      orderBy: TRUST_BADGE_ORDER_BY,
    });
    if (badges.length === 0) return [];
    const values = await this.loadTimingValues();
    return badges
      .map((badge) => toTrustBadgeDto(badge, values))
      .filter((badge): badge is TrustBadgeDto => badge !== null);
  }

  /** Admin listesi: pasifler dahil, metin ham (belirteçli). */
  async list(): Promise<AdminTrustBadgeDto[]> {
    const badges = await this.prisma.trustBadge.findMany({
      orderBy: TRUST_BADGE_ORDER_BY,
    });
    return badges.map(toAdminTrustBadgeDto);
  }

  async get(id: string): Promise<AdminTrustBadgeDto> {
    return toAdminTrustBadgeDto(await this.findOrThrow(id));
  }

  async create(dto: CreateTrustBadgeDto): Promise<AdminTrustBadgeDto> {
    const title = normalizeLocalizedText(dto.title);
    // DTO zorunlu alanı doğruladı; açık kontrol tip güvencesi içindir.
    if (!title) {
      throw new BadRequestException(i18nMessage("server.hero.titleRequired"));
    }
    const badge = await this.prisma.trustBadge.create({
      data: {
        icon: dto.icon,
        title: localizedJson(title),
        description: nullableLocalizedJson(
          normalizeLocalizedText(dto.description),
        ),
        // Varsayılanların tek yeri burası (DTO'da başlangıç değeri yok).
        isActive: dto.isActive ?? true,
        hideOnIos: dto.hideOnIos ?? false,
        displayOrder: dto.displayOrder ?? (await this.nextDisplayOrder()),
      },
    });
    this.revalidate();
    return toAdminTrustBadgeDto(badge);
  }

  /** Alan yok (`undefined`) = dokunma; `null` = temizle (yalnız açıklama). */
  async update(
    id: string,
    dto: UpdateTrustBadgeDto,
  ): Promise<AdminTrustBadgeDto> {
    await this.findOrThrow(id);
    const title = patchText(dto.title);
    const badge = await this.prisma.trustBadge.update({
      where: { id },
      data: {
        icon: dto.icon,
        // Zorunlu başlık DTO'da doğrulanır; boşa düşen değer yazılmaz.
        title: title ? localizedJson(title) : undefined,
        description: nullableLocalizedJson(patchText(dto.description)),
        isActive: dto.isActive,
        hideOnIos: dto.hideOnIos,
        displayOrder: dto.displayOrder,
      },
    });
    this.revalidate();
    return toAdminTrustBadgeDto(badge);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.trustBadge.delete({ where: { id } });
    this.revalidate();
  }

  /** Dizi sırası = `displayOrder`. */
  async reorder(ids: string[]): Promise<AdminTrustBadgeDto[]> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.trustBadge.count({
      where: { id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new NotFoundException(i18nMessage("server.hero.trustBadgeNotFound"));
    }
    await this.prisma.$transaction(
      unique.map((id, index) =>
        this.prisma.trustBadge.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    this.revalidate();
    return this.list();
  }

  private async findOrThrow(id: string): Promise<TrustBadge> {
    const badge = await this.prisma.trustBadge.findUnique({ where: { id } });
    if (!badge) {
      throw new NotFoundException(i18nMessage("server.hero.trustBadgeNotFound"));
    }
    return badge;
  }

  private async nextDisplayOrder(): Promise<number> {
    const { _max } = await this.prisma.trustBadge.aggregate({
      _max: { displayOrder: true },
    });
    return (_max.displayOrder ?? -1) + 1;
  }

  /**
   * Süreler okunamazsa kayıt varsayılanlarına düşülür: süre okunamadı diye
   * vitrin rozetsiz kalmaz (bildirim gönderimiyle aynı tercih).
   */
  private async loadTimingValues(): Promise<TimingValues> {
    try {
      return await loadTimingValues(this.prisma);
    } catch (err: unknown) {
      this.logger.warn(
        `trust badges: timing values unavailable, using defaults (${(err as Error)?.message})`,
      );
      return defaultTimingValues();
    }
  }

  private revalidate(): void {
    void notifyWebRevalidate([TRUST_BADGE_REVALIDATE_TAG]);
  }
}
