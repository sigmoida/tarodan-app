import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  WarehouseAddressService,
  type ResolvedWarehouseAddress,
} from "../../shipping/warehouse/warehouse-address.service";

/**
 * Takas yönetimi (safe-trade / depo escrow) için gruplar-arası paylaşılan
 * yardımcı(lar) — AdminTradeService'ten birebir taşındı. Depo adresi çözümü
 * hem onay/red (warehouse) hem de stuck force-cancel (resolution) akışlarında
 * kullanıldığı için burada toplanır. Warehouse ve resolution alt servisleri
 * buraya delege eder. Döngü yok: yalnız WarehouseAddressService'e bağımlı.
 */
@Injectable()
export class AdminTradeCommonService {
  constructor(private readonly warehouseAddress: WarehouseAddressService) {}

  /**
   * Resolve the platform warehouse address used as `fromAddressId` for outbound
   * and return shipments.
   *
   * Çözümleme ve hata davranışı `WarehouseAddressService`'e taşındı — aynı depo
   * artık kargo payload'ındaki GÖNDERİCİ alanını da beslediği için tek kaynaktan
   * okunmak zorunda. Bu metot yalnız id isteyen çağıranlar için ince bir cephe
   * olarak kalıyor (imzası korunuyor, dolayısıyla çağıranlar değişmiyor).
   */
  async resolveWarehouseAddressId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    return this.warehouseAddress.resolveId(tx);
  }

  /**
   * Depo adresinin TAM alanları — kargo payload'ında depo GÖNDERİCİ olduğunda
   * gerekir (depo → kullanıcı çıkış, red iadesi, kayıp iadesi). Asla throw etmez:
   * ayar satırı yoksa env metnine düşer, böylece eksik bir ayar takası kilitlemez.
   */
  async resolveWarehouseAddress(
    tx?: Prisma.TransactionClient,
  ): Promise<ResolvedWarehouseAddress> {
    return this.warehouseAddress.resolve(tx);
  }
}
