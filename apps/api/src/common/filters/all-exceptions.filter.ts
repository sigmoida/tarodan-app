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

/**
 * Global exception filter (issue #70).
 *
 * Goals:
 *  - HttpExceptions pass through UNCHANGED — intentional 4xx status codes and
 *    their (already static, localized) messages are preserved, so existing
 *    behavior/assertions do not shift.
 *  - Known Prisma errors that would otherwise surface as an opaque 500 (or leak
 *    a DB message) are mapped to a clean 4xx with a static message.
 *  - Anything else becomes a sanitized 500: the client sees a generic message,
 *    never an internal `error.message`, stack, SQL, or file path. Full detail is
 *    logged server-side (and persisted by ErrorLogInterceptor).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1) Intentional HTTP exceptions — reproduce Nest's default body verbatim so
    // the existing `{ statusCode, message, error }` contract is untouched.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
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

    // 2+3) Prisma / unknown — resolve to a sanitized status + static message.
    const { status, message } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // 5xx: keep the full cause server-side, send nothing internal to the client.
      this.logger.error(
        `${request?.method} ${request?.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: STATUS_CODES[status] ?? "Error",
    });
  }

  private resolve(exception: unknown): { status: number; message: string } {
    // Known Prisma errors — map to a clean 4xx with a static message.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P2002": // unique constraint violation
          return { status: HttpStatus.CONFLICT, message: "Kayıt zaten mevcut" };
        case "P2025": // record required but not found
          return { status: HttpStatus.NOT_FOUND, message: "Kayıt bulunamadı" };
        case "P2003": // foreign key constraint violation
          return {
            status: HttpStatus.CONFLICT,
            message: "İşlem ilişkili kayıtlar nedeniyle tamamlanamadı",
          };
        default:
          // Unmapped Prisma error is still an internal problem — sanitize it.
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Sunucu hatası",
          };
      }
    }

    if (
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Sunucu hatası",
      };
    }

    // 3) Anything else — sanitized 500, no internal detail in the response.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Sunucu hatası",
    };
  }
}
