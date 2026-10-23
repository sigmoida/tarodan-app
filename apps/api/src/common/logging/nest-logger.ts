import type { LoggerService } from "@nestjs/common";
import { getRequestId } from "../context/request-context";
import { errorMessage } from "../helpers/error-message";
import { attachFingerprint, buildErrorFingerprint } from "./error-fingerprint";
import { attachReportKey, buildErrorReportKey } from "./error-report-key";
import { getAppLogger } from "./logger";

const QUIET_CONTEXTS = new Set(["RouterExplorer", "RoutesResolver"]);

/**
 * Nest LoggerService bridge. Existing `new Logger(Context)` calls continue to
 * work, but Nest routes them through the shared structured logger and Sentry
 * sink configured by SentryModule.
 */
export class AppNestLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  private write(
    level: "debug" | "info" | "warn" | "error",
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const params = [...optionalParams];
    const context =
      typeof params.at(-1) === "string" ? String(params.pop()) : "Nest";

    if (
      process.env.NEST_VERBOSE_ROUTES !== "true" &&
      QUIET_CONTEXTS.has(context)
    ) {
      return;
    }

    const logger = getAppLogger().child(context);
    const text =
      message instanceof Error ? message.message : stringify(message);
    const details = params.length > 0 ? params : undefined;
    // Aynı isteğin tüm satırları tek kimlikle bağlansın; istek bağlamı dışında
    // (cron/worker) alan hiç eklenmez.
    const requestId = getRequestId();

    if (level === "error") {
      const suppliedError =
        (message instanceof Error ? message : undefined) ??
        params.find((item): item is Error => item instanceof Error);
      const error = suppliedError ?? new Error(text);
      const stack = params.find(
        (item): item is string =>
          typeof item === "string" &&
          item.includes("\n") &&
          item.includes("at "),
      );
      if (stack && !suppliedError) error.stack = stack;
      // Sentry gruplamasını (§ error-fingerprint.ts) context+mesaja göre
      // sabitle: aksi halde stack her zaman burada bittiği için ilgisiz
      // hatalar tek issue'da eriyor.
      const identity = {
        context,
        errorName: suppliedError?.name,
        message: text,
      };
      attachFingerprint(error, buildErrorFingerprint(identity));
      // A cron or retry loop logs the same failure of the same entity every
      // run; Sentry gets it once per window (§ error-report-key.ts), the
      // console line below still records every occurrence. In
      // `logger.error("PayTR refund error:", err)` the reason and the entity
      // are in the error, not in the text: without it every new reason would
      // hide behind the first one for the whole window. `errorMessage`
      // renders a localized exception's catalog key, whose `.message` is only
      // "Bad Request Exception" for every reason.
      const keyedText = !suppliedError
        ? text
        : suppliedError === message
          ? errorMessage(suppliedError)
          : `${text} ${errorMessage(suppliedError)}`;
      attachReportKey(
        error,
        buildErrorReportKey({ ...identity, message: keyedText }),
      );
      logger.error(text, { error, details, ...(requestId && { requestId }) });
      return;
    }

    logger[level](
      text,
      details || requestId
        ? { ...(details && { details }), ...(requestId && { requestId }) }
        : undefined,
    );
  }
}

function stringify(message: unknown): string {
  if (typeof message === "string") return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}
