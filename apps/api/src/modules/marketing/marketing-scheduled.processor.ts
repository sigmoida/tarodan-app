import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { MarketingSchedulerService } from './marketing-scheduler.service';

/** 'scheduled' kuyruğundaki marketing işlerini çalıştırır (haftalık/aylık). */
@Processor(QUEUE_NAMES.SCHEDULED)
export class MarketingScheduledProcessor {
  constructor(private readonly scheduler: MarketingSchedulerService) {}

  @Process('marketing-weekly')
  async handleWeekly(job: Job) {
    return runTrackedJob(job, 'marketing-weekly', (log) => this.scheduler.runSendWeeklyNewsletter(log));
  }

  @Process('marketing-monthly')
  async handleMonthly(job: Job) {
    return runTrackedJob(job, 'marketing-monthly', (log) => this.scheduler.runSendMonthlyPromotions(log));
  }
}
