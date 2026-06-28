import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserService } from './user.service';

/**
 * Featured Scheduler Service
 * Anasayfa "haftanın koleksiyoneri" ve "haftanın şirketi" kazananlarını
 * periyodik olarak yeniden hesaplayıp snapshot'a yazar. Böylece ağır skorlama
 * istek anında değil arka planda çalışır; endpoint'ler sadece snapshot'ı okur.
 *
 * Cadence: günde bir (gece 03:15). Skor 7 günlük kayan pencere kullandığı için
 * günlük tazeleme "haftalık" anlamı korurken kazananın bayatlamasını önler.
 */
@Injectable()
export class FeaturedSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeaturedSchedulerService.name);

  constructor(private readonly userService: UserService) {}

  /**
   * Açılışta snapshot yoksa ilk değerin oluşması için bir kez hesaplar.
   * (Okuma tarafında da fallback var; bu sadece ilk isteği hızlandırır.)
   */
  async onModuleInit() {
    await this.refresh('startup');
  }

  /** Her gün 03:15'te haftalık kazananları yeniden hesaplar. */
  @Cron('15 3 * * *')
  async handleDailyRefresh() {
    await this.refresh('cron');
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
