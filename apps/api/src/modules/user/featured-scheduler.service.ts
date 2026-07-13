import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import type { CronRunSummary } from "../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { UserService } from "./user.service";

/** Bull repeatable kaydının zamanlaması (tek kaynak). */
const FEATURED_REFRESH_CRON = "15 3 * * *";

/**
 * Featured Scheduler Service
 * Anasayfa "haftanın koleksiyoneri" ve "haftanın şirketi" kazananlarını
 * periyodik olarak yeniden hesaplayıp snapshot'a yazar. Böylece ağır skorlama
 * istek anında değil arka planda çalışır; endpoint'ler sadece snapshot'ı okur.
 *
 * Cadence: günde bir (gece 03:15). Skor 7 günlük kayan pencere kullandığı için
 * günlük tazeleme "haftalık" anlamı korurken kazananın bayatlamasını önler.
 *
 * Günlük tazeleme Bull repeatable üzerinden (FeaturedScheduledProcessor) worker'da
 * tek-sefer koşar.
 */
@Injectable()
export class FeaturedSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeaturedSchedulerService.name);

  constructor(
    private readonly userService: UserService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit() {
    // Açılışta snapshot yoksa ilk değerin oluşması için bir kez hesapla.
    // (Okuma tarafında da fallback var; bu sadece ilk isteği hızlandırır.)
    await this.refresh("startup");
    // Günlük tazelemeyi Bull repeatable olarak kaydet (worker tüketir).
    await registerRepeatableCron(
      this.scheduledQueue,
      "featured-daily-refresh",
      FEATURED_REFRESH_CRON,
      this.logger,
    );
  }

  /**
   * Her gün 03:15'te haftalık kazananları yeniden hesaplar.
   * Gerçek iş — Bull processor (ve manuel tetik) buradan çağırır.
   */
  async runDailyRefresh(
    log: (msg: string) => void = () => {},
  ): Promise<CronRunSummary> {
    const r = await this.refresh("cron", log);
    return {
      summary: r.errors
        ? "Error: featured snapshot refresh failed"
        : `collector=${r.collector} · company=${r.business}`,
      stats: { collector: r.collector, business: r.business, errors: r.errors },
    };
  }

  private async refresh(
    trigger: string,
    log: (msg: string) => void = () => {},
  ): Promise<{ collector: number; business: number; errors: number }> {
    try {
      const r = await this.userService.refreshFeaturedSnapshots();
      this.logger.log(
        `Featured snapshots refreshed (${trigger}): collector=${r.collector} business=${r.business}`,
      );
      log(
        `snapshot refreshed (${trigger}): collector=${r.collector} company=${r.business}`,
      );
      return { collector: r.collector, business: r.business, errors: 0 };
    } catch (error: any) {
      this.logger.error(
        `Featured snapshot refresh failed (${trigger}): ${error.message}`,
        error.stack,
      );
      log(`ERROR (${trigger}): ${error.message}`);
      return { collector: 0, business: 0, errors: 1 };
    }
  }
}
