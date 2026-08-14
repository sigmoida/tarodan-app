import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma";

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
  // Bildirim satırları (zil + e-posta/push teslimat izleri) süresiz birikiyordu:
  // her sipariş/teklif/takas olayı satır yazıyor ama hiçbir şey silmiyordu.
  // 180 günden eski bildirim zilde de aranmaz; env ile ayarlanabilir.
  notification: 180,
} as const;

/** Bildirim saklama süresi env ile ezilebilir (gün). */
const notificationRetentionDays = (): number =>
  Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS) ||
  RETENTION_DAYS.notification;

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
    const [error, security, email, notification] = await Promise.all([
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
      // TÜM kanallar silinir (in_app dahil): 180 günden eski zil bildirimi
      // kullanıcı için de arşiv değeri taşımaz, teslimat izi de denetim izi
      // değildir (o audit_logs'ta).
      this.purge("notification", () =>
        this.prisma.notificationLog.deleteMany({
          where: {
            createdAt: { lt: this.cutoff(notificationRetentionDays()) },
          },
        }),
      ),
    ]);

    return { error, security, email, notification };
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
