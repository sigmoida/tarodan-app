import { Global, Module } from '@nestjs/common';
import { CronTrackerService } from './cron-tracker.service';

/**
 * Global izleme modülü — CronTrackerService'i tek instance olarak sağlar.
 * @Global olduğu için her modüldeki @TrackedCron aynı tracker'ı kullanır.
 */
@Global()
@Module({
  providers: [CronTrackerService],
  exports: [CronTrackerService],
})
export class MonitoringModule {}
