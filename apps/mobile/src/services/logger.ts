import {
  ConsoleSink,
  createLogger,
  type Breadcrumb,
  type LogEntry,
  type LogUser,
  type Logger,
  type Sink,
} from '@tarodan/logger';
import { captureException, captureMessage, setUser } from './sentry';

const LEVEL_MAP = { debug: 'debug', info: 'info', warn: 'warning', error: 'error' } as const;

function sentryMobileSink(): Sink {
  return {
    log: (_e: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) =>
      captureException(err, { extra: ctx }),
    setUser: (user: LogUser | null) => setUser(user),
    addBreadcrumb: (bc: Breadcrumb) =>
      captureMessage(bc.message, bc.level ? LEVEL_MAP[bc.level] : 'info'),
  };
}

export const logger: Logger = createLogger({
  name: 'mobile',
  sinks: [new ConsoleSink(), sentryMobileSink()],
  minLevel: __DEV__ ? 'debug' : 'info',
});
