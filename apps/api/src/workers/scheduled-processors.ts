import type { Provider } from "@nestjs/common";
import { runsQueueWorkers } from "../process-role";

/**
 * `scheduled` kuyruğu processor'larını ROLE göre kaydeder.
 *
 * Neden gerekli: `PROCESS_ROLE=web` yalnız `WorkerModule`'ü kapatıyordu; `scheduled`
 * processor'ları her zaman yüklenen feature modüllerinin provider'ı olduğu için bir
 * `web` replikası tüm cron'lar için TÜKETİCİ oluyordu — tam-tablo skor hesapları ve
 * gerçek PayTR para transferleri HTTP process'inde koşuyordu. Provider hiç
 * oluşturulmazsa Bull tüketicisi de bağlanmaz; işler Redis'te bekler ve worker
 * process'i alır (kayıp olmaz).
 *
 * Not: repeatable job KAYDI (registerRepeatableCron) rolden bağımsız olarak devam
 * eder — idempotenttir ve zamanlamanın her ortamda senkron kalmasını sağlar.
 */
export function scheduledProcessors(...providers: Provider[]): Provider[] {
  return runsQueueWorkers() ? providers : [];
}
