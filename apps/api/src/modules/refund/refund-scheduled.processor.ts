import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { RefundSchedulerService } from './refund-scheduler.service';

/** 'scheduled' kuyruğundaki 'refund-crons' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class RefundScheduledProcessor {
  constructor(private readonly scheduler: RefundSchedulerService) {}

  @Process('refund-crons')
  async handle(job: Job) {
    return runTrackedJob(job, 'refund-crons', (log) => this.scheduler.runRefundCrons(log));
  }
}
