import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { runTrackedJob } from '../../monitoring/cron-run.helper';
import { MembershipSchedulerService } from './membership-scheduler.service';

/**
 * 'scheduled' kuyruğundaki membership cron işleri:
 * downgrades / reminders / monthly-offers (para-dışı) + auto-renewals (kart çekimi).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class MembershipScheduledProcessor {
  constructor(private readonly scheduler: MembershipSchedulerService) {}

  @Process('membership-expired-downgrades')
  async handleDowngrades(job: Job) {
    return runTrackedJob(job, 'membership-expired-downgrades', (log) =>
      this.scheduler.runProcessExpiredDowngrades(log),
    );
  }

  @Process('membership-expiration-reminders')
  async handleReminders(job: Job) {
    return runTrackedJob(job, 'membership-expiration-reminders', (log) =>
      this.scheduler.runSendExpirationReminders(log),
    );
  }

  @Process('membership-monthly-offers')
  async handleMonthlyOffers(job: Job) {
    return runTrackedJob(job, 'membership-monthly-offers', (log) =>
      this.scheduler.runSendMonthlyPremiumOffers(log),
    );
  }

  @Process('membership-auto-renewals')
  async handleAutoRenewals(job: Job) {
    return runTrackedJob(job, 'membership-auto-renewals', (log) =>
      this.scheduler.runProcessAutoRenewals(log),
    );
  }
}
