import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { i18nMessage } from "../../i18n";

/**
 * UserEngagementService — seller storefront view tracking (leaf; prisma + cache).
 * Mirrors ProductEngagementService.incrementViewCount: skip self-views, filter
 * bots, and rate-limit per viewer/IP so a single visitor cannot inflate the
 * counter beyond one increment per window (30 min).
 */
@Injectable()
export class UserEngagementService {
  private readonly logger = new Logger(UserEngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Increment seller storefront view counter.
   * POST /users/:id/view
   * Only seller accounts are tracked; self-views, bots, and repeat views inside
   * the rate-limit window are silently ignored (return current count).
   */
  async incrementStoreViewCount(
    sellerId: string,
    viewerId?: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{ storeViewCount: number }> {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        isSeller: true,
        isBanned: true,
        deletedAt: true,
        storeViewCount: true,
      },
    });

    if (!seller || seller.deletedAt) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    if (!seller.isSeller || seller.isBanned) {
      throw new BadRequestException(i18nMessage("server.user.notSeller"));
    }

    if (viewerId && viewerId === sellerId) {
      return { storeViewCount: seller.storeViewCount };
    }

    if (this.isBot(userAgent)) {
      return { storeViewCount: seller.storeViewCount };
    }

    const identifier = viewerId || clientIp || "unknown";
    const rateLimitKey = `storeViewCount:${sellerId}:${identifier}`;
    try {
      const { allowed } = await this.cache.checkRateLimit(
        rateLimitKey,
        1,
        1800,
      );
      if (!allowed) {
        return { storeViewCount: seller.storeViewCount };
      }
    } catch {
      // Redis down — fall through and count the view.
    }

    const updated = await this.prisma.user.update({
      where: { id: sellerId },
      data: { storeViewCount: { increment: 1 } },
      select: { storeViewCount: true },
    });

    return { storeViewCount: updated.storeViewCount };
  }

  private isBot(userAgent?: string): boolean {
    if (!userAgent) return true;
    const botPatterns = [
      "bot",
      "crawler",
      "spider",
      "scraper",
      "curl",
      "wget",
      "python-requests",
      "java/",
      "go-http-client",
      "libwww",
      "httpunit",
      "nutch",
      "linkwalker",
      "archiver",
      "fetch",
      "slurp",
      "yandex",
      "bingbot",
      "googlebot",
      "baiduspider",
    ];
    const ua = userAgent.toLowerCase();
    return botPatterns.some((pattern) => ua.includes(pattern));
  }
}
