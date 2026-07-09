import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { FeaturedSchedulerService } from './featured-scheduler.service';

/** 'scheduled' kuyruğundaki 'featured-daily-refresh' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class FeaturedScheduledProcessor {
  constructor(private readonly scheduler: FeaturedSchedulerService) {}

  @Process('featured-daily-refresh')
  async handleDailyRefresh(job: Job) {
    return runTrackedJob(job, 'featured-daily-refresh', (log) =>
      this.scheduler.runDailyRefresh(log),
    );
  }
}
