import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { cronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import type { CronRunSummary } from '../../monitoring/cron-run.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { UserService } from './user.service';

/** In-process cron ile Bull repeatable'ın aynı zamanlamayı paylaşması için tek kaynak. */
const FEATURED_REFRESH_CRON = '15 3 * * *';

/**
 * Featured Scheduler Service
 * Anasayfa "haftanın koleksiyoneri" ve "haftanın şirketi" kazananlarını
 * periyodik olarak yeniden hesaplayıp snapshot'a yazar. Böylece ağır skorlama
 * istek anında değil arka planda çalışır; endpoint'ler sadece snapshot'ı okur.
 *
 * Cadence: günde bir (gece 03:15). Skor 7 günlük kayan pencere kullandığı için
 * günlük tazeleme "haftalık" anlamı korurken kazananın bayatlamasını önler.
 *
 * Dual-mode: `CRONS_VIA_BULL` açıkken günlük tazeleme Bull repeatable üzerinden
 * (FeaturedScheduledProcessor) tek-sefer koşar; kapalıyken in-process @TrackedCron.
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
    await this.refresh('startup');
    // Günlük tazelemeyi flag durumuna göre Bull repeatable'a senkronla.
    await registerRepeatableCron(
      this.scheduledQueue,
      'featured-daily-refresh',
      FEATURED_REFRESH_CRON,
      cronsViaBull(),
      this.logger,
    );
  }

  /** Her gün 03:15'te haftalık kazananları yeniden hesaplar. */
  @TrackedCron(FEATURED_REFRESH_CRON)
  async handleDailyRefresh() {
    if (cronsViaBull()) {
      return;
    }
    await this.runDailyRefresh();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runDailyRefresh(log: (msg: string) => void = () => {}): Promise<CronRunSummary> {
    await this.refresh('cron', log);
    return { summary: 'featured snapshot yenilendi' };
  }

  private async refresh(trigger: string, log: (msg: string) => void = () => {}) {
    try {
      await this.userService.refreshFeaturedSnapshots();
      this.logger.log(`Featured snapshots refreshed (${trigger})`);
      log(`snapshot yenilendi (${trigger})`);
    } catch (error: any) {
      this.logger.error(
        `Featured snapshot refresh failed (${trigger}): ${error.message}`,
        error.stack,
      );
      log(`HATA (${trigger}): ${error.message}`);
    }
  }
}
