import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Takas yönetimi (safe-trade / depo escrow) için gruplar-arası paylaşılan
 * yardımcı(lar) — AdminTradeService'ten birebir taşındı. Depo adresi çözümü
 * hem onay/red (warehouse) hem de stuck force-cancel (resolution) akışlarında
 * kullanıldığı için burada toplanır. Warehouse ve resolution alt servisleri
 * buraya delege eder. Leaf: enjeksiyon yok (çağıran tx'i geçirir), döngü yok.
 */
@Injectable()
export class AdminTradeCommonService {
  /**
   * Resolve the platform warehouse address used as `fromAddressId` for
   * outbound and return shipments. First tries PlatformSetting key
   * `warehouse_address_id`; falls back to the first address of any active
   * admin user. Throws if no warehouse address can be determined.
   */
  async resolveWarehouseAddressId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const setting = await tx.platformSetting.findUnique({
      where: { settingKey: 'warehouse_address_id' },
    });
    if (setting?.settingValue) {
      const addr = await tx.address.findUnique({
        where: { id: setting.settingValue },
        select: { id: true },
      });
      if (addr) return addr.id;
    }

    // Fallback: any active admin user's first address
    const admin = await tx.adminUser.findFirst({
      where: { isActive: true },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      const fallback = await tx.address.findFirst({
        where: { userId: admin.userId },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }

    throw new BadRequestException(
      'Depo adresi yapılandırılmamış. Lütfen `warehouse_address_id` platform ayarını tanımlayın.',
    );
  }
}
