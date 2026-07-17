import type { Breadcrumb, LogEntry, LogUser, Sink } from './types';

const LEVEL_MAP: Record<string, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

/** Minimal surface provided by the platform SDK (Sentry). */
export interface SentryLike {
  captureException(err: unknown, opts?: { extra?: Record<string, unknown> }): void;
  addBreadcrumb(bc: { category?: string; message: string; level?: string; data?: Record<string, unknown> }): void;
  setUser(user: LogUser | null): void;
}

/**
 * Takes the SDK as a parameter — this package imports no @sentry/*.
 * Compatible with @sentry/nextjs (web+admin) and @sentry/react-native.
 */
export function createSentrySink(sentry: SentryLike): Sink {
  return {
    log: (_entry: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) =>
      sentry.captureException(err, ctx ? { extra: ctx } : undefined),
    setUser: (user: LogUser | null) => sentry.setUser(user),
    addBreadcrumb: (bc: Breadcrumb) =>
      sentry.addBreadcrumb({
        category: bc.category,
        message: bc.message,
        level: bc.level ? LEVEL_MAP[bc.level] : undefined,
        data: bc.data,
      }),
  };
}
