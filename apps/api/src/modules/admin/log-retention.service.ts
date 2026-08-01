import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";

/**
 * Log saklama süreleri (gün). Operasyonel gürültü kısa tutulur; güvenlik
 * olayları incelenebilecek kadar uzun kalır.
 *
 * DENETİM İZİ (`audit_logs`) BİLEREK BURADA YOK: "kim neyi ne zaman
 * değiştirdi"nin tek kaydı odur, hacmi düşüktür (yalnız admin aksiyonları) ve
 * durability sözleşmesiyle korunur — süreyle silinmez.
 */
const RETENTION_DAYS = {
  error: 30,
  security: 180,
  email: 90,
} as const;

export type LogPurgeCounts = Record<keyof typeof RETENTION_DAYS, number>;

/**
 * Yaşı geçen log satırlarını siler. Hiçbir log tablosunda temizlik yoktu;
 * `error_logs` en hızlı büyüyendi çünkü interceptor 400+ HER yanıtı stack
 * trace ve redakte gövdeyle yazıyor.
 */
@Injectable()
export class LogRetentionService {
  private readonly logger = new Logger(LogRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purgeExpiredLogs(): Promise<LogPurgeCounts> {
    const [error, security, email] = await Promise.all([
      this.purge("error", () =>
        this.prisma.errorLog.deleteMany({
          where: { createdAt: { lt: this.cutoff(RETENTION_DAYS.error) } },
        }),
      ),
      this.purge("security", () =>
        this.prisma.securityLog.deleteMany({
          where: {
            createdAt: { lt: this.cutoff(RETENTION_DAYS.security) },
            // ÇÖZÜLMEMİŞ ip_block satırları AKTİF ENGEL LİSTESİDİR
            // (BlockedIpGuard bunlardan beslenir): yaşa bakılmaksızın korunur,
            // yoksa her IP engeli 180 günde sessizce kalkardı. Engel kaldırma
            // kararı admin'indir (kaydı çözmek); çözülen kayıt normal saklama
            // süresine tabi olur.
            NOT: { eventType: "ip_block", resolved: false },
          },
        }),
      ),
      this.purge("email", () =>
        this.prisma.emailLog.deleteMany({
          where: { createdAt: { lt: this.cutoff(RETENTION_DAYS.email) } },
        }),
      ),
    ]);

    return { error, security, email };
  }

  private cutoff(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  /** Bir tablonun hatası diğerlerinin temizliğini engellemez. */
  private async purge(
    table: string,
    run: () => Promise<{ count: number }>,
  ): Promise<number> {
    try {
      const { count } = await run();
      return count;
    } catch (error) {
      this.logger.warn(
        `${table} log temizliği başarısız: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return 0;
    }
  }
}
