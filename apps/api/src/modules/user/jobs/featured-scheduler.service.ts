import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { UserService } from "../user.service";

/**
 * Featured Scheduler Service
 * Anasayfa "haftanın koleksiyoneri" ve "haftanın şirketi" kazananlarını
 * periyodik olarak yeniden hesaplayıp snapshot'a yazar. Böylece ağır skorlama
 * istek anında değil arka planda çalışır; endpoint'ler sadece snapshot'ı okur.
 *
 * Cadence: günde bir (gece 03:15). Skor 7 günlük kayan pencere kullandığı için
 * günlük tazeleme "haftalık" anlamı korurken kazananın bayatlamasını önler.
 *
 * Faz 7.5: Bull tek zamanlama mekanizması ('featured-refresh' repeatable job).
 */
@Injectable()
export class FeaturedSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeaturedSchedulerService.name);

  constructor(
    private readonly userService: UserService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  /**
   * Açılışta snapshot yoksa ilk değerin oluşması için bir kez hesaplar (okuma
   * tarafında da fallback var). Ayrıca Bull repeatable kaydı (Faz 7).
   */
  async onModuleInit() {
    await this.refresh("startup");
    await registerRepeatableCron(
      this.scheduledQueue,
      "featured-refresh",
      "15 3 * * *",
      this.logger,
    );
  }

  /**
   * Her gün 03:15'te haftalık kazananları yeniden hesaplar.
   * Gerçek iş — Bull processor 'featured-refresh' buradan çağırır.
   */
  async runDailyRefresh(log: (msg: string) => void = () => {}) {
    await this.refresh("cron");
    log("Featured snapshots refreshed");
    return {
      summary: "Featured snapshots refreshed",
      stats: {} as Record<string, number>,
    };
  }

  private async refresh(trigger: string) {
    try {
      await this.userService.refreshFeaturedSnapshots();
      this.logger.log(`Featured snapshots refreshed (${trigger})`);
    } catch (error: any) {
      this.logger.error(
        `Featured snapshot refresh failed (${trigger}): ${error.message}`,
        error.stack,
      );
    }
  }
}
