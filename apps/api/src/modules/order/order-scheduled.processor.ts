import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { OrderSchedulerService } from './order-scheduler.service';

/** 'scheduled' kuyruğundaki 'order-auto-complete' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class OrderScheduledProcessor {
  constructor(private readonly scheduler: OrderSchedulerService) {}

  @Process('order-auto-complete')
  async handle(job: Job) {
    return runTrackedJob(job, 'order-auto-complete', (log) =>
      this.scheduler.runAutoCompleteConfirmedOrders(log),
    );
  }
}
