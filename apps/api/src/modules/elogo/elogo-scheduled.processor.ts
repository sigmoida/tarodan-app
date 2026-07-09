import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { ElogoSchedulerService } from './elogo-scheduler.service';

/** 'scheduled' kuyruğundaki 'elogo-retry-pending' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class ElogoScheduledProcessor {
  constructor(private readonly scheduler: ElogoSchedulerService) {}

  @Process('elogo-retry-pending')
  async handleRetryPending(job: Job) {
    return runTrackedJob(job, 'elogo-retry-pending', (log) =>
      this.scheduler.runRetryPending(log),
    );
  }
}
