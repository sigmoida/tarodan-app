import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { OfferSchedulerService } from './offer-scheduler.service';

/** 'scheduled' kuyruğundaki 'expire-offers' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class OfferScheduledProcessor {
  constructor(private readonly scheduler: OfferSchedulerService) {}

  @Process('expire-offers')
  async handleExpireOffers(job: Job) {
    return runTrackedJob(job, 'expire-offers', (log) =>
      this.scheduler.runHandleExpiredOffers(log),
    );
  }
}
