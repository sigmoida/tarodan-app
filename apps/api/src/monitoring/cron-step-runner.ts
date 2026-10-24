import type { Logger } from "@nestjs/common";

import { errorMessage } from "../common/helpers/error-message";

/**
 * Thrown at the end of a run when at least one cron step failed.
 * `runTrackedJob` then marks the Bull job failed, so attempts/backoff apply,
 * and a monitored job's Sentry cron check-in is "error".
 */
export class CronStepFailuresError extends Error {
  /**
   * @param alreadyReported true when EVERY failure listed here was already
   *   logged at `error` (with its own id and stack) where it happened. The
   *   run summary then logs at `warn` only (`CronTrackerService`), so one
   *   failure is not two Sentry events. Leave it false when any failure was
   *   logged at `warn` or not at all: the summary is then its only alarm.
   */
  constructor(
    readonly failedSteps: string[],
    readonly details: string[],
    readonly alreadyReported = false,
  ) {
    super(`${failedSteps.length} cron adımı başarısız: ${details.join(" | ")}`);
    this.name = "CronStepFailuresError";
  }
}

/** True for a step-failure summary whose failures were each logged at error. */
export function isAlreadyReportedCronFailure(error: unknown): boolean {
  return error instanceof CronStepFailuresError && error.alreadyReported;
}

export interface CronStepRunner {
  /**
   * Bir adımı izole çalıştırır: hata diğer adımları BLOKLAMAZ, kaydedilir.
   * Adımın dönüş değeri geri verilir; hata durumunda `undefined`.
   */
  step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined>;
  /** Başarısız adım varsa fırlatır — tur sonunda çağrılmalı. */
  assertAllStepsSucceeded(): void;
  readonly failedSteps: string[];
}

/**
 * Step runner for multi-step cron runs.
 *
 * Why: the schedulers wrapped every step in try/catch and swallowed the error
 * (step isolation is a fair goal), but since nothing was THROWN at the end of
 * the run, `runTrackedJob` counted every run as a success: the Bull retry and
 * the cron failure alarm never fired. This runner keeps the isolation and
 * throws one summary error at the end of the run, which restores the signal.
 */
export function createCronStepRunner(params: {
  logger: Logger;
  log?: (msg: string) => void;
}): CronStepRunner {
  const { logger, log } = params;
  const failedSteps: string[] = [];
  const details: string[] = [];

  return {
    failedSteps,
    async step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
      try {
        const result = await fn();
        log?.(`OK ${name}`);
        return result;
      } catch (error: unknown) {
        const message = errorMessage(error);
        logger.error(
          `Step "${name}" failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
        log?.(`HATA ${name}: ${message}`);
        failedSteps.push(name);
        details.push(`${name}: ${message}`);
        return undefined;
      }
    },
    assertAllStepsSucceeded(): void {
      if (failedSteps.length > 0) {
        // Every step above logged its own failure at error.
        throw new CronStepFailuresError([...failedSteps], [...details], true);
      }
    },
  };
}
