import { ForbiddenException, Injectable } from "@nestjs/common";
import type { MessageKey } from "@tarodan/i18n";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { i18nMessage } from "../i18n";
import { AccountLane, LIVE_LANE, laneOf } from "./account-lane";

const LANE_CACHE_TTL_SECONDS = 300;
export const laneCacheKey = (userId: string) => `account-lane:${userId}`;

/**
 * Kullanıcının şeridini çözer ve iki tarafın aynı şeritte olduğunu doğrular.
 * Yaprak servis: yalnız Prisma/Cache'e bağlıdır; user-block, product ve
 * checkout döngüsüz import eder.
 */
@Injectable()
export class AccountLaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Anonim / bilinmeyen kullanıcı canlı şerittir. */
  async laneOfUser(userId: string | null | undefined): Promise<AccountLane> {
    if (!userId) return LIVE_LANE;
    return this.cache.getOrSet(
      laneCacheKey(userId),
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { isTestAccount: true },
        });
        return laneOf(user);
      },
      { ttl: LANE_CACHE_TTL_SECONDS },
    );
  }

  async isTestLane(userId: string | null | undefined): Promise<boolean> {
    return (await this.laneOfUser(userId)) === "test";
  }

  /** İki taraf farklı şeritte mi? (anonim taraf = canlı) */
  async lanesDiffer(
    a: string | null | undefined,
    b: string | null | undefined,
  ): Promise<boolean> {
    const [la, lb] = await Promise.all([
      this.laneOfUser(a),
      this.laneOfUser(b),
    ]);
    return la !== lb;
  }

  /**
   * Şerit kapısı: canlı ile test hesabı hiçbir işlemde karşı karşıya gelemez
   * (sepet/checkout/teklif/takas/DM). Modüller kendi mesaj anahtarını verir.
   */
  async assertSameLane(
    a: string | null | undefined,
    b: string | null | undefined,
    messageKey: MessageKey = "server.user.laneMismatch",
  ): Promise<void> {
    if (await this.lanesDiffer(a, b)) {
      throw new ForbiddenException(i18nMessage(messageKey));
    }
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.del(laneCacheKey(userId));
  }
}
