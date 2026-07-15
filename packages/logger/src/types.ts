export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogUser {
  id: string;
  email?: string;
  username?: string;
}

export interface Breadcrumb {
  category?: string;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  name: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface Sink {
  log(entry: LogEntry): void;
  captureException?(err: unknown, ctx?: Record<string, unknown>): void;
  setUser?(user: LogUser | null): void;
  addBreadcrumb?(bc: Breadcrumb): void;
  flush?(): Promise<void>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  captureException(err: unknown, context?: Record<string, unknown>): void;
  setUser(user: LogUser | null): void;
  setContext(key: string, value: unknown): void;
  child(name: string): Logger;
}
