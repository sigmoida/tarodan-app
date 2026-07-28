/**
 * Sentry Interceptor
 * Automatically captures exceptions from HTTP requests
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import * as Sentry from "@sentry/node";
import { getAppLogger } from "../../common/logging/logger";
import { redactSensitive } from "../../common/security/redact-sensitive";

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, params, query, user } = request;

    // Set user context if available
    if (user) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.displayName,
      });
    }

    // Add request context
    Sentry.setContext("request", {
      method,
      url,
      params: redactSensitive(params),
      query: redactSensitive(query),
      body: redactSensitive(body),
    });

    return next.handle().pipe(
      catchError((error) => {
        // Capture exception via the shared logger (bridges to SentryService, avoids double-capture)
        const requestContext = redactSensitive({
          method,
          url,
          params,
          query,
        }) as Record<string, unknown>;

        if (error instanceof HttpException) {
          const status = error.getStatus();

          // Only capture 5xx errors as exceptions
          if (status >= 500) {
            getAppLogger().captureException(error, requestContext);
          }
        } else {
          // Capture all non-HTTP exceptions
          getAppLogger().captureException(error, requestContext);
        }

        return throwError(() => error);
      }),
    );
  }
}
