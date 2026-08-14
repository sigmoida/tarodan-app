import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { isTest } from "../../config/environment";

/**
 * Admin'in engellediği IP'lerden gelen istekleri reddeder.
 *
 * Engel listesi = çözülmemiş `security_logs` satırları (eventType: "ip_block").
 * "IP Engelle" ucu eskiden yalnız bu satırı yazıyordu ve hiçbir şey onu
 * okumuyordu — kayıt vardı, uygulama yoktu. Engeli kaldırmak = kaydı çözmek
 * (resolve); ayrı bir unblock ucu yok.
 *
 * - Liste 60 sn bellekte tutulur (tek satırlık sorgu her istekte atılmasın);
 *   testte cache kapalıdır ki senaryolar deterministik kalsın.
 * - Admin yüzeyi (/api/admin, /api/auth/admin) MUAFTIR: engel ancak oradan
 *   kaldırılabilir, super_admin kendi IP'sini engellerse kalıcı kilitlenmemeli.
 *   (O yüzey zaten admin oturumuyla korunuyor.)
 * - DB hatasında fail-open: API'yi düşürmek, engellememekten pahalı.
 */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class BlockedIpGuard implements CanActivate {
  private readonly logger = new Logger(BlockedIpGuard.name);
  private cache: { ips: Set<string>; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req) return true;

    const url: string = req.originalUrl ?? req.url ?? "";
    const path = url.split("?")[0].toLowerCase();
    if (path.startsWith("/api/admin") || path.startsWith("/api/auth/admin")) {
      return true;
    }

    const ip = this.clientIp(req);
    if (!ip) return true;

    const blocked = await this.loadBlockedIps();
    if (blocked.has(ip)) {
      throw new ForbiddenException("Erişim engellendi");
    }
    return true;
  }

  /**
   * `req.ip` esas alınır — main.ts `trust proxy` ayarladığı için Express bunu
   * güvenilen proxy zincirinden doğru çözer. Ham X-Forwarded-For'un İLK girdisi
   * BİLEREK okunmaz: o girdi istemci kontrolündedir (nginx istemcinin
   * gönderdiği başlığa ekleme yapar), engelli istemci sahte başlıkla kaçar,
   * temiz istemci sahte başlıkla suçlanabilirdi.
   */
  private clientIp(req: any): string | null {
    return req.ip || req.socket?.remoteAddress || null;
  }

  private async loadBlockedIps(): Promise<Set<string>> {
    const now = Date.now();
    const ttl = isTest() ? 0 : CACHE_TTL_MS;
    if (this.cache && now - this.cache.at < ttl) return this.cache.ips;

    try {
      const rows = await this.prisma.securityLog.findMany({
        where: { eventType: "ip_block", resolved: false },
        select: { ipAddress: true },
      });
      const ips = new Set(
        rows.map((r) => r.ipAddress).filter((v): v is string => !!v),
      );
      this.cache = { ips, at: now };
      return ips;
    } catch (error) {
      this.logger.warn(
        `Engelli IP listesi okunamadı (fail-open): ${
          error instanceof Error ? error.message : error
        }`,
      );
      return this.cache?.ips ?? new Set();
    }
  }
}
