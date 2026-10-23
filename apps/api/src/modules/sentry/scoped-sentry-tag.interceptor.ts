import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Type,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Observable } from "rxjs";

/**
 * Tags a request's Sentry events with a feature, on a scope of its own.
 *
 * `Sentry.setTag` writes to whatever isolation scope is current. When the
 * request has not forked one, that is the process-wide default scope, and the
 * tag then rode on every later event, cron runs included. Here the handler runs
 * inside its own isolation scope, so the tag lives and dies with the request.
 *
 * The subscription happens inside the callback on purpose: the handler starts
 * on subscribe, and only code started there sees the scope.
 */
export function scopedSentryTag(tag: {
  key: string;
  value: string;
}): Type<NestInterceptor> {
  @Injectable()
  class ScopedSentryTagInterceptor implements NestInterceptor {
    intercept(
      _context: ExecutionContext,
      next: CallHandler,
    ): Observable<unknown> {
      return new Observable((subscriber) => {
        Sentry.withIsolationScope((scope) => {
          scope.setTag(tag.key, tag.value);
          next.handle().subscribe(subscriber);
        });
      });
    }
  }
  return ScopedSentryTagInterceptor;
}
