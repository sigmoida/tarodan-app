import {
  ConsoleSink,
  createLogger,
  type Breadcrumb,
  type LogEntry,
  type LogUser,
  type Logger,
  type Sink,
} from '@tarodan/logger';
import { addBreadcrumb, captureException, setUser, type SeverityLevel } from './sentry';

const LEVEL_MAP = { debug: 'debug', info: 'info', warn: 'warning', error: 'error' } as const;

function sentryMobileSink(): Sink {
  return {
    log: (_e: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) => {
      const { tags, level, ...extra } = ctx ?? {};
      captureException(err, {
        ...(level ? { level: level as SeverityLevel } : {}),
        ...(tags ? { tags: tags as Record<string, string> } : {}),
        extra,
      });
    },
    setUser: (user: LogUser | null) => setUser(user),
    addBreadcrumb: (bc: Breadcrumb) =>
      addBreadcrumb({
        category: bc.category,
        message: bc.message,
        level: bc.level ? LEVEL_MAP[bc.level] : undefined,
        data: bc.data,
      }),
  };
}

export const logger: Logger = createLogger({
  name: 'mobile',
  sinks: [new ConsoleSink(), sentryMobileSink()],
  minLevel: __DEV__ ? 'debug' : 'info',
});
