import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import { PrismaService } from "../../prisma/prisma.service";

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "passwordHash",
  "passwordConfirm",
  "newPassword",
  "oldPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "resetToken",
  "verifyToken",
  "confirmToken",
  "idToken",
  "secret",
  "apiKey",
  "apiSecret",
  "clientSecret",
  "signingKey",
  "creditCard",
  "cardNumber",
  "cvv",
  "cvc",
  "pin",
  "otp",
]);

function redactBody(obj: any, depth = 0): any {
  if (depth > 5 || obj === null || obj === undefined || typeof obj !== "object")
    return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactBody(v, depth + 1));
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      SENSITIVE_BODY_KEYS.has(k) ? "[GİZLİ]" : redactBody(v, depth + 1),
    ]),
  );
}

@Injectable()
export class ErrorLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        this.logError(context, error);
        return throwError(() => error);
      }),
    );
  }

  private async logError(context: ExecutionContext, error: any) {
    const request = context.switchToHttp().getRequest();
    if (!request) return; // Not an HTTP request

    const { method, url, body, user, headers } = request;
    const status = error.status || 500;

    if (status < 400) return;

    // Resolve human-readable severity
    let severity: string;
    if (status >= 500) severity = "error";
    else if (status === 401 || status === 403) severity = "warning";
    else severity = "warning";

    // Build cause chain so nested errors are visible
    const causes: string[] = [];
    let cause = error.cause;
    while (cause && causes.length < 5) {
      causes.push(cause?.message ?? String(cause));
      cause = cause?.cause;
    }

    // Pull response detail from NestJS HttpException if available
    let responseDetail: any;
    if (typeof error.getResponse === "function") {
      try {
        responseDetail = error.getResponse();
      } catch {
        /* ignore */
      }
    }

    // req.ip esas: `trust proxy` ayarlı, Express doğru istemciyi çözer.
    // Ham XFF'in ilk girdisi istemci kontrolündedir — loglanan IP'ye göre
    // engelleme yapıldığı için sahte başlıkla masum bir IP suçlanabilirdi.
    const ipAddress = request.ip || request.socket?.remoteAddress;

    try {
      await (this.prisma as any).errorLog.create({
        data: {
          severity,
          message: error.message || "Unknown error",
          stackTrace: error.stack,
          source: "api",
          endpoint: `${method} ${url}`,
          userId: user?.id ?? user?.sub,
          metadata: {
            status,
            name: error.name,
            ...(causes.length > 0 && { causes }),
            ...(responseDetail && { response: responseDetail }),
            ip: ipAddress,
            userAgent: headers?.["user-agent"],
            body: method !== "GET" ? redactBody(body) : undefined,
          },
        },
      });
    } catch (logError) {
      this.logger.error(`Failed to log error to database: ${logError.message}`);
    }
  }
}
