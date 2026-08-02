import type { Logger } from "@nestjs/common";

/**
 * En az bir cron adımı başarısız olduğunda tur sonunda fırlatılan hata.
 * `runTrackedJob` bunu görünce Bull job'ını "failed" işaretler → attempts/backoff
 * çalışır ve Sentry Cron check-in'i "error" olur.
 */
export class CronStepFailuresError extends Error {
  constructor(
    readonly failedSteps: string[],
    readonly details: string[],
  ) {
    super(`${failedSteps.length} cron adımı başarısız: ${details.join(" | ")}`);
    this.name = "CronStepFailuresError";
  }
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
 * Çok adımlı cron turları için adım koşucusu.
 *
 * Şema neden gerekli: scheduler'lar her adımı try/catch ile sarıp hatayı yutuyordu
 * (adım izolasyonu doğru bir hedef) ama tur sonunda hata FIRLATILMADIĞI için
 * `runTrackedJob` her turu başarılı sayıyordu — Bull retry'ı ve Sentry Cron
 * alarmı hiç tetiklenmiyordu. Bu koşucu izolasyonu korur ve turun sonunda
 * toplu hata fırlatarak gözlemlenebilirliği geri verir.
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
        log?.(`✓ ${name}`);
        return result;
      } catch (error: any) {
        const message = String(error?.message ?? error);
        logger.error(`Step "${name}" failed: ${message}`, error?.stack);
        log?.(`✗ ${name}: ${message}`);
        failedSteps.push(name);
        details.push(`${name}: ${message}`);
        return undefined;
      }
    },
    assertAllStepsSucceeded(): void {
      if (failedSteps.length > 0) {
        throw new CronStepFailuresError([...failedSteps], [...details]);
      }
    },
  };
}
