import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "./constants";

/**
 * API (HTTP) process'i için TÜM kuyrukları SALT-OKUNUR kaydeder — @Processor YOK.
 *
 * Amaç:
 *  1) Bull Board tüm kuyrukları görebilsin (`getQueueToken(name)` ile resolve).
 *  2) API'nin PRODUCER olduğu kuyruklar (email/push/image/moderation ...) kayıtlı
 *     kalsın — WorkerModule AppModule'den çıkınca bu kayıtlar buradan gelir.
 *
 * Bull'da bir kuyruk consumer'ı (bclient) YALNIZ `.process()` çağrılınca açılır;
 * burada hiçbir @Processor olmadığı için API bu kuyrukları TÜKETMEZ — sadece
 * job üretir ve gözlemler. Aynı ismin başka modüllerde de register edilmesi
 * (feature modüllerindeki SCHEDULED/email) zararsızdır: aynı kuyruğa çözümlenir.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.PAYMENT },
      { name: QUEUE_NAMES.SHIPPING },
      { name: QUEUE_NAMES.SEARCH },
      { name: QUEUE_NAMES.ANALYTICS },
      { name: QUEUE_NAMES.MODERATION },
      { name: QUEUE_NAMES.SCHEDULED },
    ),
  ],
  exports: [BullModule],
})
export class QueueMonitorModule {}
