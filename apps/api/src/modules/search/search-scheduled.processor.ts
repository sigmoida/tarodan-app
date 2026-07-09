import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { SearchService } from './search.service';

/**
 * 'scheduled' kuyruğundaki search cron işleri:
 * search-periodic-sync (5-dk sayı bazlı drift) + search-hourly-reconcile
 * (saatlik ID bazlı tam reconcile) — ikisi de ES↔DB delta sync.
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class SearchScheduledProcessor {
  constructor(private readonly search: SearchService) {}

  @Process('search-periodic-sync')
  async handle(job: Job) {
    return runTrackedJob(job, 'search-periodic-sync', (log) =>
      this.search.runHandlePeriodicSync(log),
    );
  }

  @Process('search-hourly-reconcile')
  async handleHourlyReconcile(job: Job) {
    return runTrackedJob(job, 'search-hourly-reconcile', (log) =>
      this.search.runHandleHourlyReconcile(log),
    );
  }
}
