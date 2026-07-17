import {
  LEVEL_ORDER,
  type LogEntry,
  type LogLevel,
  type Logger,
  type LogUser,
  type Sink,
} from "./types";

interface CreateLoggerOptions {
  name: string;
  sinks: Sink[];
  minLevel?: LogLevel;
  baseContext?: Record<string, unknown>;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const { name, sinks } = opts;
  const minLevel = opts.minLevel ?? "debug";
  const context: Record<string, unknown> = { ...(opts.baseContext ?? {}) };

  const enabled = (level: LogLevel) =>
    LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];

  function emit(
    level: LogLevel,
    message: string,
    callCtx?: Record<string, unknown>,
    skipCapture = false,
  ): void {
    if (!enabled(level)) return;
    const merged = { ...context, ...(callCtx ?? {}) };
    const error = merged.error;
    const entry: LogEntry = {
      level,
      message,
      name,
      timestamp: timestamp(),
      context: Object.keys(merged).length ? merged : undefined,
      error,
    };
    for (const sink of sinks) {
      sink.log(entry);
      if (
        !skipCapture &&
        level === "error" &&
        error !== undefined &&
        sink.captureException
      ) {
        sink.captureException(error, merged);
      } else if (level !== "error" && sink.addBreadcrumb) {
        sink.addBreadcrumb({ category: name, message, level, data: callCtx });
      }
    }
  }

  const logger: Logger = {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    captureException: (err, c) => {
      for (const sink of sinks) sink.captureException?.(err, c);
      emit("error", errorMessage(err), { ...c, error: err }, true);
    },
    setUser: (user: LogUser | null) => {
      for (const sink of sinks) sink.setUser?.(user);
    },
    setContext: (key, value) => {
      context[key] = value;
    },
    child: (childName: string) =>
      createLogger({
        ...opts,
        name: `${name}:${childName}`,
        baseContext: { ...context },
      }),
  };
  return logger;
}

// Note: uses Date.now directly; test environment uses real time.
function timestamp(): number {
  return Date.now();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
