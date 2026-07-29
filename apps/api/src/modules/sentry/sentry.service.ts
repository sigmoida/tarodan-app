/**
 * Sentry Service
 * Provides methods for error tracking and custom event logging
 */
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";

@Injectable()
export class SentryService {
  /**
   * Capture an exception and send to Sentry
   */
  captureException(exception: Error, context?: Record<string, any>) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
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
