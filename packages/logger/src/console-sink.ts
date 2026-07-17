import type { LogEntry, Sink } from './types';

const LABEL: Record<string, string> = {
  debug: '🔍 DEBUG',
  info: 'ℹ️  INFO',
  warn: '⚠️  WARN',
  error: '❌ ERROR',
};

export interface ConsoleSinkOptions {
  json?: boolean;
}

export class ConsoleSink implements Sink {
  constructor(private readonly options: ConsoleSinkOptions = {}) {}

  log(entry: LogEntry): void {
    if (this.options.json) {
      console.log(JSON.stringify(entry));
      return;
    }
    const prefix = `${LABEL[entry.level] ?? entry.level} [${entry.name}]`;
    const args: unknown[] = [prefix, entry.message];
    if (entry.context && Object.keys(entry.context).length) args.push(entry.context);
    if (entry.level === 'error') console.error(...args);
    else if (entry.level === 'warn') console.warn(...args);
    else console.log(...args);
  }

  // Console sink does not produce breadcrumbs/captureException — log() is enough.
}
