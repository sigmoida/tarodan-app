import { Injectable, Logger } from "@nestjs/common";
import { PaytrMerchant, Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PAYMENT_PROVIDER_PAYTR } from "../../payment-providers/payment-provider.interface";
import { errorMessage } from "../../../common/helpers/error-message";
import {
  INSTALLMENT_PAYTR_USER_PATH_TIMEOUT_MS,
  INSTALLMENT_RATES_FETCH_LOCK_SECONDS,
  INSTALLMENT_RATES_MAX_AGE_MS,
  INSTALLMENT_RATES_STALE_ALERT_MS,
} from "./installment-config";
import type { InstallmentRateSource } from "./installment-eligibility";
import { InstallmentSettingsService } from "./installment-settings.service";

/** Installments run on the marketplace store only (D6). */
const RATES_MERCHANT = PaytrMerchant.marketplace;

const SNAPSHOT_SELECT = {
  id: true,
  fetchedAt: true,
  singleRatePct: true,
  maxInstallmentNonBusiness: true,
  rates: true,
} satisfies Prisma.InstallmentRateSnapshotSelect;

export type RateRefreshOutcome =
  | "stored"
  /** PayTR did not answer, or answered with an error. */
  | "failed"
  /** Answered, but without a single rate or any family rates: not stored. */
  | "incomplete";

/**
 * The PayTR installment rate table (`taksit-oranlari`) of the marketplace
 * store, as append-only daily snapshots (`installment_rate_snapshots`).
 * "Oranlar gunluk olarak degisebilir": a cron stores one a day, pricing reads
 * the latest, and a snapshot older than 36 h is refreshed on demand once
 * (single flight) or reported unavailable. A snapshot is stored only with the
 * single rate r1 and at least one family row: without them nothing can be
 * priced (fail closed to a single payment).
 */
@Injectable()
export class InstallmentRatesService {
  private readonly logger = new Logger(InstallmentRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly providers: PaymentProviderRegistry,
    private readonly settings: InstallmentSettingsService,
  ) {}

  /** The newest snapshot of the marketplace store, fresh or not. */
  async latest(): Promise<InstallmentRateSource | null> {
    return this.prisma.installmentRateSnapshot.findFirst({
      where: { paytrMerchant: RATES_MERCHANT },
      orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
      select: SNAPSHOT_SELECT,
    });
  }

  /**
   * The snapshot to price from: the latest if younger than 36 h; else one
   * on-demand fetch, bounded by the buyer-path timeout and claimed through a
   * Redis lock so concurrent requests do not all call PayTR. Null =
   * unavailable (the caller offers a single payment).
   */
  async freshSnapshot(
    now: Date = new Date(),
  ): Promise<InstallmentRateSource | null> {
    const latest = await this.latest();
    if (latest && isRateSnapshotFresh(latest, now)) return latest;

    const lockKey = `installments:rates:refresh:${RATES_MERCHANT}`;
    const claim = await this.cache.claimKey(
      lockKey,
      INSTALLMENT_RATES_FETCH_LOCK_SECONDS,
    );
    if (claim !== "claimed") return null;
    const outcome = await this.refresh({
      timeoutMs: INSTALLMENT_PAYTR_USER_PATH_TIMEOUT_MS,
    });
    // The lock is released only after a stored snapshot. A failed or
    // incomplete fetch keeps it until it expires: at most one PayTR call per
    // lock period from the buyer path while PayTR is down (no 3 s wait on
    // every options call).
    if (outcome !== "stored") return null;
    await this.cache.del(lockKey);
    const refreshed = await this.latest();
    return refreshed && isRateSnapshotFresh(refreshed, new Date())
      ? refreshed
      : null;
  }

  /**
   * Fetches the table and stores a snapshot. `request_id` is the snapshot id
   * without hyphens (32 characters), echoed by PayTR. Never throws.
   */
  async refresh(
    options: { timeoutMs?: number } = {},
  ): Promise<RateRefreshOutcome> {
    return Sentry.startSpan(
      { name: "paytr.installment_rates", op: "paytr.installment_rates" },
      async (span) => {
        const outcome = await this.fetchAndStore(options);
        span.setAttribute("outcome", outcome);
        return outcome;
      },
    );
  }

  private async fetchAndStore(options: {
    timeoutMs?: number;
  }): Promise<RateRefreshOutcome> {
    const id = randomUUID();
    const requestId = id.replace(/-/g, "");
    const provider = this.providers.resolve(
      PAYMENT_PROVIDER_PAYTR,
      RATES_MERCHANT,
    );
    const result = await provider.getInstallmentRates(requestId, {
      singleRatio: true,
      timeoutMs: options.timeoutMs,
    });
    if (!result.ok) {
      this.logger.warn(
        `Installment rates not fetched request_id=${requestId}: ${result.errMsg}`,
      );
      return "failed";
    }
    const families = Object.keys(result.rates);
    if (result.singleRatePct === undefined || families.length === 0) {
      this.logger.warn(
        `Installment rates incomplete request_id=${requestId}: single rate ${
          result.singleRatePct === undefined ? "missing" : "present"
        }, ${families.length} families; snapshot not stored`,
      );
      return "incomplete";
    }
    try {
      await this.prisma.installmentRateSnapshot.create({
        data: {
          id,
          paytrMerchant: RATES_MERCHANT,
          fetchedAt: new Date(),
          maxInstallmentNonBusiness: result.maxInstallmentNonBusiness ?? null,
          singleRatePct: new Prisma.Decimal(result.singleRatePct),
          rates: result.rates as Prisma.InputJsonValue,
          raw: result.raw as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Installment rate snapshot id=${id} not stored: ${errorMessage(error)}`,
      );
      return "failed";
    }
    return "stored";
  }

  /**
   * The daily cron (`paytr-installment-rates`). A failed fetch does not fail
   * the run: the alarm is `INSTALLMENT_RATES_STALE` once no snapshot is
   * younger than `INSTALLMENT_RATES_STALE_ALERT_MS`, an error while installments are on (buyers are
   * falling back to single payments), a warning while they are off.
   */
  async runDailyRefresh(log: (msg: string) => void = () => {}) {
    const outcome = await this.refresh();
    log(`PayTR installment rates: ${outcome}`);
    const latest = await this.latest();
    const now = Date.now();
    const stale =
      !latest ||
      now - latest.fetchedAt.getTime() > INSTALLMENT_RATES_STALE_ALERT_MS;
    if (stale) {
      const { enabled } = await this.settings.read();
      const message =
        `INSTALLMENT_RATES_STALE merchant=${RATES_MERCHANT} outcome=${outcome} ` +
        `latest=${latest ? latest.fetchedAt.toISOString() : "none"}`;
      if (enabled) this.logger.error(message);
      else this.logger.warn(message);
    }
    return {
      summary: `rates ${outcome}${stale ? " · STALE" : ""}`,
      stats: { stored: outcome === "stored" ? 1 : 0, stale: stale ? 1 : 0 },
    };
  }
}

/** Younger than 36 h: the one freshness rule (pricing and the admin badge). */
export function isRateSnapshotFresh(
  snapshot: { fetchedAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    now.getTime() - snapshot.fetchedAt.getTime() < INSTALLMENT_RATES_MAX_AGE_MS
  );
}
