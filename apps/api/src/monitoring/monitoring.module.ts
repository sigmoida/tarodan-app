import { Global, Module } from "@nestjs/common";
import { CronTrackerService } from "./cron-tracker.service";

/**
 * Global izleme modülü — CronTrackerService'i tek instance olarak sağlar.
 * @Global olduğu için CronTracker tek instance olarak paylaşılır.
 */
@Global()
@Module({
  providers: [CronTrackerService],
  exports: [CronTrackerService],
})
export class MonitoringModule {}
