import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";

/**
 * Oturumlar sunucuda düşürüldüğünde (tüm cihazlardan çıkış, parola
 * sıfırlama, hesap yasaklama) kullanıcının push token'larını pasifleştirir —
 * oturumu kapanan cihaz bildirim almaya devam etmesin.
 *
 * Satırlar SİLİNMEZ, `isActive=false` olur (tek cihaz çıkışındaki
 * `ExpoPushProvider.deactivateToken` ile aynı semantik). Cihaz yeniden giriş
 * yaptığında istemci token'ı tekrar kaydeder ve upsert onu yeniden açar.
 *
 * Yaprak modülde durur (yalnız Prisma): SecurityModule ← WebSocketModule ←
 * NotificationModule zinciri yüzünden güvenlik tarafı NotificationModule'ü
 * içe aktaramaz.
 */
@Injectable()
export class PushTokenRevocationService {
  private readonly logger = new Logger(PushTokenRevocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kullanıcının tüm aktif push token'larını pasifleştirir. Bir transaction
   * içinden çağrılıyorsa `client` o transaction'dır — oturum iptaliyle aynı
   * anda kesinleşir.
   */
  async deactivateAllForUser(
    userId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { count } = await client.pushToken.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    if (count > 0) {
      this.logger.log(`Deactivated ${count} push token(s) for user ${userId}`);
    }
    return count;
  }
}
