import type { LogEntry, Sink } from "./types";

/** Pretty biçimde seviye sütunu — sabit genişlik, göz taramasında hizalı kalır. */
const LABEL: Record<string, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

export type ConsoleFormat = "pretty" | "json";

export interface ConsoleSinkOptions {
  /**
   * `pretty` (varsayılan): insan okur — `SS:dd:ss SEVİYE [Bağlam] mesaj`.
   * `json`: satır başına saf JSON — log toplayıcı (Loki/ELK) için.
   */
  format?: ConsoleFormat;
  /** @deprecated `format: "json"` kullanın. Geriye uyumluluk için korunur. */
  json?: boolean;
}

export class ConsoleSink implements Sink {
  private readonly format: ConsoleFormat;

  constructor(options: ConsoleSinkOptions = {}) {
    this.format = options.format ?? (options.json ? "json" : "pretty");
  }

  log(entry: LogEntry): void {
    if (this.format === "json") {
      console.log(JSON.stringify(entry));
      return;
    }
    // requestId neredeyse her istek satırında var: uuid'li bir obje eki her
    // satırı kirletirdi. Kısa önek satıra gömülür; tam kimlik JSON kipinde ve
    // error_logs'ta durur, gözle takipte ilk 8 karakter yeterlidir.
    const { requestId, ...rest } = entry.context ?? {};
    const reqTag =
      typeof requestId === "string" ? ` req=${requestId.slice(0, 8)}` : "";
    const prefix = `${clock(entry.timestamp)} ${
      LABEL[entry.level] ?? entry.level
    } [${entry.name}]`;
    const args: unknown[] = [`${prefix} ${entry.message}${reqTag}`];
    if (Object.keys(rest).length) args.push(rest);
    if (entry.level === "error") console.error(...args);
    else if (entry.level === "warn") console.warn(...args);
    else console.log(...args);
  }

  // Console sink does not produce breadcrumbs/captureException — log() is enough.
}

/** Yerel saat HH:MM:SS — tarih yok: konteyner logları zaten güne göre bölünür. */
function clock(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
