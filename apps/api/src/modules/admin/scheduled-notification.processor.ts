import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { ScheduledNotificationScheduler } from './scheduled-notification.scheduler';

/** 'scheduled' kuyruğundaki 'process-scheduled-notifications' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class ScheduledNotificationProcessor {
  constructor(private readonly scheduler: ScheduledNotificationScheduler) {}

  @Process('process-scheduled-notifications')
  async handle(job: Job) {
    return runTrackedJob(job, 'process-scheduled-notifications', (log) =>
      this.scheduler.runProcessScheduledNotifications(log),
    );
  }
}
