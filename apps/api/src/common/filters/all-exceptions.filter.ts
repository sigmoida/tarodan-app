import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { STATUS_CODES } from "http";
import {
  type Locale,
  type MessageKey,
  type MessageValues,
} from "@tarodan/i18n";
import { getRequestId } from "../context/request-context";
import { I18nService } from "../../modules/i18n/i18n.service";
import { isLocalizedMessage } from "../../modules/i18n/localized-message";
import { resolveRequestLocale } from "../../modules/i18n/locale.util";
import { errorStack } from "../helpers/error-message";

/**
 * Global exception filter (issue #70, i18n: #224).
 *
 * Goals:
 *  - HttpExceptions carrying a catalog key (thrown via `i18nMessage(...)`) are
 *    rendered in the request's locale; the body keeps the
 *    `{ statusCode, message, error }` contract and adds `i18nKey`.
 *  - Plain HttpExceptions pass through UNCHANGED — intentional 4xx status codes
 *    and their messages are preserved, so existing behavior does not shift.
 *  - Known Prisma errors that would otherwise surface as an opaque 500 (or leak
 *    a DB message) are mapped to a clean 4xx with a localized catalog message.
 *  - Anything else becomes a sanitized 500: the client sees a generic localized
 *    message, never an internal `error.message`, stack, SQL, or file path. Full
 *    detail is logged server-side (and persisted by ErrorLogInterceptor).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const locale = this.requestLocale(request);

    // 1) Intentional HTTP exceptions.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // 1a) Catalog-key payload (#224) — render in the request's locale. Extra
      // payload fields (e.g. errorCode, bannedReason) are preserved so guards
      // can keep their structured contracts alongside the localized message.
      if (isLocalizedMessage(res)) {
        const { i18nKey, i18nParams, ...extras } = res as Record<
          string,
          unknown
        > & {
          i18nKey: MessageKey;
          i18nParams?: MessageValues;
        };
        for (const [k, v] of Object.entries(extras)) {
          extras[k] = this.renderNested(v, locale);
        }
        response.status(status).json({
          statusCode: status,
          message: this.i18n.translate(i18nKey, locale, i18nParams),
          error: STATUS_CODES[status] ?? "Error",
          i18nKey,
          ...extras,
        });
        return;
      }

      // 1b) Plain payload — reproduce Nest's default body verbatim so the
      // existing `{ statusCode, message, error }` contract is untouched.
      const body =
        typeof res === "object" && res !== null
          ? res
          : {
              statusCode: status,
              message: res,
              error: STATUS_CODES[status] ?? "Error",
            };
      response.status(status).json(body);
      return;
    }

    // 2+3) Prisma / unknown — resolve to a sanitized status + catalog message.
    const { status, key, params } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // 5xx: keep the full cause server-side, send nothing internal to the client.
      this.logger.error(
        `${request?.method} ${request?.url} -> ${status}`,
        errorStack(exception),
      );
    }

    // Sansürlenmiş yanıtta istemciye kalan TEK iz korelasyon kimliğidir:
    // kullanıcı destek talebinde bu kodu söyler, operatör aynı kimlikle konsol
    // satırlarını ve error_logs kaydını bulur. Kasıtlı 4xx gövdeleri (yukarıda
    // erken dönenler) değişmez — mevcut sözleşme korunur.
    const requestId = getRequestId();
    response.status(status).json({
      statusCode: status,
      message: this.i18n.translate(key, locale, params),
      error: STATUS_CODES[status] ?? "Error",
      i18nKey: key,
      ...(requestId && { requestId }),
    });
  }

  /**
   * Render localized-message payloads nested one level inside extra payload
   * fields (values or arrays of them), e.g. a `errors: [i18nMessage(...)]`
   * list of blocking reasons. Anything else passes through untouched.
   */
  private renderNested(value: unknown, locale: Locale): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this.renderNested(v, locale));
    }
    if (isLocalizedMessage(value)) {
      return this.i18n.translate(value.i18nKey, locale, value.i18nParams);
    }
    return value;
  }

  /** The locale attached by LocaleInterceptor, or resolved on the spot. */
  private requestLocale(request: Request): Locale {
    const attached = (request as Request & { locale?: Locale })?.locale;
    return attached ?? resolveRequestLocale(request ?? {});
  }

  private resolve(exception: unknown): {
    status: number;
    key: MessageKey;
    params?: MessageValues;
  } {
    // Known Prisma errors — map to a clean 4xx with a localized message.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P2002": // unique constraint violation
          return {
            status: HttpStatus.CONFLICT,
            key: "server.common.recordExists",
          };
        case "P2025": // record required but not found
          return {
            status: HttpStatus.NOT_FOUND,
            key: "server.common.recordNotFound",
          };
        case "P2003": // foreign key constraint violation
          return {
            status: HttpStatus.CONFLICT,
            key: "server.common.relatedRecordsConflict",
          };
        default:
          // Unmapped Prisma error is still an internal problem — sanitize it.
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            key: "server.common.internalError",
          };
      }
    }

    if (
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        key: "server.common.internalError",
      };
    }

    // 3) Anything else — sanitized 500, no internal detail in the response.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      key: "server.common.internalError",
    };
  }
}
