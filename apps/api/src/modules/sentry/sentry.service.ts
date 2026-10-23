/**
 * Sentry Service
 * Provides methods for error tracking and custom event logging
 */
import { Injectable, Optional } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { readFingerprint } from "../../common/logging/error-fingerprint";
import { takeReportKey } from "../../common/logging/error-report-key";
import { SentryReportThrottle } from "./sentry-report-throttle";

@Injectable()
export class SentryService {
  constructor(@Optional() private readonly throttle?: SentryReportThrottle) {}

  /**
   * Capture an exception and send to Sentry.
   *
   * An error log line carries a repeat-report key (`AppNestLogger`): it is
   * sent once per key per window, so a cron failing the same way every run
   * stops burning the quota. Errors without a key (HTTP 5xx from
   * `SentryInterceptor`, worker crashes) are always sent: their frequency is
   * what the 5xx-spike alert counts.
   */
  captureException(exception: Error, context?: Record<string, unknown>) {
    const reportKey = takeReportKey(exception);
    if (!reportKey || !this.throttle) {
      this.send(exception, context);
      return;
    }
    void this.throttle
      .shouldReport(reportKey)
      .then((report) => {
        if (report) this.send(exception, context, reportKey);
      })
      // The throttle never rejects; if it ever does, report rather than drop.
      .catch(() => this.send(exception, context, reportKey));
  }

  private send(
    exception: Error,
    context?: Record<string, unknown>,
    reportKey?: string,
  ) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      // AppNestLogger her hata için context+mesaja göre bir fingerprint
      // iliştirir (bkz. error-fingerprint.ts); varsa Sentry'nin varsayılan
      // stack-tabanlı gruplamasının yerine geçer.
      const fingerprint = readFingerprint(exception);
      if (fingerprint) scope.setFingerprint(fingerprint);
      // Searchable as `reportKey:<hash>`: the events of one throttled key.
      if (reportKey) scope.setTag("reportKey", reportKey);
      Sentry.captureException(exception);
    });
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
    Sentry.captureMessage(message, level);
  }

  /**
   * Set user context for all subsequent events
   */
  setUser(user: { id: string; email?: string; username?: string }) {
    Sentry.setUser(user);
  }

  /**
   * Clear user context
   */
  clearUser() {
    Sentry.setUser(null);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Set tag for filtering
   */
  setTag(key: string, value: string) {
    Sentry.setTag(key, value);
  }

  /**
   * Start a transaction for performance monitoring
   */
  startTransaction(name: string, op: string): Sentry.Span {
    return Sentry.startInactiveSpan({ name, op, forceTransaction: true });
  }

  /**
   * Create a span within a transaction
   */
  startSpan(transaction: Sentry.Span, op: string, description: string) {
    return Sentry.startInactiveSpan({
      name: description,
      op,
      parentSpan: transaction,
    });
  }

  /**
   * Capture a custom event
   */
  captureEvent(event: Sentry.Event) {
    Sentry.captureEvent(event);
  }

  /**
   * Flush pending events
   */
  async flush(timeout = 2000): Promise<boolean> {
    return Sentry.flush(timeout);
  }
}
