import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { ProductLockService } from "./product-lock.service";
import { DiscountModule } from "../discount/discount.module";

/**
 * ProductLockService'i barındıran bağımsız leaf modül. Amaç: payment / order /
 * offer / trade modülleri kilit servisini almak için tüm ProductModule'ü
 * (dolayısıyla payment→product kenarını) import etmek zorunda kalmasın —
 * böylece payment ↔ product ↔ membership döngüsü kırılır.
 *
 * PrismaModule @Global olduğu için ayrıca import edilmez. ProductLockService
 * NotificationService'e bağımlı; Notification bu modüllere geri bağımlı
 * olmadığından yeni döngü oluşmaz.
 */
@Module({
  imports: [NotificationModule, DiscountModule],
  providers: [ProductLockService],
  exports: [ProductLockService],
})
export class ProductLockModule {}
